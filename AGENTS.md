# Project Handoff Guide (AGENTS.md)

Purpose: Make it fast for any engineer/agent to pick up and move this project forward with minimal context.

## 1) What This Is
- A PWA app that accepts smartphone screenshots of candlestick charts and order books, analyzes them (technical + order book now; fundamentals later), and returns structured trade advice with reasoning.
- MVP scope: Japan/US equities; crypto = technical-only. Order book included at MVP, fundamentals in a later phase.
- User brings their own API keys (OpenAI, Groq). No server-side persistence; images and keys are not stored server-side.

Current repo contents
- docs/requirements.md: consolidated MVP requirements, architecture, API, UX, models, risks, next steps.
- docs/instructions.md: analyst response policy and output templates used to shape LLM output.

## 2) Tech Stack (Decided)
- Client: Next.js 15 (App Router) + TailwindCSS + shadcn/ui + framer-motion + PWA (manifest + SW).
- Runtime/Deploy: Vercel (Edge Runtime prioritized).
- Models (profiles selectable):
  - Balanced (default): Groq vision `meta-llama/llama-4-maverick-17b-128e-instruct`; text `openai/gpt-oss-120b` on Groq.
  - Fast: Groq maverick (vision) + OpenAI `gpt-4o-mini` (text).
  - Quality: OpenAI `gpt-4o` (vision) + Groq `openai/gpt-oss-120b` (text).
- Key policy: BYO keys; client stores encrypted locally; server uses pass-through proxy; no DB.

## 3) Architecture Overview
- Frontend
  - Upload multiple images (chart + order book). Client-side preprocessing (rotate/resize/compress, Web Worker).
  - Settings (provider/model/profile/tone, market defaults). Local encrypted key storage with clear toggle.
  - Streaming UI: show decision card first, then rationale/plan/risks; history optional in IndexedDB.
- Edge/API (Vercel Edge Functions)
  - POST /api/analyze: Orchestrates vision extraction → decision/summary; returns JSON or SSE stream.
  - POST /api/proxy/openai, POST /api/proxy/groq: Pass-through to upstream with key in `X-API-Key`; no server storage; headers masked in logs.
- Data
  - No server persistence. Optional client-side history (IndexedDB). Images in-memory only during request.

## 4) Data Contract (MVP JSON)
```
{
  "decision": "buy|sell|hold",
  "horizon": "scalp|intraday|1-3d|swing",
  "rationale": ["string"],
  "levels": { "entry": 0, "sl": 0, "tp": [0], "sr": { "support": [0], "resistance": [0] } },
  "orderbook": { "spread": 0, "imbalance": 0, "pressure": "bid|ask|neutral", "levels": [{ "price": 0, "bid": 0, "ask": 0 }] },
  "extracted": { "ticker": "", "market": "JP|US|CRYPTO", "timeframe": "" },
  "fundamentals": { "valuation": {"per":0, "pbr":0, "ev_ebitda":0}, "growth": {"rev_yoy":0, "eps_yoy":0}, "profitability": {"roe":0, "opm":0}, "financials": {"equity_ratio":0, "debt_equity":0}, "guidance": "", "events": ["string"] },
  "confidence": 0.0,
  "notes": ["string"]
}
```

## 5) Prompting Strategy
- See `docs/instructions.md` for the output format and tone rules (facts vs estimates, risk-first, scenarios, JST). 
- Vision extraction prompt returns strictly the JSON subsets: `extracted`, `levels.sr`, `orderbook` with null where unknown and reasons where applicable.
- Decision/summary prompt consumes normalized features → emits 3 scenarios, invalidation lines, consistent `levels`, and `confidence`. Tone switch: concise vs learning-heavy.

## 6) Security/Privacy
- Keys: `X-API-Key` header → proxied to upstream; never persisted server-side; headers masked in logs.
- Images: processed in-memory only; deleted after response; do not log image payloads.
- Client: optional encrypted local key storage (Web Crypto); clear button; history stored only on device.
- CORS: only via our proxy routes; direct upstream requests from browser are disallowed.

## 7) PWA
- Installable (manifest.json), minimal offline (settings/history only), service worker cache strategy limited to static + client history UI.

## 8) Development Plan (Execution Order)
1. Scaffold Next.js 15 app (App Router, Tailwind, shadcn/ui, PWA boilerplate).
2. Settings UI + encrypted key storage + provider/model selection + tone/profile options.
3. Upload flow with client preprocessing and multi-image support.
4. Implement `/api/proxy/{openai,groq}` (edge, pass-through, header masking, timeouts/retry).
5. Implement `/api/analyze` with stubbed pipeline → then wire to models (Groq first).
6. Prompt templates + JSON validation (zod or valibot) and numeric sanity checks (tick size, decimals).
7. Streaming result UI + local history (IndexedDB) + re-evaluate.
8. Tuning on a baseline set of 10–20 screenshots (SBI/Rakuten/Matsui; chart + order book + crypto charts).

## 9) Local Dev & Deployment
- Local: standard Next.js workflow (pnpm/yarn/npm). No server env vars required; user keys provided at runtime.
- Deployment: Vercel; ensure Edge Runtime for proxy/analyze; confirm CORS and header masking; no persistent storage.

## 10) Known Risks & Guards
- Order book OCR errors → tick size/decimal validation; outlier removal; confidence down-weighting.
- Latency → image compression, limit to 1–2 images; parallelize vision/text; failover between providers.
- Overconfidence → always include invalidation and “sit-out” criteria; conservative defaults; explicit disclaimer.

## 11) Directory Map (current)
- `docs/requirements.md` — MVP requirements and design.
- `docs/instructions.md` — response policy and templates.
- `AGENTS.md` — this guide.
- (to be added) `app/`, `components/`, `lib/`, `app/api/…`, `public/manifest.json`, `public/icons/*`, `service-worker.ts`.

## 12) Contribution Checklist
- Read `docs/requirements.md` and `docs/instructions.md`.
- Keep server stateless; never log/store keys or image bodies.
- Validate all numeric outputs and JSON schema; reject/flag low-confidence extraction.
- Maintain two tones (Concise / Learning) and three model profiles (Fast/Balanced/Quality).
- Update this file when changing endpoints, models, or key handling.

## 13) Open Questions / Next Decisions
- Default OpenAI model IDs if user selects OpenAI for both vision and text.
- IndexedDB schema for client history (keep minimal, user-controlled TTL).
- Fundamentals phase-in: which screens to target first (決算概要/指標一覧) and which fields to require.

----
Primary references: `docs/requirements.md`, `docs/instructions.md`.
