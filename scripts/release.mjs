#!/usr/bin/env node
/**
 * Single-source-of-truth version sync helper.
 *
 * Reads the version from `package.json` and writes it back into every file
 * that displays it: `public/version.json`, the SPA `APP_VERSION`, the
 * landing page kicker / pricing copy / footer-bottom version line.
 *
 * Idempotent — safe to run any number of times. Run automatically by:
 *   npm run release:patch    (1.109   → 1.109.1)
 *   npm run release:minor    (1.109   → 1.110)
 *   npm run release:major    (1.109   → 2.0.0)
 *   npm run release:sync     (no bump, just re-sync the existing version)
 *
 * Add a target file? Drop a new entry into the `targets` array below.
 */

import { promises as fs } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
const semver = pkg.version;

if (!semver || !/^\d+\.\d+\.\d+$/.test(semver)) {
  console.error(`✗ Invalid semver in package.json: "${semver}"`);
  console.error("  Expected X.Y.Z (e.g. 1.109.0). Use npm version patch/minor/major.");
  process.exit(1);
}

/**
 * The UI displays a compact form: trailing `.0` is dropped so a minor
 * release looks like `v1.110` instead of `v1.110.0`. Patch releases keep
 * their full triplet (`v1.110.1`). `package.json` and `version.json`
 * always store the full semver — the compact form is for humans.
 */
const version = semver.endsWith(".0") ? semver.slice(0, -2) : semver;

/**
 * Each entry rewrites every match of `find` to `replace` in the given file.
 * `find` is a RegExp with the `g` flag; `replace` may use $1, $2, … to
 * keep capture groups. Both use the literal string `__VERSION__` as a
 * placeholder which is substituted with the real version before applying.
 */
const targets = [
  {
    file: "public/version.json",
    // Read by the in-app « nouvelle version » poll which does a strict
    // string comparison against `APP_VERSION` — both use the compact
    // display form (e.g. "1.109" not "1.109.0") so they always match.
    rewrite: () => JSON.stringify({ version }) + "\n",
  },
  {
    file: "src/app/app/page.tsx",
    find: /const APP_VERSION = "[^"]*";/g,
    replace: `const APP_VERSION = "__VERSION__";`,
  },
  // Note: the hero kicker no longer carries a version (was "v1.108 · LIVE
  // ON 8NEWS.AI", now "Tech / AI / Crypto"). If you put the version back
  // into a kicker, add a target here.
  {
    file: "src/app/components/landing/LandingFooter.tsx",
    find: /v[0-9.]+(\s·\s8NEWS\.AI)/g,
    replace: `v__VERSION__$1`,
  },
];

const results = [];

for (const t of targets) {
  const abs = path.join(ROOT, t.file);
  let before;
  try {
    before = await fs.readFile(abs, "utf8");
  } catch (err) {
    console.error(`✗ ${t.file}: ${err.message}`);
    process.exit(1);
  }

  let after;
  let warning = null;
  if (t.rewrite) {
    after = t.rewrite(before);
  } else {
    const replaceWith = t.replace.replace(/__VERSION__/g, version);
    after = before.replace(t.find, replaceWith);
    // If a regex target didn't match anything, the file won't change but
    // we likely have a stale pattern (e.g. someone reworded the copy that
    // contained the version). Surface a warning so we don't silently
    // forget to bump a string.
    if (after === before && !t.find.test(before)) {
      warning = `regex did not match — pattern may be stale: ${t.find}`;
    }
  }

  if (after === before) {
    results.push({ file: t.file, changed: false, warning });
  } else {
    await fs.writeFile(abs, after, "utf8");
    results.push({ file: t.file, changed: true });
  }
}

const changed = results.filter((r) => r.changed);
const unchanged = results.filter((r) => !r.changed);

console.log(`Version: ${semver}  (display: v${version})`);
if (changed.length > 0) {
  console.log("Updated:");
  for (const r of changed) console.log(`  ✓ ${r.file}`);
}
if (unchanged.length > 0) {
  console.log("Already in sync:");
  for (const r of unchanged) console.log(`  · ${r.file}`);
}

const warnings = results.filter((r) => r.warning);
if (warnings.length > 0) {
  console.log("");
  console.log("⚠  Stale patterns (no version reference found, target may need updating):");
  for (const r of warnings) console.log(`  ⚠ ${r.file}: ${r.warning}`);
}

/* ── Changelog coverage check ───────────────────────────────────────────
 * After syncing the version, we verify that the human-facing changelog
 * is in sync with what was actually committed since the previous release.
 * Two checks:
 *   1. The current version exists as an entry in CHANGELOG_ENTRIES.
 *   2. Every commit since the last `chore(release):` is plausibly covered
 *      by that entry — listed here so the author can decide.
 *
 * Both are advisory. They surface as ⚠ and never fail the script (a
 * release commit might still be in progress, or some commits may
 * intentionally not be user-facing).
 */
function safeGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

console.log("");

// 1. Is the current version listed in the changelog JSON?
try {
  const cl = await fs.readFile(path.join(ROOT, "src/data/changelog-entries.json"), "utf8");
  // Match `"version": "1.109.2"` or `"version": "1.109"` (with or without trailing .0).
  const versionRe = new RegExp(`"version":\\s*"${escapeRe(version)}"`);
  if (!versionRe.test(cl)) {
    console.log(`⚠  Changelog: no entry found for v${version} in src/data/changelog-entries.json`);
    console.log(`   Add a { version: "${version}", title_en, title_fr, body_en, body_fr, created_at } block at the top of the JSON array before pushing.`);
  } else {
    console.log(`✓ Changelog: entry for v${version} found.`);
  }
} catch (err) {
  console.log(`⚠  Changelog check skipped: ${err.message}`);
}

// 2. Commits since the last `chore(release):` commit — surface them so
//    they're not silently absent from the next changelog entry.
const lastReleaseSha = safeGit('log --grep="^chore(release):" -1 --format="%H" HEAD');
if (lastReleaseSha) {
  const range = `${lastReleaseSha}..HEAD`;
  const commits = safeGit(`log ${range} --pretty=format:%h\\ %s`);
  const lines = commits ? commits.split("\n").filter(Boolean) : [];
  if (lines.length > 0) {
    console.log("");
    console.log(`⚠  Commits since last release (${lastReleaseSha.slice(0, 7)}) not yet in any \`chore(release):\` commit:`);
    for (const line of lines) console.log(`     ${line}`);
    console.log(`   Make sure the v${version} changelog entry covers them — or that the next \`chore(release):\` commit will.`);
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
