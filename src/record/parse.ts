// Decisions → the record's decide fields, with the fallbacks and the hook rule (docs/video-analysis.md).
import type { Answer, DecisionAnswer, Decisions, Footage, Format, Question, Role, Sells, Span, Topic } from "../types.js";
import { QUESTION_PREFIX } from "./questions.js";
import { FOOTAGE, FORMATS, ROLES, SELLS, TOPICS } from "./taxonomy.js";

export const HOOK_BEFORE = 6; // s: a later scene can still be hook only if it starts before this (TikTok's guidance)

export type SceneFields = { role: Role; footage: Footage; showsProduct?: boolean; answers?: Record<string, Answer> };

export type RecordFields = {
  topic: Topic;
  format: Format;
  sells: Sells;
  asksForComment: boolean;
  product: string;
  scenes: SceneFields[];
  answers?: Record<string, Answer>;
};

const pick = <V extends string>(a: DecisionAnswer | undefined, values: readonly V[], fallback: V): V =>
  values.includes(a?.choice as V) ? (a!.choice as V) : fallback;

const yes = (a: DecisionAnswer | undefined) => (a?.probability ?? 0) >= 0.5;

/** The most probable role other than hook, or body when the answer has no probabilities. */
function notHook(a: DecisionAnswer | undefined): Role {
  const ranked = Object.entries(a?.probs ?? {}).filter(([v]) => v !== "hook" && ROLES.includes(v as Role)).sort((x, y) => y[1] - x[1]);
  return (ranked[0]?.[0] as Role | undefined) ?? "body";
}

/**
 * The first scene is hook. A later scene stays hook only while every scene before it is hook and it starts before 6 s;
 * otherwise it takes its most probable role other than hook.
 */
export function hookRule(answers: (DecisionAnswer | undefined)[], starts: number[]): Role[] {
  const roles: Role[] = [];
  starts.forEach((start, i) => {
    if (i === 0) return roles.push("hook");
    const role = pick(answers[i], ROLES, "body");
    roles.push(role === "hook" && roles[i - 1] === "hook" && start < HOOK_BEFORE ? "hook" : role === "hook" ? notHook(answers[i]) : role);
  });
  return roles;
}

/** The caller's answers in one place: `true`/`false` for yes/no, the chosen value for a choice; unanswered left out. */
function callerAnswers(from: Record<string, DecisionAnswer>, questions: Question[]): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const q of questions) {
    const a = from[`${QUESTION_PREFIX}${q.name}`];
    if (q.choices ? a?.choice !== undefined : a?.probability !== undefined) out[q.name] = q.choices ? a!.choice! : yes(a);
  }
  return out;
}

/** Decisions → the decide fields, with the fallbacks, the hook rule, `product` following `sells`, and the caller's answers. */
export function parseRecord(d: Decisions, facts: { spans: Span[]; product: string; questions?: Question[] }): RecordFields {
  const v = d.video;
  const sells = pick(v.sells, SELLS, "none");
  const questions = facts.questions ?? [];
  const videoQs = questions.filter((q) => q.scope !== "scene");
  const sceneQs = questions.filter((q) => q.scope === "scene");
  const roles = hookRule(facts.spans.map((_, i) => d.scenes[i]?.role), facts.spans.map((s) => s.start));
  return {
    topic: pick(v.topic, TOPICS, "other"),
    format: pick(v.format, FORMATS, "other"),
    sells,
    asksForComment: yes(v.asks_for_comment),
    product: sells === "none" ? "" : facts.product,
    scenes: facts.spans.map((_, i) => {
      const s = d.scenes[i] ?? {};
      return {
        role: roles[i],
        footage: pick(s.footage, FOOTAGE, "other"),
        ...(sells !== "none" ? { showsProduct: yes(s.shows_product) } : {}),
        ...(sceneQs.length ? { answers: callerAnswers(s, sceneQs) } : {}),
      };
    }),
    ...(videoQs.length ? { answers: callerAnswers(v, videoQs) } : {}),
  };
}
