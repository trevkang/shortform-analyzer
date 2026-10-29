// Test videos and photos made with ffmpeg lavfi, and OpenAI, apinoa and TikTok's links faked at fetch. No test touches
// the network.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"]); execFileSync("ffprobe", ["-version"]); return true; } catch { return false; } })();

export const tmp = (prefix = "sfa-test-") => mkdtempSync(join(tmpdir(), prefix));

/** Example 1 and 2: three 1.5 s solid-colour shots (red, green, blue), 360x640, with or without a 440 Hz tone. */
export function makeCuts(audio = true): string {
  const out = join(tmp(), audio ? "cuts.mp4" : "silent.mp4");
  const shots = ["red", "green", "blue"].flatMap((c) => ["-f", "lavfi", "-i", `color=c=${c}:s=360x640:r=30:d=1.5`]);
  const tone = audio ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=4.5"] : [];
  execFileSync("ffmpeg", ["-v", "error", "-y", ...shots, ...tone,
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", ...(audio ? ["-map", "3:a", "-shortest"] : []),
    "-pix_fmt", "yuv420p", out]);
  return out;
}

/** Example 3: one 11 s take, no audio. */
export function makeLongTake(): string {
  const out = join(tmp(), "take.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=360x640:r=30:d=11", "-pix_fmt", "yuv420p", out]);
  return out;
}

/** Example 22: one photo of a solid colour, as PNG. */
export function makePhoto(color: string): string {
  const out = join(tmp(), `${color}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=360x640`, "-frames:v", "1", out]);
  return out;
}

export const POST_ID = "7500726429689204010";
export const TIKTOK_URL = `https://www.tiktok.com/@creator/video/${POST_ID}`;
export const VIDEO_URL = "https://v.tiktok.test/play/1.mp4";
export const ASR_URL = "https://s.tiktok.test/asr.vtt";
export const MT_URL = "https://s.tiktok.test/mt.vtt";
export const CREATOR_ID = "creator-1";

/** Example 11's subtitles: one cue in the first scene, one in the last. */
export const ASR_VTT = "WEBVTT\n\n00:00.200 --> 00:01.000\nTwo apps\n\n00:03.200 --> 00:04.000\nComment notes\n";

/** An apinoa post read's `data`, shaped as @apinoa/sdk's Post. */
export function tiktokPost(o: { id?: string; video?: string; photos?: string[]; tracks?: { source: string; url: string; lang?: string }[] } = {}): any {
  const id = o.id ?? POST_ID;
  return {
    platform: "tiktok", id, url: `https://www.tiktok.com/@creator/video/${id}`,
    author: { platform: "tiktok", id: CREATOR_ID, handle: "creator" },
    text: "Two apps that got me through finals", lang: "en",
    media: o.photos
      ? o.photos.map((url) => ({ type: "image", url, width: 360, height: 640 }))
      : [{ type: "video", url: o.video ?? VIDEO_URL, durationSec: 4.5, ext: { subtitles: (o.tracks ?? []).map((t) => ({ lang: t.lang ?? "eng-US", format: "webvtt", ...t })) } }],
    entities: { hashtags: ["studytok"] },
    audio: { id: "s1", title: "original sound", artist: "creator" },
    aiGenerated: false,
    ext: {
      stickerText: ["2 apps for finals"], diversificationLabels: ["Education"], disclosure: "paid_partnership", ranAsAd: false,
      anchors: [{ id: "a1", name: "Green Screen", type: "effect" }], music: { original: true },
    },
  };
}

export type Call = { kind: "post" | "comments" | "video" | "subtitles" | "photo" | "transcription" | "describe" | "decide"; url: string; body?: any; headers?: Headers };

export type FakeOptions = {
  // OpenAI
  topic?: string;
  format?: string;
  sells?: string;
  /** asks_for_comment's probability. Default 0.1. */
  asks?: number;
  /** role_<i> by scene index; default body. */
  roles?: string[];
  /** kind_<i> by comment index; default positive. */
  kinds?: string[];
  product?: string;
  describeOutput?: (scenes: number) => unknown;
  describeStatus?: number;
  /** Status of a describe request on the flex tier (429: no capacity). */
  flexStatus?: number;
  describeUsage?: { input_tokens: number; output_tokens: number };
  decideUsage?: { input_tokens: number };
  decisionsReply?: (body: any) => unknown;
  whisper?: unknown;
  transcriptionStatus?: number;
  // apinoa and TikTok's links
  /** Successive post reads; the last repeats. */
  posts?: any[];
  postStatus?: number;
  comments?: any[];
  commentsStatus?: number;
  /** The local file served for every video link. */
  video?: string;
  /** Status of successive video downloads; past the list, 200. */
  videoStatus?: number[];
  vtt?: Record<string, string>;
  /** Photo link → local image file. */
  photos?: Record<string, string>;
};

/** Answers every question in a Decisions request, from its own question list. */
function answers(body: any, o: FakeOptions) {
  return body.questions.map((q: any) => {
    const m = q.name.match(/^(role|footage|kind)_(\d+)$/);
    if (q.type === "predicate") {
      const p = q.name === "asks_for_comment" ? (o.asks ?? 0.1) : q.name.startsWith("shows_product_") ? 0.7 : q.name.startsWith("q_") ? 0.9 : 0.5;
      return { type: "predicate", name: q.name, probability: p };
    }
    const choice = q.name === "topic" ? (o.topic ?? "education")
      : q.name === "format" ? (o.format ?? "listicle")
      : q.name === "sells" ? (o.sells ?? "none")
      : m?.[1] === "role" ? (o.roles?.[Number(m[2])] ?? "body")
      : m?.[1] === "footage" ? "screen"
      : m?.[1] === "kind" ? (o.kinds?.[Number(m[2])] ?? "positive")
      : q.choices[0].value;
    const rest = (1 - 0.7) / Math.max(q.choices.length - 1, 1);
    return { type: "choice", name: q.name, choice, probabilities: q.choices.map((c: any) => ({ value: c.value, probability: c.value === choice ? 0.7 : rest })) };
  });
}

export const WHISPER = {
  text: "Wait for it. Follow!", language: "english", duration: 4.5,
  segments: [
    { start: 0, end: 1, text: " Wait for it.", no_speech_prob: 0.1, avg_logprob: -0.2 },
    { start: 3.4, end: 4.1, text: " Follow!", no_speech_prob: 0.1, avg_logprob: -0.2 },
  ],
  words: [
    { word: "Wait", start: 0.2, end: 0.4 }, { word: "for", start: 0.4, end: 0.6 }, { word: "it.", start: 0.6, end: 0.8 },
    { word: "Follow!", start: 3.5, end: 4.0 },
  ],
};

const apinoaError = (status: number, code: string) => Response.json({ success: false, error: { code, message: code.toLowerCase().replace(/_/g, " ") } }, { status });

/** The fake world: OpenAI, apinoa and TikTok's links. `calls` lists every request in order. */
export function fake(o: FakeOptions = {}) {
  const calls: Call[] = [];
  let postReads = 0;
  let downloads = 0;
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const u = new URL(url);
    const headers = new Headers(init.headers as HeadersInit | undefined);
    if (u.host === "gateway.apinoa.com") {
      if (u.pathname === "/v1/tiktok/post") {
        calls.push({ kind: "post", url, headers });
        if (o.postStatus) return apinoaError(o.postStatus, o.postStatus === 404 ? "NOT_FOUND" : "UPSTREAM_ERROR");
        const posts = o.posts ?? [tiktokPost()];
        return Response.json({ success: true, data: posts[Math.min(postReads++, posts.length - 1)], requestId: "r1" });
      }
      if (u.pathname === "/v1/tiktok/comments") {
        calls.push({ kind: "comments", url, headers });
        if (o.commentsStatus) return apinoaError(o.commentsStatus, "UPSTREAM_ERROR");
        return Response.json({ success: true, data: { platform: "tiktok", items: o.comments ?? [] }, requestId: "r2" });
      }
    }
    if (u.host === "v.tiktok.test") {
      calls.push({ kind: "video", url, headers });
      const status = o.videoStatus?.[downloads++] ?? 200;
      if (status !== 200) return new Response("forbidden", { status });
      return new Response(new Uint8Array(readFileSync(o.video!)));
    }
    if (u.host === "s.tiktok.test") {
      calls.push({ kind: "subtitles", url, headers });
      const vtt = o.vtt?.[url];
      return vtt === undefined ? new Response("gone", { status: 404 }) : new Response(vtt);
    }
    if (u.host === "p.tiktok.test") {
      calls.push({ kind: "photo", url, headers });
      const file = o.photos?.[url];
      return file ? new Response(new Uint8Array(readFileSync(file))) : new Response("gone", { status: 404 });
    }
    if (url.endsWith("/audio/transcriptions")) {
      calls.push({ kind: "transcription", url, headers });
      if (o.transcriptionStatus) return Response.json({ error: { message: "bad audio" } }, { status: o.transcriptionStatus });
      return Response.json(o.whisper ?? WHISPER);
    }
    if (url.endsWith("/responses")) {
      const body = JSON.parse(String(init.body));
      calls.push({ kind: "describe", url, body, headers });
      if (o.describeStatus) return Response.json({ error: { message: "bad request" } }, { status: o.describeStatus });
      if (body.service_tier === "flex" && o.flexStatus) {
        // OpenAI sends Retry-After 300 here; 0 keeps the test from waiting it out
        return Response.json({ error: { message: "Flex processing is temporarily unavailable." } }, { status: o.flexStatus, headers: { "retry-after": "0" } });
      }
      const scenes = body.input[0].content.filter((c: any) => c.type === "input_image").length;
      const output = o.describeOutput?.(scenes) ?? {
        product: o.product ?? "", tags: ["Study", "#Apps", "study", "notes"], description: "A student shows two apps.",
        formatDescription: "Face to camera, then screen recordings.", onScreenText: Array.from({ length: scenes }, (_, i) => (i === 0 ? "2 apps" : "")),
      };
      return Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
        usage: o.describeUsage ?? { input_tokens: 1000, output_tokens: 200 }, service_tier: body.service_tier ?? "default",
      });
    }
    if (url.endsWith("/decisions")) {
      const body = JSON.parse(String(init.body));
      calls.push({ kind: "decide", url, body, headers });
      if (o.decisionsReply) return Response.json(o.decisionsReply(body));
      return Response.json({ answers: answers(body, o), usage: o.decideUsage ?? { input_tokens: 2000 } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetchFn, calls, kinds: () => calls.map((c) => c.kind) };
}

/** The keys every pipeline test passes, so no test reads the environment's. */
export const KEYS = { openaiApiKey: "k", apinoaApiKey: "a" };

/** The text the model read in a request, joined. */
export const readText = (body: any) => body.input[0].content.filter((c: any) => c.type === "input_text").map((c: any) => c.text).join("\n");

/** Runs `fn` with env vars set (undefined deletes), then restores them. */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
