// Examples 4, 5, 8 and 10, and the record's rules, without ffmpeg.
import { describe, expect, it } from "vitest";
import { analyzeVideo } from "../src/index.js";
import {
  alignWords, checkQuestions, commentList, commentQuestions, cueWords, describeRequest, dropHallucinations, parseComments,
  parseDescribed, parseRecord, parseVtt, recordIntro, recordQuestions, type DecisionAnswer, type Decisions, type Span,
} from "../src/primitives.js";
import { expandQuestions } from "../src/blocks/decide.js";
import { fromWhisper } from "../src/blocks/transcribe.js";
import { hookRule } from "../src/record/parse.js";
import { ASR_VTT, CREATOR_ID, fake, KEYS, tiktokPost } from "./helpers.js";

const choice = (choice: string, probs: Record<string, number> = { [choice]: 0.7 }): DecisionAnswer => ({ choice, probs });
const spansAt = (starts: number[], end: number): Span[] => starts.map((s, i) => ({ start: s, end: starts[i + 1] ?? end }));

describe("Example 4: whisper's music line", () => {
  it("drops a segment that is likely not speech and unsure, or only thanks for watching", () => {
    const t = fromWhisper({
      text: "Thanks for watching!", duration: 5,
      segments: [{ start: 0, end: 2, text: " Thanks for watching!", no_speech_prob: 0.5, avg_logprob: -0.86 }],
      words: [{ word: "Thanks", start: 0.1, end: 0.4 }, { word: "for", start: 0.4, end: 0.6 }, { word: "watching!", start: 0.6, end: 1 }],
    });
    expect(t.segments[0].words).toHaveLength(3);
    expect(dropHallucinations(t).segments).toEqual([]);
    // Real speech that is merely quiet stays: whisper measured -0.19 to -0.22 at 0.54.
    const real = { segments: [{ start: 0, end: 2, text: "Real words here", noSpeechProb: 0.54, avgLogprob: -0.2 }] };
    expect(dropHallucinations(real).segments).toHaveLength(1);
    expect(dropHallucinations({ segments: [{ start: 0, end: 1, text: "thank you so much for watching" }] }).segments).toEqual([]);
  });
});

describe("Example 5: missing or refused answers fall back", () => {
  it("scene 2 is body and other, topic other, scene 1 hook without being asked", () => {
    const spans = spansAt([0, 2], 4);
    const names = expandQuestions(recordQuestions(), spans.length).map((q) => q.name);
    expect(names).not.toContain("role_0");
    expect(names).toContain("role_1");
    const d: Decisions = { video: { format: choice("listicle") }, scenes: [{ footage: choice("screen") }, {}] };
    const r = parseRecord(d, { spans, product: "Notewise" });
    expect(r.scenes.map((s) => s.role)).toEqual(["hook", "body"]);
    expect(r.scenes.map((s) => s.footage)).toEqual(["screen", "other"]);
    expect(r).toMatchObject({ topic: "other", format: "listicle", sells: "none", asksForComment: false, product: "" });
    expect(r.scenes[0].showsProduct).toBeUndefined();
    expect(r.answers).toBeUndefined();
  });

  it("product follows sells, and showsProduct is kept only when it sells", () => {
    const spans = spansAt([0], 2);
    const sold = parseRecord({ video: { sells: choice("software") }, scenes: [{ shows_product: { probability: 0.8 } }] }, { spans, product: "Notewise" });
    expect(sold).toMatchObject({ sells: "software", product: "Notewise" });
    expect(sold.scenes[0].showsProduct).toBe(true);
  });
});

describe("Example 8: the hook rule", () => {
  const starts = [0, 2, 4, 6.5];
  it("keeps the hook in one piece", () => {
    const first = hookRule([undefined, choice("hook"), choice("body"), choice("hook", { hook: 0.5, payoff: 0.3, body: 0.2 })], starts);
    expect(first).toEqual(["hook", "hook", "body", "payoff"]);
  });
  it("ends it by 6 s", () => {
    const second = hookRule([undefined, choice("hook"), choice("hook"), choice("hook", { hook: 0.6, cta: 0.3, body: 0.1 })], starts);
    expect(second).toEqual(["hook", "hook", "hook", "cta"]);
    expect(hookRule([undefined, choice("hook"), choice("hook"), { choice: "hook" }], starts)[3]).toBe("body");
  });
  it("makes a photo post's first photo the hook", () => {
    expect(hookRule([choice("cta"), choice("body")], [0, 1])).toEqual(["hook", "body"]);
  });
});

describe("Example 10: too many questions", () => {
  const q = (i: number, scope?: "scene") => ({ name: `q${i}`, question: "Is it red?", ...(scope ? { scope } : {}) });
  it("throws questions: with the limit", () => {
    expect(() => checkQuestions(Array.from({ length: 21 }, (_, i) => q(i)))).toThrow(/^questions: .*the maximum is 20/);
    expect(() => checkQuestions(Array.from({ length: 7 }, (_, i) => q(i, "scene")))).toThrow(/at most 6 per scene/);
    expect(() => checkQuestions([{ name: "Bad Name", question: "x" }])).toThrow(/\[a-z0-9_\]\+/);
    expect(() => checkQuestions([q(1), q(1)])).toThrow(/used twice/);
    expect(() => checkQuestions([{ name: "c", question: "x", choices: ["a"] }])).toThrow(/2 to 20 distinct choices/);
    expect(() => checkQuestions([{ name: "s", question: "x", scope: "scene" }, { name: "s_0", question: "y" }])).toThrow(/clashes/);
    expect(() => checkQuestions([q(1), q(2, "scene")])).not.toThrow();
  });
  it("fails the analysis before any request", async () => {
    const f = fake();
    const a = await analyzeVideo("/any.mp4", { ...KEYS, fetch: f.fetchFn, questions: Array.from({ length: 21 }, (_, i) => q(i)) });
    expect(a).toMatchObject({ ok: false });
    expect(!a.ok && a.error).toMatch(/the maximum is 20/);
    expect(f.calls).toEqual([]);
  });
  it("the worst case fits one Decisions request", () => {
    const questions = [
      ...Array.from({ length: 14 }, (_, i) => q(i)),
      ...Array.from({ length: 6 }, (_, i) => q(100 + i, "scene")),
    ];
    expect(expandQuestions(recordQuestions({ questions }), 40).length).toBeLessThanOrEqual(400);
  });
});

describe("subtitles", () => {
  it("parses WebVTT cues and spreads each cue's words evenly over its time", () => {
    const cues = parseVtt(ASR_VTT);
    expect(cues).toEqual([{ start: 0.2, end: 1, text: "Two apps" }, { start: 3.2, end: 4, text: "Comment notes" }]);
    const words = cueWords(cues);
    expect(words[1]).toEqual({ word: "apps", start: 0.6, end: 1 });
    expect(alignWords(words, [{ start: 0, end: 1.5 }, { start: 1.5, end: 3 }, { start: 3, end: 4.5 }])).toEqual(["Two apps", "", "Comment notes"]);
  });
  it("drops markup, hour times and a cue that repeats the one before", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000 align:start\n<c>Hello</c> there\n\n00:00:02.000 --> 00:00:03.000\nHello there\n";
    expect(parseVtt(vtt)).toEqual([{ start: 1, end: 2, text: "Hello there" }]);
  });
});

describe("describe", () => {
  it("asks for one onScreenText per scene, with a strict schema", () => {
    const r = describeRequest(3);
    expect(r.instructions).toMatch(/\(3 entries\)/);
    expect((r.schema as any).required).toEqual(["product", "tags", "description", "formatDescription", "onScreenText"]);
    expect((r.schema as any).additionalProperties).toBe(false);
  });
  it("cleans tags, keeps at most 10, and empties what was left out", () => {
    const tags = ["#Study", "League of Legends", "study", "k-beauty", "", ...Array.from({ length: 12 }, (_, i) => `t${i}`)];
    const d = parseDescribed({ tags, onScreenText: ["a"] }, 2);
    expect(d.tags.slice(0, 3)).toEqual(["study", "leagueoflegends", "kbeauty"]);
    expect(d.tags).toHaveLength(10);
    expect(d).toMatchObject({ product: "", description: "", formatDescription: "", onScreenText: ["a", ""] });
    expect(parseDescribed(null, 1)).toEqual({ product: "", tags: [], description: "", formatDescription: "", onScreenText: [""] });
  });
});

describe("the intro", () => {
  it("tells what TikTok says about the post, as evidence", () => {
    const text = recordIntro({ media: "video", duration: 4.5, scenes: 3, speech: "subtitles", post: tiktokPost() });
    for (const s of [/4\.5 s long, in 3 scenes/, /TikTok's own subtitles/, /Caption: "Two apps that got me through finals"/, /#studytok/,
      /Sticker text: "2 apps for finals"/, /topic labels: Education/, /paid partnership/, /Effects: Green Screen/, /the creator's own sound/]) {
      expect(text).toMatch(s);
    }
    expect(recordIntro({ media: "photos", duration: 3, scenes: 3, speech: "none" })).toMatch(/photo post: 3 photos/);
  });

  it("says which account posted it, and keeps AI-generated out of the commercial tags", () => {
    const post = { ...tiktokPost(), author: { platform: "tiktok", handle: "gizmo.ai", displayName: "gizmo" }, aiGenerated: true };
    const text = recordIntro({ media: "video", duration: 4.5, scenes: 3, speech: "subtitles", post });
    expect(text).toMatch(/^Account: @gizmo\.ai \("gizmo"\)\.$/m);
    expect(text).toMatch(/^TikTok's commercial tags: paid partnership\.$/m);
    expect(text).toMatch(/^TikTok labels it AI-generated\.$/m);
    expect(recordIntro({ media: "video", duration: 4.5, scenes: 3, speech: "subtitles", post: tiktokPost() })).toMatch(/^Account: @creator\.$/m);
  });
});

describe("the sells question", () => {
  it("takes a commercial tag or the product's own account as a pitch, even when the product is only shown", () => {
    const sells = recordQuestions().find((q) => q.name === "sells")!;
    expect(sells.instructions).toMatch(/Showing or using a product isn't enough, unless the post has one of TikTok's commercial tags or the product's own account posted it\./);
    expect(sells.instructions).not.toMatch(/not whether there is one/);
  });
});

describe("comments", () => {
  const items = [
    { platform: "tiktok", id: "1", postId: "p", text: "what's the app called?", author: { platform: "tiktok", id: "u1" }, metrics: { likes: 12 }, replies: [] },
    { platform: "tiktok", id: "2", postId: "p", text: "link in bio!", author: { platform: "tiktok", id: CREATOR_ID }, replies: [] },
    { platform: "tiktok", id: "3", postId: "p", text: "thanks all", author: { platform: "tiktok", id: "u9" }, byAuthor: true, replies: [] },
    { platform: "tiktok", id: "4", postId: "p", text: "🔥🔥", author: { platform: "tiktok", id: "u2" }, replies: [] },
  ] as any[];
  it("keeps the comments in order without the creator's own", () => {
    const list = commentList({ platform: "tiktok", items }, tiktokPost());
    expect(list).toEqual([{ id: "1", text: "what's the app called?", likes: 12 }, { id: "4", text: "🔥🔥", likes: 0 }]);
  });
  it("offers cta_reply only when the video asks for a comment, and falls back to other", () => {
    expect((commentQuestions({ asksForComment: false })[0] as any).choices.map((c: any) => c.value)).toEqual(["intent", "negative", "positive", "other"]);
    expect((commentQuestions({ asksForComment: true })[0] as any).choices[0].value).toBe("cta_reply");
    const list = [{ id: "1", text: "a", likes: 1 }, { id: "2", text: "b", likes: 0 }];
    expect(parseComments({ video: {}, scenes: [{ kind: { choice: "intent" } }] }, list)).toEqual([
      { id: "1", text: "a", likes: 1, kind: "intent" }, { id: "2", text: "b", likes: 0, kind: "other" },
    ]);
  });
});
