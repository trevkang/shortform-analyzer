import { execFile } from "node:child_process";
import type { ApinoaOptions, FfmpegOptions, OpenAIOptions } from "../types.js";

/** Runs a program and resolves its stdout and stderr; rejects with the last line of stderr. */
export function run(cmd: string, args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd}: ${stderr.toString().trim().split("\n").pop() || err.message}`));
      else resolve({ stdout, stderr: stderr.toString() });
    });
  });
}

export const ffmpeg = (o: FfmpegOptions = {}) => o.ffmpegPath ?? "ffmpeg";
export const ffprobe = (o: FfmpegOptions = {}) => o.ffprobePath ?? "ffprobe";

/** Throws with the stage in front, so a composed pipeline's error says where it broke. */
export async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(msg.startsWith(`${name}:`) ? msg : `${name}: ${msg}`);
  }
}

export const REQUEST_TIMEOUT_MS = 180_000; // a hung request gives up after 3 minutes
export const RETRIES = 3;
/** The longest wait between tries, whatever Retry-After says, unless a caller raises it. */
export const MAX_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One request that gives up after `timeoutMs`, trying a 429 or 5xx reply again up to 3 times, waiting as long as its
 * Retry-After says, at most `maxWaitMs` (60 s; else 2, 4 and 6 s).
 */
export async function send(
  f: typeof fetch, url: string, init: RequestInit = {},
  o: { timeoutMs?: number; maxWaitMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs ?? REQUEST_TIMEOUT_MS) });
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      const after = Number(res.headers.get("retry-after") ?? NaN);
      await (o.wait ?? sleep)(Number.isFinite(after) && after >= 0 ? Math.min(after * 1000, o.maxWaitMs ?? MAX_WAIT_MS) : 2000 * (attempt + 1));
      continue;
    }
    return res;
  }
}

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** The key, the base URL (no trailing slash) and fetch for an OpenAI call; throws `<stage>: OPENAI_API_KEY is not set`. */
export function openai(o: OpenAIOptions, stageName: string) {
  const key = o.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error(`${stageName}: OPENAI_API_KEY is not set (set it, or pass openaiApiKey)`);
  const base = (o.openaiBaseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
  return { key, base, fetch: o.fetch ?? fetch };
}

/** The key and fetch for an apinoa call; throws `<stage>: APINOA_API_KEY is not set`. */
export function apinoaKey(o: ApinoaOptions, stageName: string) {
  const key = o.apinoaApiKey ?? process.env.APINOA_API_KEY ?? "";
  if (!key) throw new Error(`${stageName}: APINOA_API_KEY is not set (set it, or pass apinoaApiKey)`);
  return { key, fetch: o.fetch ?? fetch };
}
