// Examples 14–16: decide on its own; describe on its own; the requests' timeout and retries.
import { describe as group, expect, it } from "vitest";
import { decide, describe, sceneEvidence, textEvidence, type DecisionQuestion, type Span } from "../src/primitives.js";
import { send } from "../src/blocks/run.js";
import { KEYS } from "./helpers.js";

const spans: Span[] = [{ start: 0, end: 1.5 }, { start: 1.5, end: 3 }, { start: 3, end: 4.5 }];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const evidence = sceneEvidence(spans, spans.map(() => jpeg), ["", "", ""], { duration: 4.5 });
const logo: DecisionQuestion = { type: "predicate", name: "logo", scope: "scene", instructions: "Is a logo visible in scene {scene}?" };

function decisionsFetch(reply: (body: any) => unknown) {
  const bodies: any[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return Response.json(reply(body));
  }) as unknown as typeof fetch;
  return { fetchFn, bodies };
}

group("decide (Examples 14–16)", () => {
  it("Example 14: a scene question goes out once per scene, naming it", async () => {
    const f = decisionsFetch((b) => ({ answers: b.questions.map((q: any, i: number) => ({ type: "predicate", name: q.name, probability: i / 10 })), usage: { input_tokens: 321 } }));
    const d = await decide(evidence, [logo], { ...KEYS, fetch: f.fetchFn });
    const qs = f.bodies[0].questions;
    expect(qs.map((q: any) => q.name)).toEqual(["logo_0", "logo_1", "logo_2"]);
    expect(qs.map((q: any) => q.instructions)).toEqual([1, 2, 3].map((n) => `Is a logo visible in scene ${n}?`));
    expect(d.scenes.map((s) => s.logo?.probability)).toEqual([0, 0.1, 0.2]);
    expect(d.usage).toEqual({ inputTokens: 321 });
    expect(f.bodies[0].model).toBe("gpt-6-luna");
  });

  it("Example 15: more than 400 questions after expanding throws before any request", async () => {
    const forty = Array.from({ length: 40 }, (_, i) => ({ start: i, end: i + 1 }));
    const big = sceneEvidence(forty, forty.map(() => jpeg), forty.map(() => ""), { duration: 40 });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...logo, name: `logo${i}` }));
    const f = decisionsFetch(() => ({}));
    await expect(decide(big, eleven, { ...KEYS, fetch: f.fetchFn })).rejects.toThrow(/^decide: .*400/);
    expect(f.bodies).toEqual([]);
  });

  it("Example 16: an answer left out stays undefined", async () => {
    const f = decisionsFetch((b) => ({ answers: b.questions.filter((q: any) => q.name !== "logo_1").map((q: any) => ({ type: "predicate", name: q.name, probability: 0.9 })) }));
    const d = await decide(evidence, [logo], { ...KEYS, fetch: f.fetchFn });
    expect(d.scenes[1].logo).toBeUndefined();
    expect(d.scenes[0].logo?.probability).toBe(0.9);
  });

  it("asks a scene question from a later scene with `from`", async () => {
    const f = decisionsFetch(() => ({ answers: [] }));
    await decide(evidence, [{ ...logo, from: 1 }], { ...KEYS, fetch: f.fetchFn });
    expect(f.bodies[0].questions.map((q: any) => q.name)).toEqual(["logo_1", "logo_2"]);
  });

  it("a choice outside the list, or a refusal, is left out", async () => {
    const kind: DecisionQuestion = { type: "choice", name: "kind", scope: "scene", instructions: "Kind of {scene}", choices: [{ value: "a" }, { value: "b" }] };
    const f = decisionsFetch(() => ({ answers: [{ type: "choice", name: "kind_0", choice: "z" }, { type: "refusal", name: "kind_1" }, { type: "choice", name: "kind_2", choice: "b", probabilities: [{ value: "b", probability: 0.8 }] }] }));
    const d = await decide(textEvidence("Three texts", ["x", "y", "z"]), [kind], { ...KEYS, fetch: f.fetchFn });
    expect(d.scenes.map((s) => s.kind?.choice)).toEqual([undefined, undefined, "b"]);
    expect(d.scenes[2].kind?.probs).toEqual({ b: 0.8 });
  });

  it("throws decide: with OpenAI's message", async () => {
    const fetchFn = (async () => Response.json({ error: { message: "model not found" } }, { status: 404 })) as unknown as typeof fetch;
    await expect(decide(evidence, [logo], { ...KEYS, fetch: fetchFn })).rejects.toThrow("decide: decisions 404: model not found");
    await expect(decide(evidence, [logo], { openaiApiKey: "", fetch: fetchFn })).rejects.toThrow(/^decide: OPENAI_API_KEY is not set/);
  });
});

group("describe", () => {
  const request = { name: "t", instructions: "Write it.", schema: { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } } };

  it("sends the evidence as Responses input with a strict JSON schema, and returns the JSON and usage", async () => {
    let sent: any;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return Response.json({ output_text: '{"a":"x"}', usage: { input_tokens: 10, output_tokens: 3 } });
    }) as unknown as typeof fetch;
    const r = await describe(evidence, request, { ...KEYS, fetch: fetchFn, openaiBaseUrl: "https://example.test/v1/" });
    expect(sent.url).toBe("https://example.test/v1/responses");
    expect(sent.body.text.format).toEqual({ type: "json_schema", name: "t", schema: request.schema, strict: true });
    expect(sent.body.instructions).toBe("Write it.");
    const content = sent.body.input[0].content;
    expect(content.filter((c: any) => c.type === "input_image")).toHaveLength(3);
    expect(content[2].image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(r).toEqual({ output: { a: "x" }, usage: { inputTokens: 10, outputTokens: 3 } });
  });

  it("asks gpt-6-luna for low reasoning effort, and another model for none unless told", async () => {
    const bodies: any[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ output_text: '{"a":"x"}' });
    }) as unknown as typeof fetch;
    await describe(evidence, request, { ...KEYS, fetch: fetchFn });
    await describe(evidence, request, { ...KEYS, fetch: fetchFn, model: "other-model" });
    await describe(evidence, request, { ...KEYS, fetch: fetchFn, model: "other-model", effort: "high" });
    expect(bodies.map((b) => b.reasoning)).toEqual([{ effort: "low" }, undefined, { effort: "high" }]);
  });

  it("on flex, tries 4 times while there is no capacity, then the standard tier; a flex timeout goes to standard too", async () => {
    const tiers: (string | undefined)[] = [];
    const noCapacity = (async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      tiers.push(b.service_tier);
      if (b.service_tier === "flex") return Response.json({ error: { message: "unavailable" } }, { status: 429, headers: { "retry-after": "0" } });
      return Response.json({ output_text: '{"a":"x"}', service_tier: "default" });
    }) as unknown as typeof fetch;
    const r = await describe(evidence, request, { ...KEYS, fetch: noCapacity, serviceTier: "flex" });
    expect(tiers).toEqual(["flex", "flex", "flex", "flex", undefined]);
    expect(r.usage?.serviceTier).toBeUndefined();

    tiers.length = 0;
    const slow = (async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      tiers.push(b.service_tier);
      if (b.service_tier === "flex") throw new DOMException("The operation timed out.", "TimeoutError");
      return Response.json({ output_text: '{"a":"x"}' });
    }) as unknown as typeof fetch;
    expect((await describe(evidence, request, { ...KEYS, fetch: slow, serviceTier: "flex" })).output).toEqual({ a: "x" });
    expect(tiers).toEqual(["flex", undefined]);
  });

  it("throws describe: on a refusal or an error", async () => {
    const refusal = (async () => Response.json({ output: [{ content: [{ type: "refusal", refusal: "no" }] }] })) as unknown as typeof fetch;
    await expect(describe(evidence, request, { ...KEYS, fetch: refusal })).rejects.toThrow("describe: refused: no");
    const bad = (async () => Response.json({ error: { message: "bad schema" } }, { status: 400 })) as unknown as typeof fetch;
    await expect(describe(evidence, request, { ...KEYS, fetch: bad })).rejects.toThrow("describe: responses 400: bad schema");
  });
});

group("requests", () => {
  it("tries a 429 or 5xx again up to 3 times, as long as Retry-After says, else 2, 4, 6 s", async () => {
    const waits: number[] = [];
    const statuses = [429, 503, 500, 200];
    let n = 0;
    const fetchFn = (async () => new Response("x", { status: statuses[n++], headers: n === 1 ? { "retry-after": "7" } : {} })) as unknown as typeof fetch;
    const res = await send(fetchFn, "https://x.test", {}, { wait: async (ms) => { waits.push(ms); } });
    expect(res.status).toBe(200);
    expect(waits).toEqual([7000, 4000, 6000]);
    n = 0;
    const always = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    expect((await send(always, "https://x.test", {}, { wait: async () => {} })).status).toBe(500);
  });

  it("waits at most 60 s, whatever Retry-After says", async () => {
    const waits: number[] = [];
    let n = 0;
    const fetchFn = (async () => new Response("x", { status: n++ ? 200 : 429, headers: { "retry-after": "300" } })) as unknown as typeof fetch;
    await send(fetchFn, "https://x.test", {}, { wait: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([60_000]);
  });

  it("waits up to maxWaitMs when told: flex waits out its 300 s", async () => {
    const waits: number[] = [];
    let n = 0;
    const fetchFn = (async () => new Response("x", { status: n++ ? 200 : 429, headers: { "retry-after": "300" } })) as unknown as typeof fetch;
    await send(fetchFn, "https://x.test", {}, { maxWaitMs: 300_000, wait: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([300_000]);
  });

  it("does not try a 4xx again", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return new Response("x", { status: 400 }); }) as unknown as typeof fetch;
    await send(fetchFn, "https://x.test", {}, { wait: async () => {} });
    expect(n).toBe(1);
  });
});
