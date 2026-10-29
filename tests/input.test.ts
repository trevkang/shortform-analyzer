// Example 9 and the input kinds.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeVideo } from "../src/index.js";
import { resolveInput, tiktokPostId } from "../src/primitives.js";
import { fake, KEYS, POST_ID, TIKTOK_URL, tiktokPost } from "./helpers.js";

describe("input", () => {
  it("Example 9: a URL that isn't a TikTok post is refused before any request", async () => {
    for (const url of ["https://example.com/video.mp4", "https://vm.tiktok.com/ZMabc123/", "https://www.tiktok.com/@creator"]) {
      const f = fake();
      const a = await analyzeVideo(url, { ...KEYS, fetch: f.fetchFn });
      expect(a).toEqual({ ok: false, error: "input: only TikTok post URLs are read; download other videos and pass the file" });
      expect(f.calls).toEqual([]);
    }
  });

  it("reads the post id from a TikTok post URL", () => {
    expect(tiktokPostId(TIKTOK_URL)).toBe(POST_ID);
    expect(tiktokPostId(`https://m.tiktok.com/@a/photo/123?lang=en`)).toBe("123");
    expect(tiktokPostId("https://www.tiktok.com/@a")).toBeUndefined();
    expect(tiktokPostId("https://tiktok.com.evil.test/@a/video/1")).toBeUndefined();
    expect(tiktokPostId("not a url")).toBeUndefined();
  });

  it("resolves each kind", async () => {
    expect(await resolveInput(TIKTOK_URL)).toMatchObject({ kind: "tiktok", postId: POST_ID });
    expect(await resolveInput({ post: tiktokPost({ id: "42" }) })).toMatchObject({ kind: "tiktok", postId: "42" });
    expect(await resolveInput("clip.mp4")).toMatchObject({ kind: "file", path: "clip.mp4" });
    const bytes = await resolveInput(Buffer.from("not a video"));
    if (bytes.kind !== "file") throw new Error("expected a file");
    expect(existsSync(bytes.path)).toBe(true);
    await bytes.cleanup();
    expect(existsSync(bytes.path)).toBe(false);
    await expect(resolveInput({ post: {} as any })).rejects.toThrow(/^input: the post has no id/);
    await expect(resolveInput("" as any)).rejects.toThrow(/^input:/);
  });

  it("a TikTok input needs the apinoa key, checked before any request", async () => {
    const f = fake();
    const a = await analyzeVideo(TIKTOK_URL, { openaiApiKey: "k", apinoaApiKey: "", fetch: f.fetchFn });
    expect(a).toEqual({ ok: false, error: "source: APINOA_API_KEY is not set (set it, or pass apinoaApiKey)" });
    expect(f.calls).toEqual([]);
  });

  it("a post apinoa can't find fails at source", async () => {
    const f = fake({ postStatus: 404 });
    const a = await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn });
    expect(a).toEqual({ ok: false, error: "source: apinoa post 404: not found (deleted, private, or a wrong id)" });
    expect(f.calls[0].headers?.get("x-api-key")).toBe("a");
  });
});
