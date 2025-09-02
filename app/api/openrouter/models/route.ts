export const runtime = 'edge'

function originFromReq(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export async function GET(req: Request) {
  const apiKey = req.headers.get('x-openrouter-key') || ''
  if (!apiKey) return new Response(JSON.stringify({ error: 'Missing X-OpenRouter-Key' }), { status: 400 })
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'referer': originFromReq(req),
      'x-title': 'Stock Screenshot Analyzer',
    },
  })
  const hdr = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  return new Response(res.body, { status: res.status, headers: hdr })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-openrouter-key', 'access-control-allow-methods': 'GET, OPTIONS', 'cache-control': 'no-store' } })
}

