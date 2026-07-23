import { getServerClient, withClient } from "./client";
import { toUtcDateString } from "@/lib/dates-utc";

/**
 * Service-role helpers around the `user_event` table (mig. 030+).
 *
 * Append-only event log — every meaningful UI interaction by an
 * authenticated or anonymous visitor lands here as a single row.
 * Paired with the existing `user_activity` table (state toggles), it
 * powers the owner-only « User Activity » stats page.
 *
 * Two consumers:
 *  - `insertUserEvents` — called by `/api/user/event` on every batch
 *    POST from the client tracker.
 *  - `getActivityStats` — called by `/api/users/activity-stats` to
 *    produce the full payload for the admin dashboard.
 *
 * The aggregation is intentionally done in JS rather than SQL: a
 * 30-day window yields a few hundred thousand rows at most for this
 * product's scale (low-traffic indie), and the 12 chart payloads share
 * the same row stream, so a single fetch + 12 in-memory passes is
 * simpler than 12 round-trips with bespoke `group by` queries.
 */

/** Single row written to `user_event`. The `id` and `created_at`
 *  columns are filled by Postgres defaults. */
export interface UserEventInsert {
  user_id: string | null;
  visitor_id: string | null;
  event_type: string;
  target_id?: string | null;
  action?: string | null;
  lang?: string | null;
  path?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Batch insert. Returns the number of rows accepted (0 on any error).
 *  Silent failure so a temporary DB hiccup never propagates into the
 *  user-facing POST endpoint — telemetry must never break UX. */
export async function insertUserEvents(rows: UserEventInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  return withClient("insertUserEvents", 0, async (supabase) => {
    const { error } = await supabase.from("user_event").insert(rows);
    if (error) {
      console.error("[insertUserEvents] insert failed:", error.message);
      return 0;
    }
    return rows.length;
  }, "error");
}

// ───── Stats aggregation ───────────────────────────────────────────

export type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export interface ActivityStats {
  period: { value: Period; fromISO: string; toISO: string };
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    totalEvents: number;
    activeUsersInPeriod: number;
    totalRegisteredUsers: number;
    newSignupsInPeriod: number;
  };
  signupsByWeek: Array<{ weekStart: string; count: number }>;
  anonToAuth: { anonVisitors: number; converted: number; rate: number };
  eventsByType: Array<{ type: string; count: number }>;
  funnel: Array<{ key: string; label: string; count: number; rate: number }>;
  /** `heatmap[dayOfWeek 0=Sun..6=Sat][hour 0..23]` = event count. */
  heatmap: number[][];
  topContent: {
    favorites: Array<{ url: string; netAdds: number }>;
    videos: Array<{ videoId: string; plays: number }>;
  };
  langSplit: { en: number; fr: number; unknown: number };
  featureAdoption: Array<{ feature: string; adopted: number; totalUsers: number; rate: number }>;
  leaderboard: Array<{
    userId: string;
    email: string | null;
    eventCount: number;
    lastEventAt: string;
    signupAt: string | null;
  }>;
  retentionCohorts: Array<{
    cohortWeekStart: string;
    cohortSize: number;
    /** Index 0 = signup week itself (always 100% by definition, returned
     *  for reference); index N = % of cohort active in week N. */
    weeklyReturnRate: number[];
  }>;
}

interface RawEventRow {
  user_id: string | null;
  visitor_id: string | null;
  event_type: string;
  target_id: string | null;
  action: string | null;
  lang: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface RawAuthUser {
  id: string;
  email: string | null;
  created_at: string | null;
}

/** Computes the start of the ISO week (Monday) for a given date, as a
 *  `YYYY-MM-DD` string. Used by the signup chart, the cohort timeline
 *  and the retention computation. */
function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 = Sun..6 = Sat
  // Shift to ISO Monday: -1 from JS Sunday(0), keep Monday(1) as-is.
  const shift = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + shift);
  return toUtcDateString(x);
}

/** Pulls every `user_event` row strictly after `sinceISO` (inclusive).
 *  Pages through 1000 rows at a time — same pattern as cron-stats. */
async function fetchEvents(sinceISO: string | null): Promise<RawEventRow[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  const supabase = await clientP;
  const out: RawEventRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let q = supabase
      .from("user_event")
      .select("user_id, visitor_id, event_type, target_id, action, lang, meta, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (sinceISO) q = q.gte("created_at", sinceISO);
    const { data, error } = await q;
    if (error) {
      // Don't truncate silently: a failed page skews every downstream
      // metric (DAU, funnel, retention) with no trace otherwise.
      console.warn("[fetchEvents] page query failed — stats truncated:", error.message);
      break;
    }
    if (!data) break;
    const batch = data as unknown as RawEventRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    // Defensive safety net: never accumulate more than 200k rows in
    // memory for a single stats call. At our traffic scale this should
    // never trip, but keeps a runaway query bounded.
    if (offset > 200_000) break;
  }
  return out;
}

/** Pulls auth.users via the admin API. Pages through 1000 at a time.
 *  Returns the minimal projection needed by the leaderboard + cohort
 *  chart (id, email, signup timestamp). */
async function fetchUsers(): Promise<RawAuthUser[]> {
  const clientP = getServerClient();
  if (!clientP) return [];
  const supabase = await clientP;
  const out: RawAuthUser[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
      });
    }
    if (data.users.length < 1000) break;
    page += 1;
    if (page > 50) break; // 50k cap
  }
  return out;
}

/** Feature-adoption signal: for each tracked feature, count distinct
 *  `user_id`s that emitted at least one matching event. The set of
 *  `event_type` strings per feature is small and explicit so the chart
 *  rows stay stable even as we add new event types. */
const FEATURE_SIGNALS: Array<{ key: string; label: string; eventTypes: string[] }> = [
  { key: "lang_switch", label: "Language switch", eventTypes: ["settings.lang_switch"] },
  { key: "tts_speed", label: "TTS speed change", eventTypes: ["settings.tts_speed_change"] },
  { key: "tts_voice", label: "TTS voice change", eventTypes: ["settings.tts_voice_change"] },
  { key: "newsletter", label: "Newsletter subscribe", eventTypes: ["newsletter.subscribe"] },
  { key: "favorite", label: "Favorited an article/video", eventTypes: ["favorite.add"] },
  { key: "audio_play", label: "Played audio (TTS)", eventTypes: ["audio.play"] },
  { key: "video_play", label: "Played a video", eventTypes: ["top_video.play_start"] },
  { key: "topic_perso", label: "Personalized topics", eventTypes: ["topic.preference_toggle"] },
  { key: "outbound", label: "Clicked an article link", eventTypes: ["article.link_click", "top24h.ref_click"] },
];

/** Funnel definition — canonical conversion stages. Each step's
 *  population is "distinct (user_id || visitor_id) that emitted any of
 *  the matching events in the period". `rate` is computed against the
 *  PREVIOUS step (not the top), so each row shows the step-to-step
 *  drop. The first step's rate is 100% by definition. */
const FUNNEL_STEPS: Array<{ key: string; label: string; eventTypes: string[] }> = [
  { key: "visit", label: "Page view", eventTypes: ["page.view"] },
  { key: "podcast_open", label: "Top 24h group expanded", eventTypes: ["top24h.group_expand"] },
  { key: "favorite", label: "Favorited an item", eventTypes: ["favorite.add"] },
  { key: "newsletter", label: "Subscribed to newsletter", eventTypes: ["newsletter.subscribe"] },
];

export async function getActivityStats(period: Period): Promise<ActivityStats> {
  const now = new Date();
  const sinceISO =
    period === "all"
      ? null
      : new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000).toISOString();

  // Two independent fetches kicked off in parallel.
  const [events, users] = await Promise.all([
    fetchEvents(sinceISO),
    fetchUsers(),
  ]);

  // ───── KPIs ──────────────────────────────────────────────────
  const nowMs = now.getTime();
  const dayMs = 86_400_000;
  const dauKey = (r: RawEventRow) => r.user_id ?? r.visitor_id ?? "";
  const distinctIn = (days: number): number => {
    const cut = nowMs - days * dayMs;
    const set = new Set<string>();
    for (const e of events) {
      if (new Date(e.created_at).getTime() >= cut) {
        const k = dauKey(e);
        if (k) set.add(k);
      }
    }
    return set.size;
  };
  const activeUsersInPeriod = (() => {
    const set = new Set<string>();
    for (const e of events) {
      const k = dauKey(e);
      if (k) set.add(k);
    }
    return set.size;
  })();
  const newSignupsInPeriod = (() => {
    if (!sinceISO) return users.filter((u) => u.created_at).length;
    return users.filter(
      (u) => u.created_at && new Date(u.created_at).toISOString() >= sinceISO,
    ).length;
  })();

  // ───── Signups by ISO week ──────────────────────────────────
  const signupBuckets = new Map<string, number>();
  for (const u of users) {
    if (!u.created_at) continue;
    if (sinceISO && new Date(u.created_at).toISOString() < sinceISO) continue;
    const wk = isoWeekStart(new Date(u.created_at));
    signupBuckets.set(wk, (signupBuckets.get(wk) ?? 0) + 1);
  }
  const signupsByWeek = Array.from(signupBuckets.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // ───── Anonymous → Auth conversion ──────────────────────────
  // A "converted" visitor is one whose `visitor_id` ever appears in a
  // row AND whose `visitor_id` ALSO appears in another row alongside a
  // non-null `user_id` — meaning the same browser session bridged from
  // anonymous to authenticated.
  const anonVisitorIds = new Set<string>();
  const visitorIdsThatLoggedIn = new Set<string>();
  for (const e of events) {
    if (e.visitor_id) anonVisitorIds.add(e.visitor_id);
    if (e.visitor_id && e.user_id) visitorIdsThatLoggedIn.add(e.visitor_id);
  }
  // Also consider visitor_ids that appear with user_id NULL in some
  // rows and with user_id set in OTHERS (the tracker may strip the
  // visitor_id once the session is established, so we cross-check).
  const visitorToUsers = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.visitor_id && e.user_id) {
      const s = visitorToUsers.get(e.visitor_id) ?? new Set<string>();
      s.add(e.user_id);
      visitorToUsers.set(e.visitor_id, s);
    }
  }
  const convertedCount = visitorIdsThatLoggedIn.size + visitorToUsers.size;
  const dedupConverted = new Set<string>([
    ...visitorIdsThatLoggedIn,
    ...visitorToUsers.keys(),
  ]).size;
  void convertedCount;
  const anonToAuth = {
    anonVisitors: anonVisitorIds.size,
    converted: dedupConverted,
    rate: anonVisitorIds.size > 0 ? dedupConverted / anonVisitorIds.size : 0,
  };

  // ───── Event volume by type ──────────────────────────────────
  const typeCounts = new Map<string, number>();
  for (const e of events) {
    typeCounts.set(e.event_type, (typeCounts.get(e.event_type) ?? 0) + 1);
  }
  const eventsByType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // ───── Funnel ────────────────────────────────────────────────
  const funnelCounts = FUNNEL_STEPS.map((step) => {
    const set = new Set<string>();
    const typeSet = new Set(step.eventTypes);
    for (const e of events) {
      if (typeSet.has(e.event_type)) {
        const k = dauKey(e);
        if (k) set.add(k);
      }
    }
    return { ...step, count: set.size };
  });
  const funnelTopCount = funnelCounts[0]?.count ?? 0;
  const funnel = funnelCounts.map((s, i) => ({
    key: s.key,
    label: s.label,
    count: s.count,
    rate:
      i === 0
        ? 1
        : funnelCounts[i - 1].count > 0
          ? s.count / funnelCounts[i - 1].count
          : 0,
  }));
  void funnelTopCount;

  // ───── Time-of-day heatmap ──────────────────────────────────
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of events) {
    const d = new Date(e.created_at);
    heatmap[d.getUTCDay()][d.getUTCHours()] += 1;
  }

  // ───── Top content ──────────────────────────────────────────
  // Top favorited URLs: net (add - remove) across the period.
  const favoriteNet = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === "favorite.add" && e.target_id) {
      favoriteNet.set(e.target_id, (favoriteNet.get(e.target_id) ?? 0) + 1);
    } else if (e.event_type === "favorite.remove" && e.target_id) {
      favoriteNet.set(e.target_id, (favoriteNet.get(e.target_id) ?? 0) - 1);
    }
  }
  const topFavorites = Array.from(favoriteNet.entries())
    .filter(([, n]) => n > 0)
    .map(([url, netAdds]) => ({ url, netAdds }))
    .sort((a, b) => b.netAdds - a.netAdds)
    .slice(0, 10);

  // Top played videos: any event implying a video play.
  const videoPlays = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === "top_video.play_start" && e.target_id) {
      videoPlays.set(e.target_id, (videoPlays.get(e.target_id) ?? 0) + 1);
    }
  }
  const topVideos = Array.from(videoPlays.entries())
    .map(([videoId, plays]) => ({ videoId, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10);

  // ───── Language split ────────────────────────────────────────
  let langEn = 0;
  let langFr = 0;
  let langUnknown = 0;
  for (const e of events) {
    if (e.lang === "en") langEn += 1;
    else if (e.lang === "fr") langFr += 1;
    else langUnknown += 1;
  }

  // ───── Feature adoption ──────────────────────────────────────
  const totalAuthUsers = users.length;
  const featureAdoption = FEATURE_SIGNALS.map((sig) => {
    const set = new Set<string>();
    const typeSet = new Set(sig.eventTypes);
    for (const e of events) {
      if (e.user_id && typeSet.has(e.event_type)) set.add(e.user_id);
    }
    return {
      feature: sig.label,
      adopted: set.size,
      totalUsers: totalAuthUsers,
      rate: totalAuthUsers > 0 ? set.size / totalAuthUsers : 0,
    };
  });

  // ───── User leaderboard ──────────────────────────────────────
  const perUser = new Map<string, { count: number; lastAt: string }>();
  for (const e of events) {
    if (!e.user_id) continue;
    const cur = perUser.get(e.user_id);
    if (!cur) {
      perUser.set(e.user_id, { count: 1, lastAt: e.created_at });
    } else {
      cur.count += 1;
      if (e.created_at > cur.lastAt) cur.lastAt = e.created_at;
    }
  }
  const usersById = new Map(users.map((u) => [u.id, u]));
  const leaderboard = Array.from(perUser.entries())
    .map(([userId, { count, lastAt }]) => ({
      userId,
      email: usersById.get(userId)?.email ?? null,
      eventCount: count,
      lastEventAt: lastAt,
      signupAt: usersById.get(userId)?.created_at ?? null,
    }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 20);

  // ───── Retention cohorts ─────────────────────────────────────
  // For each ISO week within the period, bucket users by their signup
  // week, then for N = 0..7 compute the % of that cohort that emitted
  // at least one event in week (signupWeek + N).
  const userEventWeeks = new Map<string, Set<string>>(); // user_id → set of week starts
  for (const e of events) {
    if (!e.user_id) continue;
    const wk = isoWeekStart(new Date(e.created_at));
    let set = userEventWeeks.get(e.user_id);
    if (!set) {
      set = new Set();
      userEventWeeks.set(e.user_id, set);
    }
    set.add(wk);
  }
  const cohorts = new Map<string, string[]>(); // signup week → user ids
  for (const u of users) {
    if (!u.created_at) continue;
    if (sinceISO && new Date(u.created_at).toISOString() < sinceISO) continue;
    const wk = isoWeekStart(new Date(u.created_at));
    const arr = cohorts.get(wk) ?? [];
    arr.push(u.id);
    cohorts.set(wk, arr);
  }
  const retentionCohorts = Array.from(cohorts.entries())
    .map(([cohortWeekStart, userIds]) => {
      const weekly: number[] = [];
      const startMs = new Date(`${cohortWeekStart}T00:00:00Z`).getTime();
      for (let n = 0; n <= 7; n += 1) {
        const targetWk = isoWeekStart(new Date(startMs + n * 7 * dayMs));
        let returned = 0;
        for (const uid of userIds) {
          if (userEventWeeks.get(uid)?.has(targetWk)) returned += 1;
        }
        weekly.push(userIds.length > 0 ? returned / userIds.length : 0);
      }
      return { cohortWeekStart, cohortSize: userIds.length, weeklyReturnRate: weekly };
    })
    .sort((a, b) => a.cohortWeekStart.localeCompare(b.cohortWeekStart));

  return {
    period: {
      value: period,
      fromISO: sinceISO ?? new Date(0).toISOString(),
      toISO: now.toISOString(),
    },
    kpis: {
      dau: distinctIn(1),
      wau: distinctIn(7),
      mau: distinctIn(30),
      totalEvents: events.length,
      activeUsersInPeriod,
      totalRegisteredUsers: totalAuthUsers,
      newSignupsInPeriod,
    },
    signupsByWeek,
    anonToAuth,
    eventsByType,
    funnel,
    heatmap,
    topContent: {
      favorites: topFavorites,
      videos: topVideos,
    },
    langSplit: { en: langEn, fr: langFr, unknown: langUnknown },
    featureAdoption,
    leaderboard,
    retentionCohorts,
  };
}
