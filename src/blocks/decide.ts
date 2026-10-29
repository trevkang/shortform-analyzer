import type { DecisionAnswer, DecisionQuestion, Decisions, Evidence, OpenAIOptions, Probs } from "../types.js";
import { responsesContent } from "./describe.js";
import { openai, send, stage } from "./run.js";

export const DECISIONS_MODEL = "gpt-6-luna";
export const MAX_DECISION_QUESTIONS = 400;
const NAME = /^[a-z0-9_]+$/;

type Wire = { type: string; name: string; instructions: string; choices?: unknown; levels?: unknown };

function wire(q: DecisionQuestion, name: string, instructions: string): Wire {
  const out: Wire = { type: q.type, name, instructions };
  if (q.type === "choice") out.choices = q.choices;
  if (q.type === "score") out.levels = q.levels;
  return out;
}

const asked = (q: DecisionQuestion, i: number) => q.scope === "scene" && i >= (q.from ?? 0);

/** The questions as sent: each scene's `scene` questions (scene by scene), then the `video` ones. Throws on a bad set or none. */
export function expandQuestions(questions: DecisionQuestion[], scenes: number): Wire[] {
  const sceneQs = questions.filter((q) => q.scope === "scene");
  const videoQs = questions.filter((q) => q.scope !== "scene");
  if (sceneQs.length && !scenes) throw new Error("decide: scene questions need scene evidence (sceneEvidence or textEvidence)");
  const out: Wire[] = [];
  for (let i = 0; i < scenes; i++) {
    for (const q of sceneQs) if (asked(q, i)) out.push(wire(q, `${q.name}_${i}`, q.instructions.replaceAll("{scene}", String(i + 1))));
  }
  for (const q of videoQs) out.push(wire(q, q.name, q.instructions));
  for (const q of questions) if (!NAME.test(q.name)) throw new Error(`decide: question name "${q.name}" must match [a-z0-9_]+`);
  const seen = new Set<string>();
  for (const w of out) {
    if (seen.has(w.name)) throw new Error(`decide: question name "${w.name}" is used twice`);
    seen.add(w.name);
  }
  if (out.length < 1) throw new Error(`decide: 0 questions after expanding per scene; a request holds 1 to ${MAX_DECISION_QUESTIONS}`);
  return out;
}

/**
 * The request bodies for OpenAI Decisions: the questions in order, at most 400 to a request, each request with the whole
 * evidence. Each question is answered on its own, so the answers don't depend on which request asked them.
 */
export function decisionsRequests(evidence: Evidence, questions: DecisionQuestion[], model = DECISIONS_MODEL) {
  const all = expandQuestions(questions, evidence.scenes);
  const input = [{ role: "user", content: responsesContent(evidence) }];
  const at = (i: number) => all.slice(i * MAX_DECISION_QUESTIONS, (i + 1) * MAX_DECISION_QUESTIONS);
  return Array.from({ length: Math.ceil(all.length / MAX_DECISION_QUESTIONS) }, (_, i) => ({ model, input, questions: at(i) }));
}

type RawAnswer = { type: string; name: string; choice?: string; probabilities?: { value: string | number; probability: number }[]; score?: number; probability?: number };

function read(q: DecisionQuestion, a: RawAnswer | undefined): DecisionAnswer | undefined {
  if (!a || a.type !== q.type) return undefined; // refused, missing, or answered as something else
  if (q.type === "predicate") return typeof a.probability === "number" ? { probability: a.probability } : undefined;
  if (q.type === "score") return typeof a.score === "number" ? { score: a.score } : undefined;
  const probs: Probs = {};
  for (const p of a.probabilities ?? []) probs[String(p.value)] = p.probability;
  return q.choices.some((c) => c.value === a.choice) ? { choice: a.choice, probs } : undefined;
}

/** Decisions' raw answers → answers per video question and per scene question; refused or missing ones are absent. */
export function parseAnswers(data: { answers?: RawAnswer[]; usage?: { input_tokens?: number } }, questions: DecisionQuestion[], scenes: number): Decisions {
  const byName = new Map((data.answers ?? []).map((a) => [a.name, a]));
  const put = (into: Record<string, DecisionAnswer>, q: DecisionQuestion, wireName: string) => {
    const v = read(q, byName.get(wireName));
    if (v) into[q.name] = v;
  };
  const video: Record<string, DecisionAnswer> = {};
  for (const q of questions) if (q.scope !== "scene") put(video, q, q.name);
  const perScene = Array.from({ length: scenes }, (_, i) => {
    const s: Record<string, DecisionAnswer> = {};
    for (const q of questions) if (asked(q, i)) put(s, q, `${q.name}_${i}`);
    return s;
  });
  const tokens = data.usage?.input_tokens;
  return { video, scenes: perScene, ...(typeof tokens === "number" ? { usage: { inputTokens: tokens } } : {}) };
}

/**
 * OpenAI Decisions over the evidence: one request, or one per 400 questions after expanding. Returns only what the model
 * answered, with no fallbacks.
 */
export function decide(evidence: Evidence, questions: DecisionQuestion[], options: OpenAIOptions & { model?: string } = {}): Promise<Decisions> {
  return stage("decide", async () => {
    const bodies = decisionsRequests(evidence, questions, options.model); // validates before the key and before any request
    const api = openai(options, "decide");
    const replies = await Promise.all(bodies.map(async (body) => {
      const res = await send(api.fetch, `${api.base}/decisions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`decisions ${res.status}: ${data?.error?.message ?? "no body"}`);
      return data;
    }));
    const tokens = replies.map((d) => d?.usage?.input_tokens);
    const merged = {
      answers: replies.flatMap((d) => d?.answers ?? []),
      ...(tokens.every((t) => typeof t === "number") ? { usage: { input_tokens: tokens.reduce((a, b) => a + b, 0) } } : {}),
    };
    return { ...parseAnswers(merged, questions, evidence.scenes), ...(bodies.length > 1 ? { requests: bodies.length } : {}) };
  });
}
