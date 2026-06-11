import changelogJson from "@/data/changelog-entries.json";

export interface ChangelogEntryDef {
  version: string;
  title_en: string;
  title_fr: string;
  body_en: string;
  body_fr: string;
  created_at: string;
}

/**
 * Human-facing changelog, one entry per release, newest first.
 *
 * The content lives in `src/data/changelog-entries.json` (~580 KB of
 * markdown) so it stays out of the TS source and is only loaded by the
 * server-side `/api/changelog` route. Add new releases at the TOP of the
 * JSON array — `scripts/release.mjs` checks that the current version has
 * an entry there before each release.
 */
export const CHANGELOG_ENTRIES = changelogJson as ChangelogEntryDef[];
