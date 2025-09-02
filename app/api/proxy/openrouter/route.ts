export const runtime = 'edge'

function originFromReq(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(req: Request) {
  const upstream = 'https://openrouter.ai/api'
  const apiKey = req.headers.get('x-openrouter-key') || req.headers.get('x-api-key') || ''
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-OpenRouter-Key or X-API-Key header' }), { status: 400 })
  }
  const url = new URL(req.url)
  const { endpoint = '/v1/chat/completions' } = Object.fromEntries(url.searchParams)
  const body = await req.text()

  const res = await fetch(upstream + endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      // OpenRouter recommended headers
      'referer': originFromReq(req),
      'x-title': 'Stock Screenshot Analyzer',
    },
    body,
  })

  const hdr = new Headers(res.headers)
  hdr.set('x-proxy', 'openrouter')
  hdr.set('cache-control', 'no-store')
  hdr.set('access-control-allow-origin', '*')
  hdr.set('access-control-allow-headers', 'content-type, authorization, x-openrouter-key, x-api-key')
  hdr.set('access-control-allow-methods', 'POST, OPTIONS')
  try { console.log('[proxy:openrouter]', endpoint, 'status', res.status, 'ok', res.ok) } catch {}
  return new Response(res.body, { status: res.status, headers: hdr })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, x-openrouter-key, x-api-key',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
    },
  })
}
