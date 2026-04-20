# Commit & release conventions

8news.ai uses [Conventional Commits](https://www.conventionalcommits.org/) so that
release notes, version bumps, and a future `release-please`-style automation
all stay consistent.

## Commit message format

```
<type>(<scope>): <short summary>

<optional body — bilingual EN + FR welcome, especially when the change is
user-facing and will end up in the in-product changelog>
```

Examples:

```
feat(landing): add bilingual marketing landing on /
fix(transcribe): cap summary at 5000 chars and never truncate output
chore(release): v1.110 — landing logo, summary popover, Long/Short toggle
docs(spec): document the /app routing reshuffle
refactor(middleware): extract SPA path table to a constant
```

### Types we use

| Type        | When                                                       | Triggers in semver |
|-------------|------------------------------------------------------------|--------------------|
| `feat`      | New user-visible feature                                   | minor              |
| `fix`       | Bug fix                                                    | patch              |
| `perf`      | Performance improvement                                    | patch              |
| `refactor`  | Code change with no behavioural impact                     | patch              |
| `docs`      | Documentation only                                         | none               |
| `style`     | Formatting only                                            | none               |
| `chore`     | Tooling, deps, release commits                             | none               |
| `test`      | Tests only                                                 | none               |
| `build`     | Build system or external dependencies                      | none               |

### Scopes we use (non-exhaustive)

`landing`, `app`, `videos`, `transcribe`, `summaries`, `middleware`, `routing`,
`changelog`, `release`, `auth`, `topics`, `feeds`, `daily-summary`, `ssr`,
`ci`, `deps`.

A commit with no scope is fine for cross-cutting changes.

## Versioning — single source of truth

`package.json` is the **only** place where the version is written by hand.
Every other surface that displays a version reads from there via
`scripts/release.mjs`:

- `public/version.json` (in-app « nouvelle version » bandeau)
- `APP_VERSION` in `src/app/app/page.tsx` (SPA footer)
- Hero kicker (EN + FR) in `src/lib/landing-content.ts`
- Pricing copy (EN + FR) in `src/lib/landing-content.ts`
- Footer-bottom version line in `src/app/components/landing/LandingFooter.tsx`

`package.json` uses full semver (`1.109.0`); the UI displays the compact
form (`v1.109`, with the trailing `.0` stripped). A patch release keeps
the triplet (`v1.109.1`).

## Release workflow

When you say "push" after a working dev session:

1. **Pick a bump type** based on what changed (commit types help):
   - `npm run release:patch` for bug fixes / tweaks (`1.109.0` → `1.109.1`)
   - `npm run release:minor` for new features (`1.109.0` → `1.110.0`)
   - `npm run release:major` for breaking changes (`1.109.0` → `2.0.0`)
2. The script bumps `package.json`, then re-runs `release.mjs` which
   propagates the new version to every dependent file. Idempotent — safe
   to re-run any time.
3. Add a bilingual entry at the top of `src/lib/changelog-entries.ts`
   (the in-product Changelog page reads this; the API filter hides
   versions that aren't in the array, so list everything you want users
   to see). The `created_at` timestamp controls ordering.
4. Stage, commit with a `chore(release): v<version> — <summary>` message,
   push.

If you only need to re-sync the existing version after manually editing
`package.json` or another file, run `npm run release:sync`.

## Future: `release-please`

When the release rhythm stabilises we'll wire
[release-please](https://github.com/googleapis/release-please) as a GitHub
Action so the version bump + `CHANGELOG.md` generation happen in a PR
opened automatically on every push to `main`. The bilingual narrative
changelog in `src/lib/changelog-entries.ts` will stay manual but become
optional (write 1 entry per milestone, not per deploy).
