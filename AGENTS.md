# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js 15 App Router. Pages: `/` (main), `/tests` (smoke), `/result` (mobile result), `/settings`, `/help`. Edge API under `app/api/*`.
- `components/`: UI + feature components (PascalCase). Examples: `NavBar`, `SettingsSheet`, `ResultPane`, `ui/*`.
- `lib/`: Typed utilities (prompts, validation, crypto, image, history, schemas, formatting, UI-detect).
- `public/`: Assets and PWA (`manifest.json`, icons). `service-worker.ts` at repo root.
- `docs/`: Repo docs (this guide).

## Build, Test, and Development Commands
- `pnpm dev`: Start dev server with HMR.
- `pnpm build`: Production build (includes Edge API).
- `pnpm start`: Serve the production build.
- `npx tsc --noEmit`: Strict type checks.
- `pnpm lint`: ESLint (`next/core-web-vitals`).
- Browser tests: run dev and open `/tests`.

## Coding Style & Naming Conventions
- Language: TypeScript (Server/Client components). Indent 2 spaces; target ~100 chars/line.
- Naming: Components PascalCase; vars/functions camelCase; routes/assets kebab-case.
- Styling: TailwindCSS. Theme tokens in `app/globals.css` (e.g., `--background`, `--foreground`).
- Keep utilities small, focused, and typed in `lib/`.

## Testing Guidelines
- Prefer unit tests for pure utilities (e.g., `lib/__tests__/*.test.ts`).
- Avoid network I/O; mock inputs/outputs.
- Use `/tests` page for smoke checks in the browser.

## Commit & Pull Request Guidelines
- Conventional Commits, e.g.:
  - `feat: auto-switch to fundamentals profile`
  - `fix: skip temperature for gpt-4o family`
  - `chore: tweak dark theme to darkblue`
- PRs: describe scope/intent, include screenshots or JSON diffs, link issues, and add testing notes (desktop/mobile).

## Security & Configuration Tips
- BYO API keys; never commit credentials. Keys are encrypted client‑side (PIN) and stored in the browser only.
- Proxies: `/api/proxy/{openrouter,openai}`; send keys via headers (`X-OpenRouter-Key`, `X-OpenAI-Key`). No server persistence; optional `NEXT_PUBLIC_SENTRY_DSN` for browser errors.

## Architecture Overview
- Pipeline: image upload → vision extraction → normalization/validation → decision JSON → formatted output.
- Providers: OpenRouter + OpenAI supported. Groq endpoints exist but are disabled in the UI.
- Mobile UX: auto-redirect to `/result?id=...` on small screens; top nav provides 「ホーム / 設定 / 使い方」.
