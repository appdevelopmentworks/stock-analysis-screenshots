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
