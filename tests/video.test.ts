// Examples 1–4, 6, 7 and 18 on files made with ffmpeg lavfi, with OpenAI faked at fetch.
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeVideo, summarize, type Analysis, type Failed } from "../src/index.js";
import { detectScenes, type Transcriber } from "../src/primitives.js";
import { fake, hasFfmpeg, KEYS, makeCuts, makeLongTake, readText } from "./helpers.js";

function ok(a: Analysis | Failed): Analysis {
  if (!a.ok) throw new Error(a.error);
  return a;
}

describe.skipIf(!hasFfmpeg)("a video file", () => {
  let cuts: string;
  let take: string;
  beforeAll(() => { cuts = makeCuts(true); take = makeLongTake(); });

  it("Example 1: three hard cuts, speech none, describe then decide", async () => {
    const f = fake();
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn }));
    expect(a.scenes.map((s) => s.start)).toHaveLength(3);
    a.scenes.forEach((s, i) => expect(s.start).toBeCloseTo([0, 1.5, 3][i], 1));
    expect(a.scenes.every((s) => s.cut)).toBe(true);
    expect(a.speech).toBe("none");
    expect(a.scenes.every((s) => s.spoken === "")).toBe(true);
    expect(f.kinds()).toEqual(["describe", "decide"]);
    expect(a.media).toBe("video");
    expect(a.stages.speech?.version).toBe("1:off");
    expect(a.scenes[0].frame).toMatch(/^data:image\/jpeg;base64,\/9j\//);
    // Without TikTok's facts, the requests are told the words aren't known.
    expect(readText(f.calls[0].body)).toMatch(/words said in the video aren't known/);
    expect(a.comments).toBeUndefined();
    expect(a.stages.comments).toBeUndefined();
  });

  it("Example 1: the describe output follows its rules; the decide request reads it", async () => {
    const f = fake({ sells: "software", product: "Notewise" });
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn }));
    expect(a.tags).toEqual(["study", "apps", "notes"]);
    expect(a.product).toBe("Notewise");
    expect(a.scenes.map((s) => s.onScreenText)).toEqual(["2 apps", "", ""]);
    expect(a.scenes.map((s) => s.showsProduct)).toEqual([true, true, true]);
    const decideText = readText(f.calls[1].body);
    expect(decideText).toMatch(/Product: "Notewise"/);
    expect(decideText).toMatch(/Text on screen in scene 1: "2 apps"/);
  });

  it("Example 2: transcription on puts the words in their scenes, labelled as automatic", async () => {
    const f = fake();
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, transcribe: true }));
    expect(a.speech).toBe("transcription");
    expect(a.scenes.map((s) => s.spoken)).toEqual(["Wait for it.", "", "Follow!"]);
    expect(f.kinds()).toEqual(["transcription", "describe", "decide"]);
    for (const c of f.calls.slice(1)) expect(readText(c.body)).toMatch(/automatic transcription, may be song lyrics/);
    expect(a.stages.speech).toMatchObject({ version: "1:whisper-1", requests: 1, audioSec: 4.5, costUsd: 0.00045 });
    expect(a.raw.transcript?.segments).toHaveLength(2);
  });

  it("Example 2: a failed transcription leaves speech none and says why", async () => {
    const f = fake({ transcriptionStatus: 400 });
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, transcribe: true }));
    expect(a.speech).toBe("none");
    expect(a.stages.speech?.error).toMatch(/^speech: transcription 400/);
  });

  it("Example 3: one long take is split into 3 equal scenes, the later ones not cuts", async () => {
    const a = ok(await analyzeVideo(take, { ...KEYS, fetch: fake().fetchFn }));
    expect(a.scenes).toHaveLength(3);
    for (const s of a.scenes) expect(s.end - s.start).toBeCloseTo(11 / 3, 1);
    expect(a.scenes.map((s) => s.cut)).toEqual([true, false, false]);
  });

  it("Example 4: whisper's music line is dropped from a transcriber of your own too", async () => {
    const own: Transcriber = {
      id: "my-asr",
      transcribe: async () => ({
        segments: [
          { start: 0, end: 1, text: "Thanks for watching!", noSpeechProb: 0.5, avgLogprob: -0.86, words: [{ word: "Thanks", start: 0.1, end: 0.3 }] },
          { start: 3.2, end: 4, text: "Follow", words: [{ word: "Follow", start: 3.4, end: 3.8 }] },
        ],
      }),
    };
    const f = fake();
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, transcribe: own }));
    expect(a.scenes.map((s) => s.spoken)).toEqual(["", "", "Follow"]);
    expect(a.stages.speech).toMatchObject({ version: "1:my-asr", costUsd: 0 });
    expect(a.raw.transcript?.segments).toHaveLength(2); // raw keeps what the transcriber gave
  });

  it("Example 6: no OpenAI key fails before any request", async () => {
    const f = fake();
    const a = await analyzeVideo(cuts, { openaiApiKey: "", fetch: f.fetchFn });
    expect(a.ok).toBe(false);
    expect((a as Failed).error).toMatch(/OPENAI_API_KEY/);
    expect((a as Failed).partial).toBeUndefined();
    expect(f.calls).toEqual([]);
  });

  it("Example 7: an unreadable file", async () => {
    const a = await analyzeVideo("/nope.mp4", { ...KEYS, fetch: fake().fetchFn });
    expect(a.ok).toBe(false);
    expect((a as Failed).error).toMatch(/^video:/);
  });

  it("Example 18: the scene rules are options of detectScenes", async () => {
    const spans = await detectScenes(take, { maxTake: 3 });
    expect(spans).toHaveLength(4);
    for (const s of spans) expect(s.end - s.start).toBeCloseTo(2.75, 2);
    expect(spans.map((s) => s.cut)).toEqual([undefined, false, false, false]);
  });

  it("the summary keeps each run of scenes on one line, whatever the text on screen holds", async () => {
    const f = fake({ describeOutput: (n) => ({ product: "", tags: [], description: "d", formatDescription: "f", onScreenText: Array.from({ length: n }, () => "TOP\n BOTTOM") }) });
    const text = summarize(ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn })));
    expect(text).toContain('\n  body 1.5-4.5 s, 2 scenes (screen) [on screen: "TOP BOTTOM / TOP BOTTOM"]\n');
  });

  it("a Buffer works like the file", async () => {
    const { readFileSync } = await import("node:fs");
    const a = ok(await analyzeVideo(readFileSync(cuts), { ...KEYS, fetch: fake().fetchFn }));
    expect(a.scenes).toHaveLength(3);
    expect(a.stages.source?.video).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe.skipIf(!hasFfmpeg)("the flex tier", () => {
  let cuts: string;
  beforeAll(() => { cuts = makeCuts(true); });

  it("runs describe on flex at half its price, with the same stage version", async () => {
    const f = fake();
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, flex: true }));
    expect(f.calls[0].body.service_tier).toBe("flex");
    expect(f.calls[1].body.service_tier).toBeUndefined(); // Decisions has no flex tier
    expect(a.stages.describe).toMatchObject({ version: "1:gpt-6-luna", serviceTier: "flex", costUsd: 0.0001 });
  });

  it("waits for flex capacity, then runs on the standard tier", async () => {
    const f = fake({ flexStatus: 429 });
    const a = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, flex: true }));
    expect(f.kinds()).toEqual(["describe", "describe", "describe", "describe", "describe", "decide"]);
    expect(f.calls.slice(0, 4).map((c) => c.body.service_tier)).toEqual(["flex", "flex", "flex", "flex"]);
    expect(f.calls[4].body.service_tier).toBeUndefined();
    expect(a.stages.describe?.serviceTier).toBeUndefined();
    expect(a.stages.describe?.costUsd).toBe(0.0002);
  });
});
