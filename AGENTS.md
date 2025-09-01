# Repository Guidelines

## Project Structure & Module Organization
- App: `app/` (Next.js 15 App Router). Pages like `/`, `/tests` and API routes under `app/api/*` (Edge runtime).
- Components: `components/` (UI + feature components). Prefer `PascalCase` files for React components.
- Library: `lib/` (prompts, validation, crypto, image utils, UI-detect, schemas, formatting).
- Public/PWA: `public/` (assets, `manifest.json`), `service-worker.ts`.
- Docs: `docs/` (requirements/instructions). Root `AGENTS.md` is this guide.

## Build, Test, and Development Commands
- Dev server: `pnpm dev` (Next.js dev with HMR).
- Build: `pnpm build` (production build; Edge API routes included).
- Start: `pnpm start` (serve production build).
- Type-check: `npx tsc --noEmit` (strict TS checks).
- Lint: `pnpm lint` (ESLint: next/core-web-vitals).
- Browser tests: open `/tests` (runs lightweight checks in the browser).

## Coding Style & Naming Conventions
- Language: TypeScript, React Server/Client components.
- Indentation: 2 spaces; max line length ~100 where feasible.
- Naming: `PascalCase` for components, `camelCase` for vars/functions, `kebab-case` for route/asset files.
- Styling: TailwindCSS; theme tokens in `app/globals.css` (use CSS vars like `--background`, `--foreground`).
- Linting: ESLint (extends Next defaults). Prefer narrow, typed utilities in `lib/`.

## Testing Guidelines
- Minimal browser-based tests at `app/tests/page.tsx` (visit `/tests`).
- Add unit tests alongside modules if expanded (e.g., `lib/__tests__/*.test.ts`).
- Goal: validate parsing/formatting/validation utilities first; avoid network in unit tests.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits style
  - Examples: `feat: add iOS non-SSE fallback`, `fix: snap to tick for JP`, `chore: bump colors for readability`.
- PRs: include scope/intent, screenshots or JSON diffs for UI/API, link issues, and brief testing notes (desktop/mobile).

## Security & Configuration Tips
- API keys are BYO and must not be committed. Keys are encrypted client-side (PIN) and stored only in the browser; session use is allowed.
- No server persistence; images are transient. Proxies at `/api/proxy/{groq,openai}` pass keys via `X-API-Key`.
- Optional: `NEXT_PUBLIC_SENTRY_DSN` for browser error capture.

## Architecture Overview (Quick)
- Next.js 15 App Router + Edge API. Pipeline: image upload → vision extraction → normalization/validation → decision JSON → formatted output. Model providers: Groq (primary), OpenAI (fallback).
