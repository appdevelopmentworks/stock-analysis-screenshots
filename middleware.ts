import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const res = new Response(null, { status: 204 })
  // Apply CSP only to document navigation requests (HTML). For APIs/Assets it is harmless but we restrict to paths.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js dev needs unsafe-eval; in prod you can tighten with nonce
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.groq.com https://api.openai.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return res
}

export const config = {
  matcher: [
    // Apply to all pages; APIs already set headers via route handlers
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}

