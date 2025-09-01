export const runtime = 'edge'

export async function POST(req: Request) {
  const upstream = 'https://api.groq.com'
  const apiKey = req.headers.get('x-api-key') || ''
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { status: 400 })
  }
  const url = new URL(req.url)
  const { endpoint = '/openai/v1/chat/completions' } = Object.fromEntries(url.searchParams)
  const body = await req.text()

  const res = await fetch(upstream + endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body,
  })

  const hdr = new Headers(res.headers)
  hdr.set('x-proxy', 'groq')
  hdr.set('cache-control', 'no-store')
  hdr.set('access-control-allow-origin', '*')
  hdr.set('access-control-allow-headers', 'content-type, authorization, x-api-key')
  hdr.set('access-control-allow-methods', 'POST, OPTIONS')
  return new Response(res.body, { status: res.status, headers: hdr })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, x-api-key',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
    },
  })
}
