import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Input, Post } from "../types.js";
import { stage } from "./run.js";

export type ResolvedInput =
  | { kind: "file"; path: string; cleanup: () => Promise<void> }
  | { kind: "tiktok"; postId: string; post?: Post; cleanup: () => Promise<void> };

const keep = async () => {};

async function tempFile(bytes: Buffer): Promise<ResolvedInput> {
  const dir = await mkdtemp(join(tmpdir(), "shortform-analyzer-"));
  const path = join(dir, "video.mp4");
  await writeFile(path, bytes);
  return { kind: "file", path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** The post id in a TikTok post URL (`/video/<id>` or `/photo/<id>`), else undefined. Short links have none. */
export function tiktokPostId(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return undefined;
  return u.pathname.match(/\/(?:video|photo)\/(\d+)/)?.[1];
}

/**
 * A path, the video's bytes, a TikTok post URL or `{ post }` → a local file, or the TikTok post to read. Bytes go to a
 * temp file that `cleanup` removes; a path is used as it is. Any other URL is refused.
 */
export function resolveInput(input: Input): Promise<ResolvedInput> {
  return stage("input", async () => {
    if (Buffer.isBuffer(input)) return tempFile(input);
    if (input && typeof input === "object" && "post" in input) {
      const id = input.post?.id;
      if (!id) throw new Error("the post has no id; pass the data of an apinoa post read");
      return { kind: "tiktok", postId: String(id), post: input.post, cleanup: keep };
    }
    if (typeof input !== "string" || !input) throw new Error("pass a file path, the video's bytes, a TikTok post URL or { post }");
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
      const postId = tiktokPostId(input);
      if (!postId) throw new Error("only TikTok post URLs are read; download other videos and pass the file");
      return { kind: "tiktok", postId, cleanup: keep };
    }
    return { kind: "file", path: input, cleanup: keep };
  });
}
