#!/usr/bin/env node
/**
 * docs/SPEC.md drift check — keeps the "kept current" parts of the spec
 * mechanically honest against the actual repo state.
 *
 * Checks:
 *   1. The SPEC header version matches package.json (major.minor).
 *   2. Every migrations/NNN-*.sql file is mentioned in the spec.
 *   3. Every netlify/functions/*.ts (crons + shared/) is mentioned.
 *   4. Every top-level route folder under src/app/api/ is mentioned.
 *   5. Every src/lib (+ supabase/ + email/) module and src/hooks file
 *      is mentioned — a one-line grouped mention is enough, the check
 *      is a substring match, not a per-file paragraph requirement.
 *
 * Modes:
 *   node scripts/spec-check.mjs          # strict — exit 1 on any drift
 *   node scripts/spec-check.mjs --warn   # advisory — list drift, exit 0
 *
 * Strict mode is wired into `npm test`, so spec drift fails local
 * validation AND the Netlify build (which runs `npm test && npm run
 * build`). The redaction itself is done by the agent during the release
 * ritual (AGENTS.md § 3) — this script only makes forgetting impossible.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WARN_ONLY = process.argv.includes("--warn");

const spec = await fs.readFile(path.join(ROOT, "docs/SPEC.md"), "utf8");
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));

const failures = [];

async function listDir(rel, filter = () => true) {
  try {
    const entries = await fs.readdir(path.join(ROOT, rel));
    return entries.filter((e) => !e.startsWith(".") && filter(e));
  } catch {
    return [];
  }
}

function requireMention(name, where) {
  if (!spec.includes(name)) failures.push(`${name} absent de SPEC.md (${where})`);
}

// 1. Header version — major.minor must match package.json. Patches may
//    lag (a patch doesn't have to touch the spec header), minors may not.
const headerMatch = spec.match(/^\*\*Version\*\*:\s*v(\d+)\.(\d+)/m);
if (!headerMatch) {
  failures.push("en-tête « **Version**: vX.Y » introuvable dans SPEC.md");
} else {
  const [pkgMajor, pkgMinor] = pkg.version.split(".");
  if (headerMatch[1] !== pkgMajor || headerMatch[2] !== pkgMinor) {
    failures.push(
      `en-tête SPEC.md v${headerMatch[1]}.${headerMatch[2]} ≠ package.json v${pkgMajor}.${pkgMinor} — mettre à jour version + date`,
    );
  }
}

// 2. Migrations — every file must appear (the spec keeps the full list).
for (const f of await listDir("migrations", (e) => /^\d{3}-.*\.sql$/.test(e))) {
  requireMention(f, "§ 3 arbre des migrations — + § 5 si nouvelle table/colonne");
}

// 3. Netlify functions — crons and shared helpers.
for (const f of await listDir("netlify/functions", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre + § 6.1 crons");
}
for (const f of await listDir("netlify/functions/shared", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre netlify/functions/shared");
}

// 4. API routes — every top-level folder/file under src/app/api.
for (const name of await listDir("src/app/api")) {
  requireMention(name.replace(/\.ts$/, ""), "§ 3.2 arbre des routes API");
}

// 5. Library modules + hooks — substring match, grouped mentions are fine.
for (const f of await listDir("src/lib", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre src/lib");
}
for (const f of await listDir("src/lib/supabase", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre src/lib/supabase");
}
for (const f of await listDir("src/lib/email", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre src/lib/email");
}
for (const f of await listDir("src/hooks", (e) => e.endsWith(".ts"))) {
  requireMention(f, "§ 3 arbre src/hooks");
}

if (failures.length === 0) {
  console.log("✓ spec-check: docs/SPEC.md est synchronisé avec le repo.");
  process.exit(0);
}

const prefix = WARN_ONLY ? "⚠" : "✗";
console.log(`${prefix}  spec-check: ${failures.length} dérive(s) détectée(s) dans docs/SPEC.md :`);
for (const f of failures) console.log(`   ${prefix} ${f}`);
console.log(
  WARN_ONLY
    ? "   → À corriger pendant l'étape SPEC.md du rituel de release (AGENTS.md § 3)."
    : "   → Mettre à jour docs/SPEC.md (contrat AGENTS.md § 11) puis relancer.",
);
process.exit(WARN_ONLY ? 0 : 1);
