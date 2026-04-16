const BASE = "https://transcriptapi.com/api/v2/youtube";

function getApiKey(): string {
  const key = process.env.TRANSCRIPT_API_KEY;
  if (!key) throw new Error("TRANSCRIPT_API_KEY is not set");
  return key;
}

function headers(): HeadersInit {
  return { Authorization: `Bearer ${getApiKey()}` };
}

export interface RssVideoResult {
  videoId: string | null;
  title: string | null;
  channelId: string | null;
  author: string | null;
  published: string | null;
  updated: string | null;
  link: string | null;
  description: string | null;
  thumbnail: { url: string | null; width: string | null; height: string | null } | null;
  viewCount: string | null;
}

interface ChannelLatestResponse {
  channel: { channelId: string | null; title: string | null; author: string | null; url: string | null } | null;
  results: RssVideoResult[];
  result_count: number;
}

interface ChannelResolveResponse {
  channel_id: string;
  resolved_from: string;
}

export async function resolveChannel(input: string): Promise<ChannelResolveResponse> {
  const url = `${BASE}/channel/resolve?input=${encodeURIComponent(input)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`channel/resolve ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getChannelLatest(channel: string): Promise<ChannelLatestResponse> {
  const url = `${BASE}/channel/latest?channel=${encodeURIComponent(channel)}`;
  const res = await fetch(url, { headers: headers(), next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`channel/latest ${res.status}: ${body}`);
  }
  return res.json();
}

/* ── Video transcript (1 credit) ──────────────────────────────────── */

interface TranscriptSegment {
  text: string;
  start?: number;
  duration?: number;
}

interface TranscriptResponse {
  video_id: string;
  language: string;
  transcript: TranscriptSegment[];
}

export interface TranscriptResult {
  text: string;
  language: string;
  segmentCount: number;
  wordCount: number;
  durationSec: number;
}

/**
 * Fetch a video transcript, parse JSON segments, and return clean plain
 * text with all timing data stripped out.
 */
export async function getVideoTranscript(videoId: string): Promise<TranscriptResult> {
  const url = `${BASE}/transcript?video_url=${encodeURIComponent(videoId)}&format=json`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`transcript ${res.status}: ${body}`);
  }
  const data: TranscriptResponse = await res.json();

  const cleanText = data.transcript
    .map((seg) => seg.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const lastSeg = data.transcript[data.transcript.length - 1];
  const durationSec = lastSeg ? Math.round((lastSeg.start ?? 0) + (lastSeg.duration ?? 0)) : 0;

  return {
    text: cleanText,
    language: data.language,
    segmentCount: data.transcript.length,
    wordCount: cleanText.split(/\s+/).length,
    durationSec,
  };
}
