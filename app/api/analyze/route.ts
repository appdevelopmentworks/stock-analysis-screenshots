export const runtime = 'edge'

import { AnalysisSchema } from '@/lib/schema'
import { visionExtractionPrompt, decisionPrompt, getPrompts, type PromptProfile } from '@/lib/prompts'
import { normalizeOrderbook, sanitizeSR, validateDecision, checkPlanConsistency, enforceOrderbookTicks } from '@/lib/validation'

type OrderbookLevel = { price: number; bid?: number; ask?: number }

export async function POST(req: Request) {
  const form = await req.formData()
  const metaRaw = form.get('meta')
  const meta = typeof metaRaw === 'string' ? safeJson(metaRaw) : {}
  const files = form.getAll('files') as File[]

  const groqKey = req.headers.get('x-api-key') || ''
  const openaiKey = req.headers.get('x-openai-key') || ''
  const wantsStream = (req.headers.get('x-stream') === '1')

  // If no keys, return stub to keep UX smooth.
  if (!groqKey && !openaiKey) {
    const resp = stubResponse(files.length, meta)
    if (wantsStream) return streamStub(resp)
    return Response.json(resp)
  }

  // Convert images to data URLs (base64) for OpenAI-compatible vision chat
  const images: string[] = []
  for (const f of files) {
    const buf = await f.arrayBuffer()
    const b64 = arrayBufferToBase64(buf)
    const mime = f.type || 'image/png'
    images.push(`data:${mime};base64,${b64}`)
  }

  const promptProfile: PromptProfile = (meta?.promptProfile ?? 'default') as any
  const pp = getPrompts(promptProfile)

  // 1) Vision extraction via Groq (preferred)
  let extractionJSON: any | null = null
  let extractionErr: string | null = null
  try {
    const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': groqKey,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
        messages: [
          { role: 'system', content: pp.vision },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract normalized JSON. Hints: market=${meta?.market ?? 'JP'} timeframe=${meta?.timeframe ?? ''}` },
              ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
        temperature: pp.temps.vision,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) extractionErr = `groq vision ${res.status}`
    const data = await res.json().catch(() => ({}))
    const content = data?.choices?.[0]?.message?.content ?? '{}'
    extractionJSON = safeJson(content)
    // sanitize numeric SR and orderbook
    const market = (meta?.market ?? 'JP') as any
    const sr = sanitizeSR(extractionJSON?.levels?.sr ?? {}, market)
    const ob = normalizeOrderbook(extractionJSON?.orderbook ?? {}, market)
    const enforced = enforceOrderbookTicks(ob, market)
    extractionJSON = { ...extractionJSON, levels: { ...(extractionJSON?.levels ?? {}), sr }, orderbook: { ...ob, levels: enforced.levels, _tickAdjusted: enforced.adjusted } }
  } catch (e) {
    extractionJSON = null
    extractionErr = (e as any)?.message || 'extraction error'
  }

  if (wantsStream) {
    return streamPhases(async (send, progress) => {
      progress(10, 'extraction:start')
      if (extractionErr) send('log', { stage: 'extraction', error: extractionErr })
      send('extraction', { extracted: extractionJSON?.extracted ?? {}, levels: extractionJSON?.levels ?? {}, orderbook: extractionJSON?.orderbook ?? {} })
      progress(55, extractionErr ? 'extraction:error' : 'extraction:done')
      const { data: final, error: decErr } = await computeDecision(meta, groqKey, openaiKey, extractionJSON, req)
      if (decErr) send('log', { stage: 'decision', error: decErr })
      progress(85, decErr ? 'decision:error' : 'decision:ready')
      send('decision', final)
      progress(100, 'done')
    })
  }

  // 2) Decision summarization (Groq text), fallback to OpenAI if provided
  let finalJSON: any | null = null
  const decisionInput = {
    meta,
    extracted: extractionJSON?.extracted ?? {},
    sr: extractionJSON?.levels?.sr ?? { support: [], resistance: [] },
    orderbook: extractionJSON?.orderbook ?? {},
  }
  try {
    const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': groqKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: pp.decision },
          { role: 'user', content: JSON.stringify(decisionInput) },
        ],
        temperature: pp.temps.decision,
        response_format: { type: 'json_object' },
      }),
    })
    const data = await res.json().catch(() => ({}))
    const content = data?.choices?.[0]?.message?.content ?? '{}'
    finalJSON = safeJson(content)
  } catch (e) {
    finalJSON = null
  }

  if (!finalJSON && openaiKey) {
    // Fallback to OpenAI (gpt-4o-mini)
    try {
      const res = await fetch(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': openaiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: pp.decision },
            { role: 'user', content: JSON.stringify(decisionInput) },
          ],
          temperature: pp.temps.decision,
          response_format: { type: 'json_object' },
        }),
      })
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      finalJSON = safeJson(content)
    } catch (e) {
      finalJSON = null
    }
  }

  // Validate and return
  if (finalJSON) {
    const parsed = AnalysisSchema.safeParse(finalJSON)
    if (parsed.success) {
      return Response.json(parsed.data)
    }
  }

  // If model outputs unusable or failed, return graceful stub with hints
  const fallback = stubResponse(files.length, meta)
  if (extractionJSON) {
    fallback.notes.push('抽出JSONの解析に失敗したためスタブ返却')
  } else {
    fallback.notes.push('抽出に失敗（キー/モデル/レスポンス確認）')
  }
  return Response.json(fallback)
}

function safeJson(s: string) {
  try { return JSON.parse(s) } catch { return {} }
}

function stubResponse(imageCount: number, meta: any) {
  return {
    decision: 'hold',
    horizon: meta?.horizon ?? 'intraday',
    rationale: [
      'キー未設定またはモデル応答の整形に失敗したため簡易応答',
      `受領画像: ${imageCount}枚`,
      '明確な優位性が未確定のため様子見',
    ],
    levels: { sr: { support: [], resistance: [] } },
    orderbook: { spread: null, imbalance: null, pressure: 'neutral', levels: [] as OrderbookLevel[] },
    extracted: { ticker: meta?.ticker ?? null, market: meta?.market ?? 'JP', timeframe: meta?.timeframe ?? '15m' },
    confidence: 0.3,
    notes: ['/api/analyze はフェイルセーフでスタブ返却中']
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  // btoa is available in Edge runtime
  return btoa(binary)
}

function originFromReq(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

async function computeDecision(meta: any, groqKey: string, openaiKey: string, extractionJSON: any, req: Request): Promise<{ data: any | null, error: string | null }> {
  let finalJSON: any | null = null
  let error: string | null = null
  const decisionInput = {
    meta,
    extracted: extractionJSON?.extracted ?? {},
    sr: extractionJSON?.levels?.sr ?? { support: [], resistance: [] },
    orderbook: extractionJSON?.orderbook ?? {},
  }
  try {
    const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': groqKey,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: decisionPrompt },
          { role: 'user', content: JSON.stringify(decisionInput) },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) error = `groq text ${res.status}`
    const data = await res.json().catch(() => ({}))
    const content = data?.choices?.[0]?.message?.content ?? '{}'
    finalJSON = safeJson(content)
  } catch (e) {
    finalJSON = null
    error = (e as any)?.message || 'decision error'
  }

  if (!finalJSON && openaiKey) {
    try {
      const res = await fetch(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': openaiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: decisionPrompt },
            { role: 'user', content: JSON.stringify(decisionInput) },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) error = `openai ${res.status}`
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      finalJSON = safeJson(content)
    } catch (e) {
      finalJSON = null
      error = (e as any)?.message || 'openai decision error'
    }
  }

  if (finalJSON) {
    const market = (meta?.market ?? 'JP') as any
    finalJSON = validateDecision(finalJSON, market)
    finalJSON = checkPlanConsistency(finalJSON, market)
  }
  return { data: finalJSON, error }
}

function streamPhases(run: (send: (event: string, data: any) => void, progress: (pct: number, msg?: string) => void) => Promise<void>) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = (obj: any) => controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`)
      const send = (event: string, data: any) => enc({ event, data })
      const progress = (pct: number, msg?: string) => enc({ event: 'progress', pct, msg })
      try {
        enc({ event: 'start' })
        progress(0, 'start')
        await run(send, progress)
        enc({ event: 'end' })
      } catch (e: any) {
        enc({ event: 'error', message: e?.message || 'stream error' })
      } finally {
        controller.close()
      }
    }
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    }
  })
}

function streamStub(resp: any) {
  return streamPhases(async (send) => {
    send('extraction', { note: 'stub' })
    send('decision', resp)
  })
}
