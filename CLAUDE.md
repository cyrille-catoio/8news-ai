# CLAUDE.md — Instructions for Claude Code on 8news.ai

Claude Code should treat `AGENTS.md` as the source of truth for this
repository.

Before making changes, read `AGENTS.md` and follow it fully:

- answer the owner in French;
- keep all product-facing text bilingual EN + FR;
- never commit or push unless explicitly asked;
- follow the exact release ritual for `push patch`, `push minor` and
  `push major`;
- run the required validations after non-trivial code changes;
- never apply Supabase migrations yourself; create SQL files and tell the
  owner to run them in Supabase;
- preserve the repo's existing Next.js / Supabase / Netlify cron patterns;
- avoid emojis in UI/editorial content;
- keep the Daily Podcast contract intact unless the owner explicitly asks
  to change it.

If any instruction here conflicts with `AGENTS.md`, `AGENTS.md` wins.

Common commands:

- `npm run dev` — local dev server on `http://127.0.0.1:3000`.
- `npm test` — Vitest suite + `spec-check.mjs` (must be green before push).
- `npx tsc --noEmit` — type check.
- `npm run lint` — ESLint.
- `npm run build` — production build (`next build`).
- `npm run release:patch` / `release:minor` / `release:major` — release ritual
  (see `AGENTS.md`); never run unless the owner explicitly asks.

Practical reminder for Claude Code:

1. Start by checking `git status` and reading the relevant files.
2. Do not revert user changes in a dirty working tree.
3. For releases, update `src/data/changelog-entries.json` and `docs/SPEC.md`
   exactly as described in `AGENTS.md`.
4. Before any push, require green `npm test`, `npx tsc --noEmit`,
   `npm run lint`, and `npm run build`.
