export const runtime = 'edge'

import { AnalysisSchema } from '@/lib/schema'
import { visionExtractionPrompt, decisionPrompt, getPrompts, getUiHints, defaultOpenAIModel, type PromptProfile } from '@/lib/prompts'
import { normalizeOrderbook, sanitizeSR, validateDecision, checkPlanConsistency, enforceOrderbookTicks, analyzeOrderbookGaps, consistencyScore } from '@/lib/validation'

type OrderbookLevel = { price: number; bid?: number; ask?: number }

export async function POST(req: Request) {
  const form = await req.formData()
  const metaRaw = form.get('meta')
  const meta = typeof metaRaw === 'string' ? safeJson(metaRaw) : {}
  const files = form.getAll('files') as File[]

  const groqKey = req.headers.get('x-api-key') || ''
  const openaiKey = req.headers.get('x-openai-key') || ''
  const openrouterKey = req.headers.get('x-openrouter-key') || ''
  const wantsStream = (req.headers.get('x-stream') === '1')

  // If no keys, return stub to keep UX smooth.
  if (!groqKey && !openaiKey && !openrouterKey) {
    const resp = stubResponse(files.length, meta)
    if (wantsStream) return streamStub(resp)
    return new Response(JSON.stringify(resp), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }

  // Convert images to data URLs (base64) for OpenAI-compatible vision chat
  const images: string[] = []
  for (const f of files) {
    const buf = await f.arrayBuffer()
    const b64 = arrayBufferToBase64(buf)
    const mime = f.type || 'image/png'
    images.push(`data:${mime};base64,${b64}`)
  }

  let promptProfile: PromptProfile = (meta?.promptProfile ?? 'default') as any
  let pp = getPrompts(promptProfile)
  const visionSelected = (meta?.model ?? meta?.openaiModel) as string | undefined
  let openaiModel = ((visionSelected === 'auto' || !visionSelected) ? defaultOpenAIModel(meta?.profile) : visionSelected) as string
  try { console.log('[analyze] meta.provider', meta?.provider, 'model', openaiModel) } catch {}

  // 1) Vision extraction（ユーザ設定のproviderを優先）
  let extractionJSON: any | null = null
  let extractionErr: string | null = null
  let visionProvider: 'groq' | 'openai' | 'openrouter' | 'none' = 'none'
  const preferOpenAI = meta?.provider === 'openai'
  let preferOpenRouter = meta?.provider === 'openrouter'
  const groqKeyLooksValid = !!groqKey && /^gsk_[A-Za-z0-9_\-]{10,}/.test(groqKey)
  try { console.log('[analyze] preferOpenAI', preferOpenAI, 'preferOpenRouter', preferOpenRouter) } catch {}

  // Pre-Vision heuristic: if profile is auto, run a quick classifier to detect fundamentals
  if (promptProfile === 'auto' && (openaiKey || openrouterKey) && files.length > 0) {
    try {
      const first = files[0]
      const buf = await first.arrayBuffer()
      const b64 = arrayBufferToBase64(buf)
      const mime = first.type || 'image/png'
      const imgUrl = `data:${mime};base64,${b64}`
      const classifyPayload: any = {
        model: openaiModel,
        messages: [
          { role: 'system', content: 'Classify screenshot type. Return ONLY JSON {"kind":"fundamentals"|"technical","confidence":number(0..1)}.' },
          { role: 'user', content: [ { type: 'text', text: 'Is this primarily earnings/KPI fundamentals (売上/営業益/EPS/YoY/配当 etc.) or trading/technical (板/チャート/SR)? Respond with kind and confidence.' }, { type: 'image_url', image_url: { url: imgUrl } } ] }
        ],
        response_format: { type: 'json_object' },
      }
      let classifyRes: Response | null = null
      if (preferOpenRouter && openrouterKey) {
        if (!openAIModelRequiresDefaultTemp(openaiModel)) classifyPayload.temperature = 0.1
        classifyRes = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openrouter?endpoint=/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json','x-openrouter-key':openrouterKey }, body: JSON.stringify(classifyPayload) }, { retries: 0, timeoutMs: 10000 })
      } else if (openaiKey) {
        if (!openAIModelRequiresDefaultTemp(openaiModel)) classifyPayload.temperature = 0.1
        classifyRes = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json','x-api-key':openaiKey }, body: JSON.stringify(classifyPayload) }, { retries: 0, timeoutMs: 8000 })
      } else if (openrouterKey) {
        if (!openAIModelRequiresDefaultTemp(openaiModel)) classifyPayload.temperature = 0.1
        classifyRes = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openrouter?endpoint=/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json','x-openrouter-key':openrouterKey }, body: JSON.stringify(classifyPayload) }, { retries: 0, timeoutMs: 10000 })
      }
      const clsData = await classifyRes!.json().catch(() => ({}))
      const cls = safeJson(clsData?.choices?.[0]?.message?.content ?? '{}')
      if (cls?.kind === 'fundamentals' && (typeof cls?.confidence === 'number' ? cls.confidence >= 0.6 : true)) {
        promptProfile = 'fundamentals'
        pp = getPrompts('fundamentals')
        if (openrouterKey) {
          preferOpenRouter = true
          // iOS（SSE無効時）をざっくり判定: wantsStream=false をiOS相当として扱う
          openaiModel = wantsStream ? 'anthropic/claude-sonnet-4' : 'google/gemini-2.5-pro'
        }
        try { console.log('[analyze] pre-heuristic -> fundamentals, model', openaiModel) } catch {}
      }
    } catch {}
  }
  if (!preferOpenAI && !preferOpenRouter && groqKeyLooksValid) {
    try {
      const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': groqKey,
        },
        body: JSON.stringify({
          model: 'llama-3.2-11b-vision-preview',
          messages: [
            { role: 'system', content: pp.vision + (meta?.uiSource ? "\n" + getUiHints(meta.uiSource) : '') },
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
      try { console.log('[analyze] vision(groq) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) {
        extractionErr = `groq vision ${res.status}`
        try { const t = await res.text(); console.log('[analyze] vision(groq) body', t.slice(0, 500)) } catch {}
      }
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      try { console.log('[analyze] vision(groq) contentLen', (content || '{}').length) } catch {}
      extractionJSON = safeJson(content)
      visionProvider = 'groq'
      const market = (meta?.market ?? 'JP') as any
      const sr = sanitizeSR(extractionJSON?.levels?.sr ?? {}, market)
      const ob = normalizeOrderbook(extractionJSON?.orderbook ?? {}, market)
      const enforced = enforceOrderbookTicks(ob, market)
      const gaps = analyzeOrderbookGaps({ levels: enforced.levels }, market)
      extractionJSON = { ...extractionJSON, levels: { ...(extractionJSON?.levels ?? {}), sr }, orderbook: { ...ob, levels: enforced.levels, _tickAdjusted: enforced.adjusted, _irregularGaps: gaps.irregular } }
    } catch (e) {
      extractionJSON = null
      extractionErr = (e as any)?.message || 'extraction error'
    }
  } else if (preferOpenRouter && openrouterKey) {
    // OpenRouter path (explicitly selected)
    try {
      const visionPayload: any = {
        model: openaiModel,
        messages: [
          { role: 'system', content: pp.vision + (meta?.uiSource ? "\n" + getUiHints(meta.uiSource) : '') },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract normalized JSON. Hints: market=${meta?.market ?? 'JP'} timeframe=${meta?.timeframe ?? ''}` },
              ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }
      if (!openAIModelRequiresDefaultTemp(openaiModel)) visionPayload.temperature = pp.temps.vision
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openrouter?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-openrouter-key': openrouterKey },
        body: JSON.stringify(visionPayload),
      })
      try { console.log('[analyze] vision(openrouter) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) extractionErr = `openrouter vision ${res.status}`
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      try { console.log('[analyze] vision(openrouter) contentLen', (content || '{}').length) } catch {}
      extractionJSON = safeJson(content)
      visionProvider = 'openrouter'
      const market = (meta?.market ?? 'JP') as any
      const sr = sanitizeSR(extractionJSON?.levels?.sr ?? {}, market)
      const ob = normalizeOrderbook(extractionJSON?.orderbook ?? {}, market)
      const enforced = enforceOrderbookTicks(ob, market)
      const gaps = analyzeOrderbookGaps({ levels: enforced.levels }, market)
      extractionJSON = { ...extractionJSON, levels: { ...(extractionJSON?.levels ?? {}), sr }, orderbook: { ...ob, levels: enforced.levels, _tickAdjusted: enforced.adjusted, _irregularGaps: gaps.irregular } }
    } catch (e) {
      extractionJSON = null
      extractionErr = (e as any)?.message || 'extraction error'
    }
  } else if (openaiKey && !preferOpenRouter) {
    // OpenAI-only path
    try {
      const visionPayload: any = {
        model: openaiModel,
        messages: [
          { role: 'system', content: pp.vision + (meta?.uiSource ? "\n" + getUiHints(meta.uiSource) : '') },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract normalized JSON. Hints: market=${meta?.market ?? 'JP'} timeframe=${meta?.timeframe ?? ''}` },
              ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }
      if (!openAIModelRequiresDefaultTemp(openaiModel)) visionPayload.temperature = pp.temps.vision
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': openaiKey },
        body: JSON.stringify(visionPayload),
      })
      try { console.log('[analyze] vision(openai) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) extractionErr = `openai vision ${res.status}`
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      try { console.log('[analyze] vision(openai) contentLen', (content || '{}').length) } catch {}
      extractionJSON = safeJson(content)
      visionProvider = 'openai'
      const market = (meta?.market ?? 'JP') as any
      const sr = sanitizeSR(extractionJSON?.levels?.sr ?? {}, market)
      const ob = normalizeOrderbook(extractionJSON?.orderbook ?? {}, market)
      const enforced = enforceOrderbookTicks(ob, market)
      const gaps = analyzeOrderbookGaps({ levels: enforced.levels }, market)
      extractionJSON = { ...extractionJSON, levels: { ...(extractionJSON?.levels ?? {}), sr }, orderbook: { ...ob, levels: enforced.levels, _tickAdjusted: enforced.adjusted, _irregularGaps: gaps.irregular } }
    } catch (e) {
      extractionJSON = null
      extractionErr = (e as any)?.message || 'extraction error'
    }
  }

  if (wantsStream) {
    return streamPhases(async (send, progress) => {
      progress(10, 'extraction:start')
      if (extractionErr) send('log', { stage: 'extraction', error: extractionErr })
      // If extraction is empty and OpenAI/OpenRouter key is available, try fallback
      if ((!extractionJSON || Object.keys(extractionJSON || {}).length === 0) && (openaiKey || (req.headers.get('x-openrouter-key') || ''))) {
        try {
          const useOR = (preferOpenRouter && !!(req.headers.get('x-openrouter-key') || '')) || (!openaiKey && !!(req.headers.get('x-openrouter-key') || ''))
          const fallbackPayload: any = {
            model: openaiModel,
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
            response_format: { type: 'json_object' },
          }
          if (!openAIModelRequiresDefaultTemp(openaiModel)) fallbackPayload.temperature = pp.temps.vision
          const res = await fetch(`${originFromReq(req)}${useOR ? '/api/proxy/openrouter' : '/api/proxy/openai'}?endpoint=/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(useOR ? { 'x-openrouter-key': (req.headers.get('x-openrouter-key') || '') } : { 'x-api-key': openaiKey }),
            },
            body: JSON.stringify(fallbackPayload),
          })
          send('log', { stage: 'vision', provider: useOR ? 'openrouter:fallback' : 'openai:fallback', status: res.status, ok: res.ok })
          const data = await res.json().catch(() => ({}))
          const content = data?.choices?.[0]?.message?.content ?? '{}'
          try { send('log', { stage: 'vision', provider: useOR ? 'openrouter:fallback' : 'openai:fallback', contentLen: (content || '{}').length }) } catch {}
          extractionJSON = safeJson(content)
          visionProvider = 'openai'
          const market = (meta?.market ?? 'JP') as any
          const sr = sanitizeSR(extractionJSON?.levels?.sr ?? {}, market)
          const ob = normalizeOrderbook(extractionJSON?.orderbook ?? {}, market)
          const enforced = enforceOrderbookTicks(ob, market)
          const gaps = analyzeOrderbookGaps({ levels: enforced.levels }, market)
          extractionJSON = { ...extractionJSON, levels: { ...(extractionJSON?.levels ?? {}), sr }, orderbook: { ...ob, levels: enforced.levels, _tickAdjusted: enforced.adjusted, _irregularGaps: gaps.irregular } }
        } catch {}
      }
      send('extraction', { extracted: extractionJSON?.extracted ?? {}, levels: extractionJSON?.levels ?? {}, orderbook: extractionJSON?.orderbook ?? {} })
      progress(55, extractionErr ? 'extraction:error' : 'extraction:done')
      // Decide decision prompt dynamically for auto profile
      let decisionPromptStr = getPrompts(promptProfile).decision
      const f = (extractionJSON as any)?.fundamentals || {}
      if (promptProfile === 'fundamentals' || (promptProfile === 'auto' && Object.keys(f).length > 0)) {
        decisionPromptStr = getPrompts('fundamentals').decision
        send('log', { stage: 'profile', mode: 'fundamentals' })
      }
      const { data: final, error: decErr, provider: decisionProvider } = await computeDecision(meta, groqKey, openaiKey, (req.headers.get('x-openrouter-key') || ''), extractionJSON, req, decisionPromptStr)
      if (decErr) send('log', { stage: 'decision', error: decErr })
      progress(85, decErr ? 'decision:error' : 'decision:ready')
      const enriched = final ? { ...final, provider: decisionProvider, providers: { vision: visionProvider, decision: decisionProvider } } : final
      send('decision', enriched)
      progress(100, 'done')
    })
  }

  // 2) Decision summarization (provider優先、OpenAI/OpenRouter/Groqの順でフェイルオーバー)
  let finalJSON: any | null = null
  let failReason: string | null = null
  const decisionInput = {
    meta,
    extracted: extractionJSON?.extracted ?? {},
    sr: extractionJSON?.levels?.sr ?? { support: [], resistance: [] },
    orderbook: extractionJSON?.orderbook ?? {},
    fundamentals: extractionJSON?.fundamentals ?? {},
  }
  if (!preferOpenAI && !preferOpenRouter && groqKeyLooksValid) {
    try {
      const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': groqKey,
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: pp.decision + (extractionJSON?.extracted?.uiSource ? "\n" + require('@/lib/prompts').getUiHints(extractionJSON.extracted.uiSource) : '') },
          { role: 'user', content: JSON.stringify(decisionInput) },
        ],
        temperature: pp.temps.decision,
        response_format: { type: 'json_object' },
      }),
    })
      try { console.log('[analyze] decision(groq) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) {
        finalJSON = null
        try { const t = await res.text(); console.log('[analyze] decision(groq) body', t.slice(0, 500)) } catch {}
      } else {
        const data = await res.json().catch(() => ({}))
        const content = data?.choices?.[0]?.message?.content ?? '{}'
        try { console.log('[analyze] decision(groq) contentLen', (content || '{}').length) } catch {}
        const raw = safeJson(content)
        finalJSON = isMeaningful(raw) ? raw : null
      }
    } catch (e) {
      finalJSON = null
    }
  }

  if ((preferOpenAI && openaiKey) || (!finalJSON && openaiKey && !preferOpenRouter)) {
    // Fallback to OpenAI (gpt-4o-mini)
    try {
      const decisionPayload: any = {
        model: openaiModel,
        messages: [
          { role: 'system', content: pp.decision + (extractionJSON?.extracted?.uiSource ? "\n" + getUiHints(extractionJSON.extracted.uiSource) : '') },
          { role: 'user', content: JSON.stringify(decisionInput) },
        ],
        response_format: { type: 'json_object' },
      }
      if (!openAIModelRequiresDefaultTemp(openaiModel)) decisionPayload.temperature = pp.temps.decision
      try { console.log('[analyze] decision(openai) model', openaiModel) } catch {}
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': openaiKey },
        body: JSON.stringify(decisionPayload),
      })
      try { console.log('[analyze] decision(openai) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) {
        finalJSON = null
      } else {
        const data = await res.json().catch(() => ({}))
        const content = data?.choices?.[0]?.message?.content ?? '{}'
        try { console.log('[analyze] decision(openai) contentLen', (content || '{}').length) } catch {}
        const raw = safeJson(content)
        finalJSON = isMeaningful(raw) ? raw : null
      }
    } catch (e) {
      finalJSON = null
    }
  }

  if (!finalJSON && (preferOpenRouter || openrouterKey)) {
    try {
      const orDecisionPayload: any = {
        model: openaiModel,
        messages: [
          { role: 'system', content: pp.decision + (extractionJSON?.extracted?.uiSource ? "\n" + getUiHints(extractionJSON.extracted.uiSource) : '') },
          { role: 'user', content: JSON.stringify(decisionInput) },
        ],
        response_format: { type: 'json_object' },
      }
      if (!openAIModelRequiresDefaultTemp(openaiModel)) orDecisionPayload.temperature = pp.temps.decision
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openrouter?endpoint=/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-openrouter-key': (req.headers.get('x-openrouter-key') || '') },
        body: JSON.stringify(orDecisionPayload),
      })
      try { console.log('[analyze] decision(openrouter) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) {
        finalJSON = null
      } else {
        const data = await res.json().catch(() => ({}))
        const content = data?.choices?.[0]?.message?.content ?? '{}'
        try { console.log('[analyze] decision(openrouter) contentLen', (content || '{}').length) } catch {}
        const raw = safeJson(content)
        finalJSON = isMeaningful(raw) ? raw : null
      }
    } catch (e) {
      finalJSON = null
    }
  }

  // Validate and return
  if (finalJSON) {
    const parsed = AnalysisSchema.safeParse(finalJSON)
    if (parsed.success) {
      const enriched: any = { ...parsed.data }
      // annotate providers used（実際に使ったproviderを推定）
      const decisionProvider = (!groqKey && openaiKey) ? 'openai' : (groqKey && !openaiKey) ? 'groq' : (preferOpenAI ? 'openai' : (visionProvider === 'openai' ? 'openai' : 'groq'))
      enriched.provider = decisionProvider as any
      enriched.providers = { vision: visionProvider, decision: decisionProvider as any }
      // add notes about board irregularities
      try {
        const enforced = extractionJSON?.orderbook?._tickAdjusted
        const irregular = extractionJSON?.orderbook?._irregularGaps
        enriched.notes = enriched.notes || []
        if (enforced > 0) enriched.notes.push(`板の価格を呼値刻みに補正: ${enforced}箇所`)
        if (irregular) enriched.notes.push('板の価格間隔が不規則です（約定/表示の遅延や参照ズレの可能性）')
        // adjust confidence slightly by orderbook consistency
        const score = consistencyScore(enriched)
        enriched.confidence = Math.max(0, Math.min(1, (enriched.confidence ?? 0.5) * 0.6 + score * 0.4))
        // ensure scenarios exist (mobile fallback where model omitted scenarios)
        if (!enriched.scenarios || typeof enriched.scenarios !== 'object') {
          enriched.scenarios = {
            base: {
              conditions: '現状の前提に基づく基本シナリオ',
              entry: enriched?.levels?.entry,
              sl: enriched?.levels?.sl,
              tp: Array.isArray(enriched?.levels?.tp) ? enriched.levels.tp.slice(0, 2) : undefined,
              rationale: Array.isArray(enriched?.rationale) ? enriched.rationale.slice(0, 3) : undefined,
            }
          }
        }
      } catch {}
      return new Response(JSON.stringify(enriched), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
    try { console.log('[analyze] decision parse failed:', JSON.stringify(parsed, null, 2).slice(0, 800)) } catch {}
    failReason = 'decision-parse'
  }

  // If model outputs unusable or failed, return graceful stub with hints
  const fallback = stubResponse(files.length, meta, { vision: visionProvider, decision: 'none' })
  if (extractionJSON) {
    if (failReason === 'decision-parse') fallback.notes.push('要約JSONの検証に失敗したためスタブ返却')
    else fallback.notes.push('抽出JSONの解析に失敗したためスタブ返却')
  } else {
    fallback.notes.push('抽出に失敗（キー/モデル/レスポンス確認）')
  }
  return new Response(JSON.stringify(fallback), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

function safeJson(s: string) {
  try { return JSON.parse(s) } catch { return {} }
}

function isMeaningful(obj: any) {
  if (!obj || typeof obj !== 'object') return false
  // Treat as meaningful only if model returned some fields beyond defaults
  if (typeof obj.decision === 'string' && ['buy', 'sell'].includes(obj.decision)) return true
  if (obj?.levels && (typeof obj.levels.entry === 'number' || typeof obj.levels.sl === 'number' || (Array.isArray(obj.levels.tp) && obj.levels.tp.length > 0))) return true
  if (obj?.scenarios && Object.keys(obj.scenarios || {}).length > 0) return true
  if (Array.isArray(obj?.rationale) && obj.rationale.length > 0) return true
  if (obj?.orderbook && Array.isArray(obj.orderbook.levels) && obj.orderbook.levels.length > 0) return true
  if (obj?.levels?.sr && ((Array.isArray(obj.levels.sr.support) && obj.levels.sr.support.length > 0) || (Array.isArray(obj.levels.sr.resistance) && obj.levels.sr.resistance.length > 0))) return true
  if (obj?.extracted && (obj.extracted.ticker || obj.extracted.timeframe)) return true
  return false
}

function stubResponse(imageCount: number, meta: any, providers?: { vision: 'groq'|'openai'|'none', decision: 'groq'|'openai'|'none' }) {
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
    notes: ['/api/analyze はフェイルセーフでスタブ返却中'],
    provider: providers?.decision ?? 'none',
    providers: { vision: providers?.vision ?? 'none', decision: providers?.decision ?? 'none' }
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

function openAIModelRequiresDefaultTemp(model: string) {
  if (!model) return false
  // OpenAI's gpt-5 / gpt-4.1 families currently only support default temperature (1)
  // o4/o4-mini (reasoning) families、gpt-4o系もデフォルト固定
  return /^gpt-5/i.test(model)
    || /^gpt-4\.1/i.test(model)
    || /^o4/i.test(model)
    || /^gpt-4o/i.test(model)
}

async function fetchWithRetry(url: string, init: RequestInit, opts: { retries?: number; timeoutMs?: number } = {}) {
  const { retries = 2, timeoutMs = 15000 } = opts
  let lastErr: any = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok && attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastErr || new Error('fetchWithRetry failed')
}

async function computeDecision(meta: any, groqKey: string, openaiKey: string, openrouterKey: string, extractionJSON: any, req: Request, decisionPromptStr: string = decisionPrompt): Promise<{ data: any | null, error: string | null, provider: 'groq'|'openai'|'openrouter'|'none' }> {
  let finalJSON: any | null = null
  let error: string | null = null
  let used: 'groq'|'openai'|'openrouter'|'none' = 'none'
  const selected = (meta?.model ?? meta?.openaiModel) as string | undefined
  const openaiModel = ((selected === 'auto' || !selected) ? defaultOpenAIModel(meta?.profile) : selected) as string
  const preferOpenAI = meta?.provider === 'openai'
  const preferOpenRouter = meta?.provider === 'openrouter'
  const decisionInput = {
    meta,
    extracted: extractionJSON?.extracted ?? {},
    sr: extractionJSON?.levels?.sr ?? { support: [], resistance: [] },
    orderbook: extractionJSON?.orderbook ?? {},
    fundamentals: extractionJSON?.fundamentals ?? {},
  }
  if (groqKey && !preferOpenAI && !preferOpenRouter) {
    try {
      const res = await fetch(`${originFromReq(req)}/api/proxy/groq?endpoint=/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': groqKey,
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
          { role: 'system', content: decisionPromptStr },
            { role: 'user', content: JSON.stringify(decisionInput) },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      })
      try { console.log('[analyze] decision(groq) status', res.status, 'ok', res.ok) } catch {}
      if (!res.ok) {
        error = `groq text ${res.status}`
        finalJSON = null
      } else {
        const data = await res.json().catch(() => ({}))
        const content = data?.choices?.[0]?.message?.content ?? '{}'
        try { console.log('[analyze] decision(groq) contentLen', (content || '{}').length) } catch {}
        const raw = safeJson(content)
        finalJSON = isMeaningful(raw) ? raw : null
        used = finalJSON ? 'groq' : 'none'
      }
    } catch (e) {
      finalJSON = null
      error = (e as any)?.message || 'decision error'
    }
  }

  // Parallel race between OpenAI and OpenRouter for decision if keys are available
  const decTasks: Array<Promise<{ data: any | null; provider: 'openai' | 'openrouter' }>> = []
  const decisionPayload = () => {
    const p: any = { model: openaiModel, messages: [ { role: 'system', content: decisionPromptStr }, { role: 'user', content: JSON.stringify(decisionInput) } ], response_format: { type: 'json_object' } }
    if (!openAIModelRequiresDefaultTemp(openaiModel)) p.temperature = 0.0
    return p
  }
  if (openaiKey && !preferOpenRouter) {
    decTasks.push((async () => {
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openai?endpoint=/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json','x-api-key':openaiKey }, body: JSON.stringify(decisionPayload()) }, { retries: 0, timeoutMs: 12000 })
      if (!res.ok) throw new Error('openai bad')
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      const raw = safeJson(content)
      return { data: isMeaningful(raw) ? raw : raw || null, provider: 'openai' }
    })())
  }
  if (openrouterKey && !preferOpenAI) {
    decTasks.push((async () => {
      const res = await fetchWithRetry(`${originFromReq(req)}/api/proxy/openrouter?endpoint=/v1/chat/completions`, { method:'POST', headers:{ 'content-type':'application/json','x-openrouter-key':openrouterKey }, body: JSON.stringify(decisionPayload()) }, { retries: 0, timeoutMs: 16000 })
      if (!res.ok) throw new Error('openrouter bad')
      const data = await res.json().catch(() => ({}))
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      const raw = safeJson(content)
      return { data: isMeaningful(raw) ? raw : raw || null, provider: 'openrouter' }
    })())
  }
  if (decTasks.length) {
    try {
      const winner = await Promise.race(decTasks)
      finalJSON = winner?.data ?? null
      used = finalJSON ? winner.provider : 'none'
    } catch {}
  }

  if (finalJSON) {
    const market = (meta?.market ?? 'JP') as any
    finalJSON = validateDecision(finalJSON, market)
    finalJSON = checkPlanConsistency(finalJSON, market)
  }
  return { data: finalJSON, error, provider: used }
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
