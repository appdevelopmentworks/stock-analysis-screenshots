"use client"
import { useEffect } from 'react'

export function InitSentry() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return
    const w = window as any
    // Expect Sentry to be injected via <script src="https://browser.sentry-cdn.com/.../bundle.min.js" crossorigin="anonymous"></script>
    if (w && w.Sentry && typeof w.Sentry.init === 'function') {
      try { w.Sentry.init({ dsn, tracesSampleRate: 0.1 }) } catch {}
    }
  }, [])
  return null
}
