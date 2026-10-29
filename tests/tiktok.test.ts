// Examples 11–13, 22 and 23: TikTok posts, with apinoa, TikTok's links and OpenAI faked at fetch.
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeVideo, type Analysis, type Failed } from "../src/index.js";
import {
  ASR_URL, ASR_VTT, CREATOR_ID, fake, hasFfmpeg, KEYS, makeCuts, makePhoto, MT_URL, POST_ID, readText, TIKTOK_URL, tiktokPost, VIDEO_URL,
} from "./helpers.js";

function ok(a: Analysis | Failed): Analysis {
  if (!a.ok) throw new Error(a.error);
  return a;
}

const withTracks = () => tiktokPost({ tracks: [{ source: "MT", url: MT_URL, lang: "kor-KR" }, { source: "ASR", url: ASR_URL }] });
const vtt = { [ASR_URL]: ASR_VTT, [MT_URL]: "WEBVTT\n\n00:00.200 --> 00:01.000\n앱 두 개\n" };

describe.skipIf(!hasFfmpeg)("a TikTok post", () => {
  let video: string;
  beforeAll(() => { video = makeCuts(true); });

  it("Example 11: reads the post, the video and the ASR track, never the MT one", async () => {
    const f = fake({ posts: [withTracks()], video, vtt });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(f.kinds()).toEqual(["post", "video", "subtitles", "describe", "decide"]);
    expect(f.calls[0].url).toBe(`https://gateway.apinoa.com/v1/tiktok/post?id=${POST_ID}`);
    expect(f.calls[1].headers?.get("referer")).toBe("https://www.tiktok.com/");
    expect(f.calls[2].url).toBe(ASR_URL);
    expect(a.speech).toBe("subtitles");
    expect(a.scenes.map((s) => s.spoken)).toEqual(["Two apps", "", "Comment notes"]);
    for (const c of f.calls.slice(3)) {
      const text = readText(c.body);
      for (const s of [/Caption: "Two apps that got me through finals"/, /#studytok/, /topic labels: Education/, /Effects: Green Screen/, /Sound: "original sound"/]) {
        expect(text).toMatch(s);
      }
      expect(text).toMatch(/Said: "Two apps"/);
    }
    expect(a.stages.source).toMatchObject({ version: "1", apinoaCalls: 1, costUsd: 0.001, video: `tiktok:${POST_ID}` });
    expect(a.stages.speech?.version).toBe("1:subtitles");
    const sum = Object.values(a.stages).reduce((s, x) => s + x!.costUsd, 0);
    expect(a.costUsd).toBeCloseTo(sum, 9);
    expect(a.raw.post?.id).toBe(POST_ID);
    expect(a.raw.subtitles).toBe(ASR_VTT);
  });

  it("Example 11: a post you already read is not read again", async () => {
    const f = fake({ video, vtt });
    const a = ok(await analyzeVideo({ post: withTracks() }, { ...KEYS, fetch: f.fetchFn }));
    expect(f.kinds()).toEqual(["video", "subtitles", "describe", "decide"]);
    expect(a.stages.source).toEqual({ version: "1", ms: expect.any(Number), costUsd: 0, video: `tiktok:${POST_ID}` });
  });

  it("Example 12: an expired link reads the post once more; two failures fail", async () => {
    const fresh = tiktokPost({ video: "https://v.tiktok.test/play/2.mp4" });
    const f = fake({ posts: [tiktokPost(), fresh], video, videoStatus: [403] });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(f.kinds().slice(0, 4)).toEqual(["post", "video", "post", "video"]);
    expect(f.calls[3].url).toBe("https://v.tiktok.test/play/2.mp4");
    expect(a.stages.source).toMatchObject({ apinoaCalls: 2, costUsd: 0.002 });

    const g = fake({ video, videoStatus: [403, 403] });
    const b = await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: g.fetchFn });
    expect(b).toMatchObject({ ok: false, error: "source: download 403" });
    expect(g.kinds()).toEqual(["post", "video", "post", "video"]);
  });

  it("Example 13: a post that sells reads its comments and gives each a kind", async () => {
    const items = [
      { platform: "tiktok", id: "1", postId: POST_ID, text: "what's the app called?", author: { platform: "tiktok", id: "u1" }, metrics: { likes: 12 }, replies: [] },
      { platform: "tiktok", id: "2", postId: POST_ID, text: "it's Notewise!", author: { platform: "tiktok", id: CREATOR_ID }, metrics: { likes: 3 }, replies: [] },
      { platform: "tiktok", id: "3", postId: POST_ID, text: "this is an ad", author: { platform: "tiktok", id: "u2" }, metrics: { likes: 1 }, replies: [] },
    ];
    const f = fake({ video, sells: "software", product: "Notewise", roles: ["hook", "body", "cta"], kinds: ["intent", "negative"], comments: items });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(f.kinds()).toEqual(["post", "video", "describe", "decide", "comments", "decide"]);
    expect(f.calls[4].url).toBe(`https://gateway.apinoa.com/v1/tiktok/comments?post=${POST_ID}&limit=50`);
    const ask = f.calls[5].body;
    expect(ask.questions.map((q: any) => q.name)).toEqual(["kind_0", "kind_1"]);
    expect(ask.questions[0].choices.map((c: any) => c.value)).toEqual(["intent", "negative", "positive", "other"]);
    expect(readText(ask)).toMatch(/The product the video pitches: "Notewise"/);
    expect(a.comments).toEqual([
      { id: "1", text: "what's the app called?", likes: 12, kind: "intent" },
      { id: "3", text: "this is an ad", likes: 1, kind: "negative" },
    ]);
    expect(a.stages.comments).toMatchObject({ version: "1:gpt-6-luna", apinoaCalls: 1, requests: 1, inputTokens: 2000, costUsd: 0.0012 });
    expect(a.raw.comments?.items).toHaveLength(3);
  });

  it("Example 13: a video that asks for a comment offers cta_reply; one that sells nothing reads none", async () => {
    const items = [{ platform: "tiktok", id: "1", postId: POST_ID, text: "notes", author: { platform: "tiktok", id: "u1" }, replies: [] }];
    const f = fake({ video, asks: 0.9, comments: items, kinds: ["cta_reply"] });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(f.calls.at(-1)!.body.questions[0].choices[0].value).toBe("cta_reply");
    expect(a.comments).toEqual([{ id: "1", text: "notes", likes: 0, kind: "cta_reply" }]);

    const g = fake({ video, comments: items });
    const b = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: g.fetchFn }));
    expect(g.kinds()).not.toContain("comments");
    expect(b.comments).toBeUndefined();
    expect(b.stages.comments).toBeUndefined();

    const h = fake({ video, asks: 0.9, comments: items });
    const c = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: h.fetchFn, comments: false }));
    expect(h.kinds()).not.toContain("comments");
    expect(c.comments).toBeUndefined();
  });

  it("Example 13: a failed comments read leaves comments out and says why", async () => {
    const f = fake({ video, sells: "software", commentsStatus: 400 });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(a.comments).toBeUndefined();
    expect(a.stages.comments?.error).toMatch(/^comments: apinoa comments 400/);
  });

  it("Example 22: a photo post is one scene per photo", async () => {
    const urls = ["https://p.tiktok.test/1.png", "https://p.tiktok.test/2.png", "https://p.tiktok.test/3.png"];
    const photos = Object.fromEntries(urls.map((u, i) => [u, makePhoto(["red", "green", "blue"][i])]));
    const f = fake({ posts: [tiktokPost({ photos: urls })], photos });
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn, transcribe: true }));
    expect(a.media).toBe("photos");
    expect(a.duration).toBe(3);
    expect(a.scenes.map((s) => [s.start, s.end, s.cut])).toEqual([[0, 1, true], [1, 2, true], [2, 3, true]]);
    expect(a.speech).toBe("none");
    expect(f.kinds()).toEqual(["post", "photo", "photo", "photo", "describe", "decide"]);
    expect(a.scenes[0].frame).toMatch(/^data:image\/jpeg;base64,/);
    expect(a.scenes[0].role).toBe("hook");
    expect(readText(f.calls[4].body)).toMatch(/Scene 1 \(photo 1 of 3\)/);
  });

  it("Example 23: what each stage cost, from the price table", async () => {
    const f = fake({ video, videoStatus: [403] }); // two apinoa calls: the read and a fresh read
    const a = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(a.stages.describe).toMatchObject({ costUsd: 0.0002, requests: 1, inputTokens: 1000, outputTokens: 200, images: 3 });
    expect(a.stages.decide).toMatchObject({ costUsd: 0.0002, requests: 1, inputTokens: 2000 });
    expect(a.stages.source).toMatchObject({ costUsd: 0.002, apinoaCalls: 2 });
    expect(a.costUsd).toBe(0.0024);

    const g = fake({ video, videoStatus: [403] });
    const prices = { apinoa: 0.002, responses: { "gpt-6-luna": { input: 1, output: 1 } } };
    const b = ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: g.fetchFn, prices }));
    expect(b.stages.describe?.costUsd).toBe(0.0012);
    expect(b.stages.source?.costUsd).toBe(0.004);
    expect(b.costUsd).toBe(0.0054);
  });

  it("Example 11: the video link the post gives is used as it is", async () => {
    const f = fake({ video });
    ok(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: f.fetchFn }));
    expect(f.calls[1].url).toBe(VIDEO_URL);
  });
});
