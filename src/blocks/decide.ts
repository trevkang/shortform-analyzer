import type { DecisionAnswer, DecisionQuestion, Decisions, Evidence, OpenAIOptions, Probs } from "../types.js";
import { openai, stage } from "./run.js";

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

/** The questions as sent: each scene's `scene` questions (scene by scene), then the `video` ones. Throws on a bad set. */
export function expandQuestions(questions: DecisionQuestion[], scenes: number): Wire[] {
  const sceneQs = questions.filter((q) => q.scope === "scene");
  const videoQs = questions.filter((q) => q.scope !== "scene");
  if (sceneQs.length && !scenes) throw new Error("decide: scene questions need scene evidence (sceneEvidence)");
  const out: Wire[] = [];
  for (let i = 0; i < scenes; i++) {
    for (const q of sceneQs) out.push(wire(q, `${q.name}_${i}`, q.instructions.replaceAll("{scene}", String(i + 1))));
  }
  for (const q of videoQs) out.push(wire(q, q.name, q.instructions));
  for (const q of questions) if (!NAME.test(q.name)) throw new Error(`decide: question name "${q.name}" must match [a-z0-9_]+`);
  const seen = new Set<string>();
  for (const w of out) {
    if (seen.has(w.name)) throw new Error(`decide: question name "${w.name}" is used twice`);
    seen.add(w.name);
  }
  if (out.length < 1 || out.length > MAX_DECISION_QUESTIONS) {
    throw new Error(`decide: ${out.length} questions after expanding per scene; one request holds 1 to ${MAX_DECISION_QUESTIONS}`);
  }
  return out;
}

/** The request body for OpenAI Decisions. */
export function decisionsRequest(evidence: Evidence, questions: DecisionQuestion[]) {
  const content: unknown[] = [{ type: "input_text", text: evidence.intro }];
  for (const item of evidence.items) {
    content.push(item.type === "text"
      ? { type: "input_text", text: item.text }
      : { type: "input_image", image_url: `data:${item.mime ?? "image/jpeg"};base64,${item.image.toString("base64")}` });
  }
  return { model: DECISIONS_MODEL, input: [{ role: "user", content }], questions: expandQuestions(questions, evidence.scenes) };
}

type RawAnswer = { type: string; name: string; choice?: string; probabilities?: { value: string | number; probability: number }[]; score?: number; probability?: number };

function inRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function read(q: DecisionQuestion, a: RawAnswer | undefined): DecisionAnswer | undefined {
  if (!a || a.type !== q.type) return undefined; // refused, missing, or answered as something else
  if (q.type === "predicate") return inRange(a.probability, 1) ? { probability: a.probability } : undefined;
  if (q.type === "score") return inRange(a.score, q.levels.length - 1) ? { score: a.score } : undefined;
  const probs: Probs = {};
  for (const p of Array.isArray(a.probabilities) ? a.probabilities : []) {
    if (p && (typeof p.value === "string" || typeof p.value === "number") && inRange(p.probability, 1)) {
      probs[String(p.value)] = p.probability;
    }
  }
  return q.choices.some((c) => c.value === a.choice) ? { choice: a.choice, probs } : undefined;
}

/** Decisions' raw answers → answers per video question and per scene question; refused or missing ones are absent. */
export function parseAnswers(data: { answers?: RawAnswer[]; usage?: { input_tokens?: number } }, questions: DecisionQuestion[], scenes: number): Decisions {
  if (!data || typeof data !== "object" || Array.isArray(data) || (data.answers !== undefined && !Array.isArray(data.answers))) {
    throw new Error("decide: invalid response: expected an object with an optional answers array");
  }
  const answers = (data.answers ?? []).filter((a) => a && typeof a === "object" && typeof a.name === "string");
  const byName = new Map(answers.map((a) => [a.name, a]));
  const put = (into: Record<string, DecisionAnswer>, q: DecisionQuestion, wireName: string) => {
    const v = read(q, byName.get(wireName));
    if (v) into[q.name] = v;
  };
  const video: Record<string, DecisionAnswer> = {};
  for (const q of questions) if (q.scope !== "scene") put(video, q, q.name);
  const perScene = Array.from({ length: scenes }, (_, i) => {
    const s: Record<string, DecisionAnswer> = {};
    for (const q of questions) if (q.scope === "scene") put(s, q, `${q.name}_${i}`);
    return s;
  });
  const tokens = data.usage?.input_tokens;
  return { video, scenes: perScene, ...(typeof tokens === "number" ? { inputTokens: tokens } : {}) };
}

/** One OpenAI Decisions request over the evidence. Returns only what the model answered, with no fallbacks. */
export function decide(evidence: Evidence, questions: DecisionQuestion[], options: OpenAIOptions = {}): Promise<Decisions> {
  return stage("decide", async () => {
    const body = decisionsRequest(evidence, questions); // validates before the key and before any request
    const api = openai(options, "decide");
    const res = await api.fetch(`${api.base}/decisions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => {
      if (res.ok) throw new Error("invalid response: expected JSON");
      return {};
    });
    if (!res.ok) throw new Error(`decisions ${res.status}: ${data?.error?.message ?? "no body"}`);
    return parseAnswers(data, questions, evidence.scenes);
  });
}
