// eval/: score.mjs's accuracy per field against reference labels, on a hand-made analysis; repeat.mjs's decide request
// asked again with the candidate facets; stability.mjs's agreement between those runs.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandQuestions } from "../src/blocks/decide.js";
import { MAX_SCENES } from "../src/blocks/scenes.js";
import { analyzeVideo } from "../src/index.js";
import { recordQuestions } from "../src/record/questions.js";
import { fake, hasFfmpeg, KEYS, makeCuts, tmp } from "./helpers.js";

const evalModule = (name: string) => import(String(new URL(`../eval/${name}`, import.meta.url)));

describe("eval/score.mjs", () => {
  it("scores each field, keeps the labels marked unsure apart, and lists the misses; comments go by id, in any order", () => {
    const root = tmp();
    mkdirSync(join(root, "labels"));
    mkdirSync(join(root, "out", "1.analysis"), { recursive: true });
    writeFileSync(join(root, "labels", "1.json"), JSON.stringify({
      topic: "tech", format: "tutorial", sells: "software", product: "Notewise", asksForComment: true,
      scenes: [{ role: "hook", footage: "camera_face", showsProduct: false }, { role: "cta", footage: "screen", showsProduct: true }],
      comments: { c1: "intent", c2: "positive", c3: "negative" },
      unsure: { format: "review was close", "scenes[1].footage": "graphics was close", "comments.c2": "other was close" },
    }));
    writeFileSync(join(root, "out", "1.analysis", "analysis.json"), JSON.stringify({
      topic: "tech", format: "review", sells: "software", product: "Notewise app", asksForComment: true,
      scenes: [{ role: "hook", footage: "camera_face", showsProduct: false }, { role: "body", footage: "graphics", showsProduct: true }],
      comments: [{ id: "c2", kind: "positive" }, { id: "c4", kind: "other" }, { id: "c1", kind: "other" }],
    }));
    const out = JSON.parse(execFileSync(process.execPath, ["eval/score.mjs", join(root, "labels"), join(root, "out"), "--json"], { encoding: "utf8" }));
    const by = Object.fromEntries(out.fields.map((f: { field: string }) => [f.field, f]));
    expect(out.videos).toBe(1);
    expect(by.topic).toMatchObject({ n: 1, accuracy: 1 });
    expect(by.format).toMatchObject({ n: 1, accuracy: 0, nSure: 0, accuracySure: null });
    expect(by.product).toMatchObject({ n: 1, accuracy: 1 });
    expect(by.role).toMatchObject({ n: 2, accuracy: 0.5 });
    expect(by.footage).toMatchObject({ n: 2, accuracy: 0.5, nSure: 1, accuracySure: 1 });
    expect(by["comment kind"]).toMatchObject({ n: 2, accuracy: 0.5, nSure: 1, accuracySure: 0 });
    expect(out.misses).toContainEqual({ id: "1 comment c1", field: "comment kind", want: "intent", got: "other" });
    expect(out.misses).toContainEqual({ id: "1 scene 2", field: "role", want: "cta", got: "body" });
  });

  it("matches a product list name by name: most of the reference's names must be found", () => {
    const root = tmp();
    mkdirSync(join(root, "labels"));
    const post = (id: string, want: string, got: string) => {
      const base = { topic: "beauty", format: "listicle", sells: "physical_goods", asksForComment: false, scenes: [] };
      writeFileSync(join(root, "labels", `${id}.json`), JSON.stringify({ ...base, product: want }));
      mkdirSync(join(root, "out", `${id}.analysis`), { recursive: true });
      writeFileSync(join(root, "out", `${id}.analysis`, "analysis.json"), JSON.stringify({ ...base, product: got }));
    };
    post("1", "Abib Cream and Collagen Mask, Gua Sha", "Abib cream, Abib Collagen Mask");
    post("2", "Abib Cream and Collagen Mask, Gua Sha", "Abib cream");
    const out = JSON.parse(execFileSync(process.execPath, ["eval/score.mjs", join(root, "labels"), join(root, "out"), "--json"], { encoding: "utf8" }));
    expect(out.fields.find((f: { field: string }) => f.field === "product")).toMatchObject({ n: 2, accuracy: 0.5 });
    expect(out.misses).toEqual([{ id: "2", field: "product", want: true, got: false }]);
  });
});

describe.skipIf(!hasFfmpeg)("eval/repeat.mjs", () => {
  it("asks the analysis's own decide request again, once per run, with the candidate facets of every scene in it", async () => {
    const f = fake();
    const first = await analyzeVideo(makeCuts(true), { ...KEYS, fetch: f.fetchFn });
    if (!first.ok) throw new Error(first.error);
    const sent = f.calls.find((c) => c.kind === "decide")!.body;
    const { repeat } = await evalModule("repeat.mjs");
    const g = fake();
    const runs = await repeat(JSON.parse(JSON.stringify(first)), { runs: 2, ...KEYS, fetch: g.fetchFn });
    expect(g.kinds()).toEqual(["decide", "decide"]);
    const candidate = (q: { name: string }) => /^(voice|layout|shot|text)_\d+$/.test(q.name);
    for (const { body } of g.calls) {
      expect(body.input).toEqual(sent.input);
      expect(body.questions.filter((q: { name: string }) => !candidate(q))).toEqual(sent.questions);
      expect(body.questions.filter(candidate)).toHaveLength(4 * first.scenes.length);
    }
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ topic: first.topic, format: first.format, sells: first.sells, asksForComment: first.asksForComment });
    // the fake answers a question it doesn't know with its first value
    expect(runs[0].scenes[1]).toMatchObject({ role: first.scenes[1].role, footage: first.scenes[1].footage, voice: "in_frame", layout: "cutout", shot: "group", text: "captions" });
    expect(runs[0].decisions.scenes[1].voice.probs.in_frame).toBe(0.7);
  });
});

describe("eval/candidates.mjs", () => {
  it("with the record's questions, a video of the most scenes still fits one decide request", async () => {
    const { CANDIDATE_QUESTIONS } = await evalModule("candidates.mjs");
    expect(expandQuestions([...recordQuestions(), ...CANDIDATE_QUESTIONS], MAX_SCENES)).toHaveLength(4 + 3 * MAX_SCENES - 1 + 4 * MAX_SCENES);
  });
});

describe("eval/stability.mjs", () => {
  const scene = (o: object = {}) => ({ role: "body", footage: "screen", voice: "off_frame", layout: "full", shot: "app", text: "other", ...o });
  const opening = { role: "hook", footage: "camera_face", voice: "in_frame", shot: "face", text: "captions" };
  const run = (format: string, second: object = {}) => ({
    topic: "tech", format, sells: "none", asksForComment: false, scenes: [scene(opening), scene(second)],
  });
  const runs = [run("review"), run("tutorial", { shot: "card" }), run("review", { text: "message" })];
  const stability = (root: string, ...args: string[]) =>
    JSON.parse(execFileSync(process.execPath, ["eval/stability.mjs", join(root, "out"), ...args, "--json"], { encoding: "utf8" }));

  it("compares the runs field by field: all of them agreeing, two agreeing, the values that trade places, and against labels each run's accuracy and the majority's", () => {
    const root = tmp();
    mkdirSync(join(root, "labels"));
    mkdirSync(join(root, "out", "1.analysis"), { recursive: true });
    writeFileSync(join(root, "out", "1.analysis", "repeats.json"), JSON.stringify({ runs }));
    writeFileSync(join(root, "labels", "1.json"), JSON.stringify({
      topic: "tech", format: "review", sells: "none", asksForComment: false,
      scenes: [scene({ ...opening, layout: "full" }), scene({ text: "message" })],
      unsure: { "scenes[1].text": "other was close" },
    }));
    const out = stability(root, join(root, "labels"));
    const by = Object.fromEntries(out.fields.map((f: { field: string }) => [f.field, f]));
    expect(out).toMatchObject({ videos: 1, runs: 3 });
    expect(by.topic).toMatchObject({ n: 1, allAgree: 1, pairwise: 1, swaps: [], accuracy: { mean: 1, min: 1, max: 1 }, majority: 1 });
    expect(by.format).toMatchObject({ n: 1, allAgree: 0, swaps: [{ a: "review", b: "tutorial", n: 2 }], majority: 1 });
    expect(by.format.pairwise).toBeCloseTo(1 / 3);
    expect(by.format.accuracy.mean).toBeCloseTo(2 / 3);
    expect(by.role).toMatchObject({ n: 1, allAgree: 1 }); // asked from scene 2: scene 1 is the hook by rule
    expect(by.shot).toMatchObject({ n: 2, allAgree: 0.5, swaps: [{ a: "app", b: "card", n: 2 }] });
    expect(by.shot.pairwise).toBeCloseTo(2 / 3);
    expect(by.text).toMatchObject({ n: 2, allAgree: 0.5, majority: 0.5, nSure: 1, majoritySure: 1 });
    expect(by.showsProduct).toMatchObject({ n: 0 }); // every run says the video sells nothing
    expect(out.misses).toEqual([{ id: "1 scene 2", field: "text", want: "message", got: "other", votes: { other: 2, message: 1 } }]);
  });

  it("without labels, reports only how the runs agree", () => {
    const root = tmp();
    mkdirSync(join(root, "out", "1.analysis"), { recursive: true });
    writeFileSync(join(root, "out", "1.analysis", "repeats.json"), JSON.stringify({ runs }));
    const by = Object.fromEntries(stability(root).fields.map((f: { field: string }) => [f.field, f]));
    expect(by.format).toMatchObject({ n: 1, allAgree: 0, accuracy: null, majority: null });
  });
});
