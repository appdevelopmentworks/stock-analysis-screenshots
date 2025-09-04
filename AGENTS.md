# Repository Guidelines

## Project Structure & Module Organization
- App: `app/` (Next.js 15 App Router, Edge API under `app/api/*`). Main page `/`, diagnostics `/tests`.
- Components: `components/` (UI + feature components). Use PascalCase filenames.
- Library: `lib/` (prompts, validation, crypto, image utils, UI-detect, schemas, formatting).
- Public/PWA: `public/` (assets, `manifest.json`), `service-worker.ts`.
- Docs: `docs/` (requirements/instructions). This guide: `AGENTS.md`.

## Build, Test, and Development Commands
- Dev: `pnpm dev` — run Next.js dev server with HMR.
- Build: `pnpm build` — create production build (Edge API included).
- Start: `pnpm start` — serve the production build.
- Type-check: `npx tsc --noEmit` — strict TypeScript checks.
- Lint: `pnpm lint` — ESLint (next/core-web-vitals).
- Browser tests: visit `/tests` while dev server runs.

## Coding Style & Naming Conventions
- Language: TypeScript (React Server/Client components).
- Indentation: 2 spaces; target ≤ ~100 chars/line where feasible.
- Naming: Components in PascalCase; variables/functions in camelCase; routes/assets in kebab-case.
- Styling: TailwindCSS; theme tokens in `app/globals.css` (e.g., `--background`, `--foreground`).
- Keep utilities small and typed in `lib/`.

## Testing Guidelines
- Prefer unit tests for pure utilities first (e.g., `lib/__tests__/*.test.ts`).
- Avoid network calls in unit tests; mock inputs/outputs.
- Smoke checks live at `app/tests/page.tsx` (open in the browser).

## Commit & Pull Request Guidelines
- Commits: use Conventional Commits. Examples:
  - `feat: auto-switch to fundamentals profile`
  - `fix: skip temperature for gpt-4o family`
  - `chore: tweak dark theme to darkblue`
- PRs: describe scope/intent, include screenshots or JSON diffs for UI/API, link issues, and add brief testing notes (desktop/mobile, iOS/Android).

## Security & Configuration Tips
- BYO API keys; never commit credentials. Keys are encrypted client‑side (PIN) and stored only in the browser.
- Proxies: `/api/proxy/{openrouter,openai,groq}` pass keys via headers (e.g., `X-OpenRouter-Key`, `X-OpenAI-Key`, `X-API-Key`).
- No server persistence; images are transient. Optional `NEXT_PUBLIC_SENTRY_DSN` for browser error capture.

## Architecture Overview (Quick)
- Pipeline: image upload → vision extraction → normalization/validation → decision JSON → formatted output.
- Providers: OpenRouter (Claude/Gemini), OpenAI, Groq. Auto profile can switch to fundamentals based on screenshot content.

