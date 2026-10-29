// The decide questions: the record's (made from TAXONOMY), then the caller's, in the same request.
import type { DecisionQuestion, Question } from "../types.js";
import { FOOTAGE, FORMATS, ROLES, SELLS, SUBJECTS, TAXONOMY, TOPICS, valueText } from "./taxonomy.js";

export const MAX_QUESTIONS = 20;
export const MAX_SCENE_QUESTIONS = 6; // 4 + 9 × 40 − 1 record questions fit one request of 400; 14 + 6 × 40 of the caller's take a second
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

const choices = (field: "topic" | "format" | "sells" | "role" | "footage" | "subject", values: readonly string[]) =>
  values.map((value) => ({ value, description: valueText(field, value) }));

const rules = (field: keyof typeof TAXONOMY) => TAXONOMY[field].rules.join(" ");

/** The record's own questions: 4 about the video, 9 per scene (`role` from the second scene: the first is the hook). */
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
    instructions: "Is the product the video sells in scene {scene}: seen (the item, its packaging or its screen, also while it is used or applied) " +
      "or named? No when the video sells nothing.",
  },
  {
    type: "choice", name: "subject", scope: "scene", choices: choices("subject", SUBJECTS),
    instructions: `What fills most of the frame of scene {scene}. ${rules("subject")}`,
  },
  {
    type: "predicate", name: "split_screen", scope: "scene",
    instructions: "Is the frame of scene {scene} split into panels, each with its own picture? Yes for a duet side by side; " +
      "a reaction stacked over the original; before and after side by side; gameplay on top and a face below.",
  },
  {
    type: "predicate", name: "overlay", scope: "scene",
    instructions: "Does a second picture sit on top of the main one in scene {scene}: a video, photo or screenshot in a window, " +
      "or a person cut out over it? Yes for a facecam over gameplay; a reaction window in a corner; a green screen; a screenshot laid over a talking head.",
  },
  {
    type: "predicate", name: "text_bar", scope: "scene",
    instructions: "Is the picture of scene {scene} shrunk to make room for a solid bar above or below it, with text in the bar? " +
      "Yes for a meme clip under a white bar of text; a podcast clip under a headline bar.",
  },
  {
    type: "predicate", name: "captions", scope: "scene",
    instructions: "Are the words heard in scene {scene} written on screen as subtitles? Yes for subtitles under a talking head; " +
      "word-by-word captions of a voiceover; a song's lyrics on screen.",
  },
  // Without its last sentence, a line kept on screen was a message only in the scene it first showed in: of 70 message
  // scenes right after another, 32 were found, and 60 with it (eval/README.md).
  {
    type: "predicate", name: "message", scope: "scene",
    instructions: "Does scene {scene} show words its maker wrote for the viewer, other than the words heard: a hook, a title, " +
      'a statement, a joke, a POV, a question, a list or a line of a story? Yes for "POV: you finally found an app that works"; ' +
      '"3 mistakes everyone makes"; a headline bar over a podcast clip. Also when the same words stay on screen from the scene before.',
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
