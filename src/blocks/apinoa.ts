// TikTok through apinoa (https://apinoa.com/docs/api-reference/tiktok), with @apinoa/sdk: the post read, the comments
// read, and the links in a post. $0.001 a call. The post's links are signed and expire about 2 days after the read.
import { writeFile } from "node:fs/promises";
import { ApinoaClient, ApinoaError, type Apinoa } from "@apinoa/sdk";
import type { ApinoaOptions, Post } from "../types.js";
import { apinoaKey, REQUEST_TIMEOUT_MS, RETRIES, send, stage } from "./run.js";

export const COMMENTS_LIMIT = 50; // the most one comments read returns
const DOWNLOAD_TIMEOUT_MS = 120_000;

function client(options: ApinoaOptions, stageName: string): ApinoaClient {
  const { key, fetch } = apinoaKey(options, stageName);
  return new ApinoaClient({ apiKey: key, fetch, timeoutInSeconds: REQUEST_TIMEOUT_MS / 1000, maxRetries: RETRIES });
}

/** The SDK's error as one line: `apinoa <call> <status>: <code> <message>`. */
async function call<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ApinoaError)) throw e;
    if (e.statusCode === 404) throw new Error(`apinoa ${name} 404: not found (deleted, private, or a wrong id)`);
    const error = (e.body as { error?: { code?: string; message?: string } } | undefined)?.error;
    const why = error ? `${error.code ?? ""} ${error.message ?? ""}`.trim() : e.message.split("\n")[0];
    throw new Error(`apinoa ${name}${e.statusCode ? ` ${e.statusCode}` : ""}: ${why}`);
  }
}

/** One apinoa post read: the post, with its links, subtitle tracks and TikTok's labels. */
export function readPost(postId: string, options: ApinoaOptions = {}): Promise<Post> {
  return stage("source", async () => (await call("post", () => client(options, "source").tiktok.post({ id: postId }))).data);
}

/** One apinoa comments read: up to 50 of the post's top comments, as apinoa returns them. */
export function readComments(postId: string, options: ApinoaOptions = {}): Promise<Apinoa.CommentPage> {
  return stage("comments", async () =>
    (await call("comments", () => client(options, "comments").tiktok.comments({ post: postId, limit: COMMENTS_LIMIT }))).data);
}

export type PostMedia = {
  /** The video's link, when the post is a video. */
  video?: string;
  /** The photos' links, in order, when the post is a photo post. */
  photos: string[];
  /** TikTok's own speech recognition (`ASR`), in the language spoken. Never a translation (`MT`). */
  subtitles?: { lang: string; url: string };
};

type Track = { lang?: string; source?: string; url?: string };

/** The links in a post: its video or its photos, and the ASR subtitle track. */
export function postMedia(post: Post): PostMedia {
  const media = post.media ?? [];
  const video = media.find((m) => m.type === "video");
  if (!video) return { photos: media.filter((m) => m.type === "image" && m.url).map((m) => m.url) };
  const tracks = (video.ext?.subtitles ?? []) as Track[];
  const track = tracks.find((t) => t.source === "ASR" && t.url);
  return {
    ...(video.url ? { video: video.url } : {}),
    photos: [],
    ...(track ? { subtitles: { lang: track.lang ?? "", url: track.url! } } : {}),
  };
}

/** TikTok's links answer 403 without these. */
export const BROWSER_HEADERS = { Referer: "https://www.tiktok.com/", "User-Agent": "Mozilla/5.0" };

/** Saves one of the post's links to `dest`. Throws `source: download <status>`. */
export function download(url: string, dest: string, options: { fetch?: typeof fetch } = {}): Promise<void> {
  return stage("source", async () => {
    const res = await send(options.fetch ?? fetch, url, { headers: BROWSER_HEADERS }, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    if (!res.ok) throw new Error(`download ${res.status}`);
    await writeFile(dest, new Uint8Array(await res.arrayBuffer()));
  });
}

/** A subtitle file's text. Throws `speech: subtitles <status>`. */
export function fetchSubtitles(url: string, options: { fetch?: typeof fetch } = {}): Promise<string> {
  return stage("speech", async () => {
    const res = await send(options.fetch ?? fetch, url, { headers: BROWSER_HEADERS }, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    if (!res.ok) throw new Error(`subtitles ${res.status}`);
    return res.text();
  });
}
