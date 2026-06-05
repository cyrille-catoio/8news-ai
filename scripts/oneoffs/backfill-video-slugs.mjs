#!/usr/bin/env node
/**
 * One-shot backfill for the new slug_keywords + published_date + topic_id
 * columns on `video_transcriptions` (introduced by migration 016).
 *
 * Run from the project root:
 *
 *     node scripts/oneoffs/backfill-video-slugs.mjs
 *
 * Idempotent — safe to re-run any number of times. A second run only
 * touches rows that gained a topic in the meantime (or that someone
 * NULLed manually).
 *
 * Three steps:
 *   1. Backfill `topic_id` from `youtube_channels.topic_id` so videos
 *      whose channel has been assigned a topic catch up.
 *   2. (published_date was already backfilled by migration 016 itself.)
 *   3. For every row that now has both topic_id and published_date but
 *      still no slug_keywords, compute a slug via slugifyVideoTitle()
 *      and uniquifyVideoSlug() and UPDATE.
 *
 * After step 3 the script logs a sample of the most recent slugs
 * generated so you can eyeball quality before pushing.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 * (read from .env or .env.local — we don't load anything ourselves; rely
 * on whatever already exports them, e.g. `npm run` from the project
 * root which inherits Netlify-CLI loaded env, or a manual export).
 */

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyVideoTitle, uniquifyVideoSlug } from "../../src/lib/slug.ts";

// This script lives in scripts/oneoffs/, so the project root is two
// levels up (used to locate .env below).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Manual .env loader — Node doesn't read .env automatically (unlike
 * Next.js dev server which loads .env.local + .env on boot). We look
 * at both files in the Next.js priority order and inject any missing
 * keys into `process.env`. Existing values on the environment take
 * precedence (e.g. when the operator exports them in their shell).
 */
async function loadDotenv(filename) {
  try {
    const raw = await fs.readFile(path.join(ROOT, filename), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip surrounding single or double quotes (Next.js doesn't use
      // them but some local conventions do).
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // File missing is OK — try the next candidate in the caller.
  }
}

// Load in Next.js priority order: .env.local overrides .env.
await loadDotenv(".env");
await loadDotenv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("  Checked: process.env, .env, .env.local (project root).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// ─── Step 1: backfill topic_id from youtube_channels.topic_id ───────
console.log("• Step 1: backfilling topic_id from youtube_channels…");
{
  // Pull rows missing topic_id, batched.
  const { data: missing, error } = await db
    .from("video_transcriptions")
    .select("id, channel_id")
    .is("topic_id", null);

  if (error) {
    console.error(`  ✗ SELECT failed: ${error.message}`);
    process.exit(1);
  }

  if (!missing || missing.length === 0) {
    console.log("  · 0 rows to backfill — already in sync.");
  } else {
    // Pull channels that have a topic_id and intersect.
    const channelIds = [...new Set(missing.map((r) => r.channel_id))];
    const { data: channels, error: chErr } = await db
      .from("youtube_channels")
      .select("channel_id, topic_id")
      .in("channel_id", channelIds)
      .not("topic_id", "is", null);

    if (chErr) {
      console.error(`  ✗ channel SELECT failed: ${chErr.message}`);
      process.exit(1);
    }

    const topicByChannel = new Map(
      (channels ?? []).map((c) => [c.channel_id, c.topic_id]),
    );

    let updated = 0;
    let skippedNoTopic = 0;
    for (const row of missing) {
      const topicId = topicByChannel.get(row.channel_id);
      if (!topicId) {
        skippedNoTopic++;
        continue;
      }
      const { error: upErr } = await db
        .from("video_transcriptions")
        .update({ topic_id: topicId })
        .eq("id", row.id);
      if (upErr) {
        console.error(`  ✗ UPDATE id=${row.id} failed: ${upErr.message}`);
      } else {
        updated++;
      }
    }
    console.log(`  ✓ ${updated} rows topic_id-updated, ${skippedNoTopic} skipped (channel without topic).`);
  }
}

// ─── Step 2: published_date is already backfilled by migration 016 ──
console.log("• Step 2: published_date already handled by migration 016 — skipping.");

// ─── Step 3: compute slug for rows that need it ──────────────────────
console.log("• Step 3: computing slug_keywords for rows that have topic_id + published_date but no slug…");
{
  const { data: candidates, error } = await db
    .from("video_transcriptions")
    .select("id, video_id, title, lang, topic_id, published_date")
    .is("slug_keywords", null)
    .not("topic_id", "is", null)
    .not("published_date", "is", null);

  if (error) {
    console.error(`  ✗ SELECT failed: ${error.message}`);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    console.log("  · 0 candidates — already in sync.");
  } else {
    let updated = 0;
    let emptyBase = 0;
    for (const row of candidates) {
      const lang = row.lang === "fr" ? "fr" : "en";
      const base = slugifyVideoTitle(row.title ?? "", lang);
      if (!base) {
        emptyBase++;
        console.warn(`  ⚠ id=${row.id} video_id=${row.video_id}: empty slug from title "${row.title}"`);
        continue;
      }
      const slug = await uniquifyVideoSlug(
        db,
        base,
        row.topic_id,
        row.published_date,
        lang,
        row.video_id,
      );
      const { error: upErr } = await db
        .from("video_transcriptions")
        .update({ slug_keywords: slug })
        .eq("id", row.id);
      if (upErr) {
        console.error(`  ✗ UPDATE id=${row.id} failed: ${upErr.message}`);
      } else {
        updated++;
      }
    }
    console.log(`  ✓ ${updated} rows slug-updated, ${emptyBase} skipped (empty base from title).`);
  }
}

// ─── Sample output for visual verification ────────────────────────────
console.log("\n• Sample of the 10 most recent slugs:");
{
  const { data: sample } = await db
    .from("video_transcriptions")
    .select("topic_id, published_date, lang, slug_keywords, title")
    .not("slug_keywords", "is", null)
    .order("published_date", { ascending: false })
    .limit(10);

  for (const r of sample ?? []) {
    const url = `/${r.topic_id}/v/${r.published_date}/${r.slug_keywords}`;
    const title = (r.title ?? "").slice(0, 60);
    console.log(`  ${r.lang}  ${url.padEnd(70)}  ${title}`);
  }
}

// ─── Final report ────────────────────────────────────────────────────
const { count: total } = await db
  .from("video_transcriptions")
  .select("*", { count: "exact", head: true });
const { count: withSlug } = await db
  .from("video_transcriptions")
  .select("*", { count: "exact", head: true })
  .not("slug_keywords", "is", null);
const { count: withoutTopic } = await db
  .from("video_transcriptions")
  .select("*", { count: "exact", head: true })
  .is("topic_id", null);

console.log("\n• Final state:");
console.log(`  ${withSlug ?? 0} / ${total ?? 0} rows have a slug (SSR-eligible).`);
console.log(`  ${withoutTopic ?? 0} rows still missing topic_id (assign topic to their channel and re-run).`);
