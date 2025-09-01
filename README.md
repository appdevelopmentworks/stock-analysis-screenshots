# Screenshot Trade Advisor (MVP Skeleton)

This is a Next.js 15 PWA skeleton for analyzing chart/orderbook screenshots and returning structured trade advice.

- Requirements and instructions: see `docs/requirements.md`, `docs/instructions.md`
- Handoff guide: see `AGENTS.md`

## Dev
- Install deps: `pnpm i` (or yarn/npm)
- Run: `pnpm dev`
- Build: `pnpm build`

## Notes
- API keys are BYO. Keys are encrypted at rest in localStorage using a user PIN (Web Crypto AES-GCM). Decrypted keys live only in sessionStorage after PIN unlock. Server is pass-through only and never stores keys/images.
- Keys unlocked? Analyze uses Groq (vision/text) with OpenAI fallback. Locked/missing keys return a safe stub response and a banner indicates stub mode.

## Deploy (Vercel)
- Prereqs: Vercel CLI (`npm i -g vercel`) or Vercel Dashboard
- Link: `vercel login` → `vercel link` (select project)
- Build: Next.js 15; Edge runtime configured via `vercel.json` (`app/api/**`)
- Env: none required (BYO keys via client). Optional: `NEXT_PUBLIC_SENTRY_DSN` for browser error reporting
- If using Sentry: Include CDN script in `app/layout.tsx` head (or project settings) e.g.
  `<script src="https://browser.sentry-cdn.com/7.105.0/bundle.tracing.min.js" crossOrigin="anonymous"></script>`
- Deploy: `vercel` (preview) → `vercel --prod`
- Headers: APIs return `Cache-Control: no-store`; CORS enabled on `/api/proxy/*` for cross-origin usage

## shadcn/ui (optional)
- This repo includes minimal Button/Card primitives. To migrate to shadcn/ui:
  1) `pnpm dlx shadcn-ui@latest init` (choose Tailwind config)
  2) `pnpm dlx shadcn-ui@latest add button card sheet input select toast`
  3) Replace usages in `components/*` with shadcn imports
