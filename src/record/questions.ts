// The decide questions: the record's (made from TAXONOMY), then the caller's, in the same request.
import type { DecisionQuestion, Question } from "../types.js";
import { FOOTAGE, FORMATS, ROLES, SELLS, TAXONOMY, TOPICS, valueText } from "./taxonomy.js";

export const MAX_QUESTIONS = 20;
export const MAX_SCENE_QUESTIONS = 6; // 4 + 3 × 40 − 1 record questions, plus 14 + 6 × 40 of the caller's, stay under 400
export const MAX_CHOICES = 20;
export const QUESTION_PREFIX = "q_";
const NAME = /^[a-z0-9_]+$/;

/** Throws `questions:` unless the caller's questions are within the limits (docs/reference.md "Options"). */
export function checkQuestions(questions: Question[] = []): void {
  const fail = (why: string) => { throw new Error(`questions: ${why}`); };
  if (questions.length > MAX_QUESTIONS) fail(`${questions.length} questions; the maximum is ${MAX_QUESTIONS}`);
  const perScene = questions.filter((q) => q.scope === "scene");
  if (perScene.length > MAX_SCENE_QUESTIONS) fail(`${perScene.length} scene questions; at most ${MAX_SCENE_QUESTIONS} per scene`);
  const names = new Set<string>();
  for (const q of questions) {
    if (!NAME.test(q.name ?? "")) fail(`"${q.name}" must match [a-z0-9_]+`);
    if (names.has(q.name)) fail(`"${q.name}" is used twice`);
    names.add(q.name);
    if (!q.question?.trim()) fail(`"${q.name}" has no question`);
    if (q.scope !== undefined && q.scope !== "video" && q.scope !== "scene") fail(`"${q.name}": scope is video or scene`);
    if (q.choices && (q.choices.length < 2 || q.choices.length > MAX_CHOICES || new Set(q.choices).size !== q.choices.length)) {
      fail(`"${q.name}" needs 2 to ${MAX_CHOICES} distinct choices`);
    }
  }
  // A scene question goes out once per scene as <name>_<i>, which a video question must not be named.
  for (const q of questions) {
    const base = q.name.match(/^(.+)_\d+$/)?.[1];
    if (q.scope !== "scene" && base && perScene.some((s) => s.name === base)) fail(`"${q.name}" clashes with scene question "${base}"`);
  }
}

const choices = (field: "topic" | "format" | "sells" | "role" | "footage", values: readonly string[]) =>
  values.map((value) => ({ value, description: valueText(field, value) }));

const rules = (field: keyof typeof TAXONOMY) => TAXONOMY[field].rules.join(" ");

/** The record's own questions: 4 about the video, 3 per scene (`role` from the second scene: the first is the hook). */
export const RECORD_QUESTIONS: DecisionQuestion[] = [
  {
    type: "choice", name: "topic", choices: choices("topic", TOPICS),
    instructions: `The video's top-level subject. Rules, applied before the choices: ${rules("topic")} TikTok's own topic label, when given, is a hint.`,
  },
  {
    type: "choice", name: "format", choices: choices("format", FORMATS),
    instructions: `What kind of video it is, whatever it is about. ${rules("format")}`,
  },
  {
    type: "choice", name: "sells", choices: choices("sells", SELLS),
    instructions: rules("sells"),
  },
  {
    type: "predicate", name: "asks_for_comment",
    instructions: "Does the video ask viewers to write something specific in the comments: a keyword (often to get something sent back), " +
      `an answer to its question, or a pick? Yes for "Comment 'notes' and I'll send it" or "Which one would you pick, 1 or 2?"; ` +
      `no for "Let me know what you think" or "Follow for part 2".`,
  },
  {
    type: "choice", name: "role", scope: "scene", from: 1, choices: choices("role", ROLES),
    instructions: "The job scene {scene} does in the video. Scene 1 is the hook.",
  },
  {
    type: "choice", name: "footage", scope: "scene", choices: choices("footage", FOOTAGE),
    instructions: `What fills the frame of scene {scene}. ${rules("footage")}`,
  },
  {
    type: "predicate", name: "shows_product", scope: "scene",
    instructions: "Is the product the video sells seen or named in scene {scene}? No when the video sells nothing.",
  },
];

/** The caller's question as sent: `q_<name>`, yes/no unless it has choices; a scene question names its scene. */
export function callerQuestion(q: Question): DecisionQuestion {
  const scene = q.scope === "scene";
  const base = { name: `${QUESTION_PREFIX}${q.name}`, instructions: scene ? `About scene {scene}: ${q.question}` : q.question, ...(scene ? { scope: "scene" as const } : {}) };
  return q.choices ? { ...base, type: "choice", choices: q.choices.map((value) => ({ value })) } : { ...base, type: "predicate" };
}

/** The decide questions: the record's, then `q_<name>` per caller question. */
export function recordQuestions(o: { questions?: Question[] } = {}): DecisionQuestion[] {
  return [...RECORD_QUESTIONS, ...(o.questions ?? []).map(callerQuestion)];
}
