// The generic decide (Layer 1): Examples 14 to 16 and the rules on question sets.
import { describe, expect, it } from "vitest";
import { decide, frameEvidence, parseShortform, sceneEvidence, shortformQuestions, type DecisionQuestion } from "../src/primitives.js";
import { screenCover } from "../src/index.js";
import { parseAnswers } from "../src/blocks/decide.js";

const spans = (n: number) => Array.from({ length: n }, (_, i) => ({ start: i, end: i + 1 }));
const evidence = (n: number) => sceneEvidence(spans(n), spans(n).map(() => Buffer.from("jpg")), spans(n).map(() => ""), { duration: n });
const logo: DecisionQuestion = { type: "predicate", name: "logo", scope: "scene", instructions: "Is a logo visible in scene {scene}?" };

function fake(reply: (body: any) => unknown) {
  const bodies: any[] = [];
  const fetchFn = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return Response.json(reply(body));
  }) as typeof fetch;
  return { fetchFn, bodies };
}

describe("decide", () => {
  it("rejects invalid JSON instead of reporting a successful screen with default answers", async () => {
    const fetchFn = (async () => new Response("not JSON", { status: 200 })) as typeof fetch;
    const options = { openaiApiKey: "k", fetch: fetchFn };
    await expect(decide(evidence(1), [logo], options)).rejects.toThrow(/^decide: invalid response.*JSON/);
    await expect(screenCover(Buffer.from("jpg"), [], options)).resolves.toEqual({
      ok: false, error: "decide: invalid response: expected JSON",
    });
  });

  it.each([null, [], "unexpected", 42, { answers: {} }, { answers: null }])("rejects a malformed response envelope: %j", async (reply) => {
    const { fetchFn } = fake(() => reply);
    await expect(decide(evidence(1), [logo], { openaiApiKey: "k", fetch: fetchFn })).rejects.toThrow(/^decide: invalid response/);
  });

  it.each([{}, { answers: [] }, { answers: [{ type: "refusal", name: "logo_0" }] }])("keeps missing and refused answers absent: %j", async (reply) => {
    const { fetchFn } = fake(() => reply);
    await expect(decide(evidence(1), [logo], { openaiApiKey: "k", fetch: fetchFn })).resolves.toEqual({ video: {}, scenes: [{}] });
  });

  it("ignores malformed entries without losing a valid answer", async () => {
    const { fetchFn } = fake(() => ({ answers: [null, 7, "bad", {}, { type: "predicate", name: "logo_0", probability: 0.8 }] }));
    await expect(decide(evidence(1), [logo], { openaiApiKey: "k", fetch: fetchFn })).resolves.toEqual({
      video: {}, scenes: [{ logo: { probability: 0.8 } }],
    });
  });

  it.each([-1, 7, NaN, Infinity, -Infinity])("uses preset fallbacks for invalid probabilities and scores: %s", (value) => {
    const labels = parseShortform(parseAnswers({ answers: [
      { type: "predicate", name: "sells", probability: value },
      { type: "predicate", name: "text_0", probability: value },
      { type: "score", name: "hold_0", score: value },
    ] }, shortformQuestions(), 1));
    expect(labels.sells).toBe(0);
    expect(labels.goal).toBe("awareness");
    expect(labels.scenes[0].hold).toBe(2);
    expect(labels.scenes[0].textOnScreen).toBeUndefined();
  });

  it.each([0, 1])("preserves boundary probabilities and scores: %s", (probability) => {
    const d = parseAnswers({ answers: [
      { type: "predicate", name: "sells", probability },
      { type: "score", name: "hold_0", score: probability * 4 },
    ] }, shortformQuestions(), 1);
    expect(d.video.sells).toEqual({ probability });
    expect(d.scenes[0].hold).toEqual({ score: probability * 4 });
  });

  it("keeps valid choice probabilities while dropping invalid entries", async () => {
    const { fetchFn } = fake(() => ({ answers: [{ type: "choice", name: "mood", choice: "calm", probabilities: [
      null, { value: "calm", probability: 0.7 }, { value: "tense", probability: 7 }, { value: {}, probability: 0.3 },
    ] }] }));
    const d = await decide(frameEvidence([], ""), [{ type: "choice", name: "mood", instructions: "?", choices: [{ value: "calm" }, { value: "tense" }] }], { openaiApiKey: "k", fetch: fetchFn });
    expect(d.video.mood).toEqual({ choice: "calm", probs: { calm: 0.7 } });
  });

  it("preserves the HTTP status when an error response is not JSON", async () => {
    const fetchFn = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(decide(evidence(1), [logo], { openaiApiKey: "k", fetch: fetchFn })).rejects.toThrow("decide: decisions 503: no body");
  });

  it("uses the usual screen fallback for an out-of-range caller answer", async () => {
    const { fetchFn } = fake(() => ({ answers: [{ type: "predicate", name: "q_face", probability: 7 }] }));
    const result = await screenCover(Buffer.from("jpg"), [{ name: "face", question: "Is a face visible?" }], { openaiApiKey: "k", fetch: fetchFn });
    expect(result).toEqual({ ok: true, production: "mixed", voice: "none", answers: { face: 0.5 } });
  });

  it("asks a scene question once per scene and returns one answer per scene (Example 14)", async () => {
    const { fetchFn, bodies } = fake((b) => ({ answers: b.questions.map((q: { name: string }, i: number) => ({ type: "predicate", name: q.name, probability: i / 10 })) }));
    const d = await decide(evidence(3), [logo], { openaiApiKey: "k", fetch: fetchFn });
    expect(bodies[0].questions).toEqual([
      { type: "predicate", name: "logo_0", instructions: "Is a logo visible in scene 1?" },
      { type: "predicate", name: "logo_1", instructions: "Is a logo visible in scene 2?" },
      { type: "predicate", name: "logo_2", instructions: "Is a logo visible in scene 3?" },
    ]);
    expect(d.scenes.map((s) => s.logo?.probability)).toEqual([0, 0.1, 0.2]);
    expect(d.video).toEqual({});
  });

  it("refuses more than 400 questions before any request (Example 15)", async () => {
    const { fetchFn, bodies } = fake(() => ({}));
    const eleven = Array.from({ length: 11 }, (_, i): DecisionQuestion => ({ ...logo, name: `q${i}` }));
    await expect(decide(evidence(40), eleven, { openaiApiKey: "k", fetch: fetchFn })).rejects.toThrow(/^decide: 440 questions.*400/);
    expect(bodies).toHaveLength(0);
  });

  it("leaves a missing or refused answer out, with no fallback (Example 16)", async () => {
    const { fetchFn } = fake(() => ({ answers: [
      { type: "predicate", name: "logo_0", probability: 0.8 },
      { type: "refusal", name: "logo_2" },
      { type: "choice", name: "mood", choice: "calm", probabilities: [{ value: "calm", probability: 0.7 }, { value: "tense", probability: 0.3 }] },
      { type: "score", name: "energy", score: 1.5 },
    ], usage: { input_tokens: 77 } }));
    const d = await decide(evidence(3), [
      logo,
      { type: "choice", name: "mood", instructions: "What mood?", choices: [{ value: "calm" }, { value: "tense" }] },
      { type: "score", name: "energy", instructions: "How energetic?", levels: [{ label: "low" }, { label: "mid" }, { label: "high" }] },
    ], { openaiApiKey: "k", fetch: fetchFn });
    expect(d.scenes[1].logo).toBeUndefined();
    expect(d.scenes[2].logo).toBeUndefined();
    expect(d).toEqual({
      video: { mood: { choice: "calm", probs: { calm: 0.7, tense: 0.3 } }, energy: { score: 1.5 } },
      scenes: [{ logo: { probability: 0.8 } }, {}, {}],
      inputTokens: 77,
    });
  });

  it("drops a choice the question did not offer", async () => {
    const { fetchFn } = fake(() => ({ answers: [{ type: "choice", name: "mood", choice: "angry" }] }));
    const d = await decide(frameEvidence([Buffer.from("x")], "One frame."), [{ type: "choice", name: "mood", instructions: "?", choices: [{ value: "calm" }] }], { openaiApiKey: "k", fetch: fetchFn });
    expect(d.video.mood).toBeUndefined();
  });

  it("checks names, duplicates, empty sets and scene questions on frame evidence before sending", async () => {
    const { fetchFn, bodies } = fake(() => ({}));
    const o = { openaiApiKey: "k", fetch: fetchFn };
    await expect(decide(evidence(1), [{ ...logo, name: "Bad-Name" }], o)).rejects.toThrow(/^decide: question name "Bad-Name"/);
    await expect(decide(evidence(1), [{ ...logo, scope: "video", name: "logo_0" }, logo], o)).rejects.toThrow(/used twice/);
    await expect(decide(evidence(1), [], o)).rejects.toThrow(/0 questions/);
    await expect(decide(frameEvidence([Buffer.from("x")], "x"), [logo], o)).rejects.toThrow(/scene questions need scene evidence/);
    expect(bodies).toHaveLength(0);
  });

  it("throws with its stage on a missing key and on an API error", async () => {
    const old = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(decide(evidence(1), [logo], { fetch: fake(() => ({})).fetchFn })).rejects.toThrow("decide: OPENAI_API_KEY is not set");
    } finally {
      if (old !== undefined) process.env.OPENAI_API_KEY = old;
    }
    const err = (async () => Response.json({ error: { message: "Invalid model" } }, { status: 400 })) as unknown as typeof fetch;
    await expect(decide(evidence(1), [logo], { openaiApiKey: "k", fetch: err })).rejects.toThrow("decide: decisions 400: Invalid model");
  });

  it("puts the frames in order with the scene texts", () => {
    expect(() => sceneEvidence(spans(2), [Buffer.from("a")], ["", ""], { duration: 2 })).toThrow(/2 scenes need as many frames/);
    const ev = sceneEvidence(spans(2), [Buffer.from("a"), Buffer.from("b")], ["one", ""], { duration: 2 });
    expect(ev.intro).toBe("A video, 2.0 s long, in 2 scenes. Each scene: its time, a frame from its middle, and what is said in it.");
    expect(ev.items.map((i) => i.type)).toEqual(["text", "image", "text", "image"]);
    expect(ev.scenes).toBe(2);
  });
});
