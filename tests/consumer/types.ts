import { analyzeVideo, type Analysis, type Question, type Role } from "shortform-analyzer";
import { decide, recordQuestions, sceneEvidence, type DecisionQuestion, type Decisions, type Span } from "shortform-analyzer/primitives";

const q: Question[] = [{ name: "face", question: "Is a face on camera?" }];
const qs: DecisionQuestion[] = [...recordQuestions({ questions: q }), { type: "predicate", name: "logo", scope: "scene", instructions: "Logo in scene {scene}?" }];
const spans: Span[] = [{ start: 0, end: 1 }];

export async function check(): Promise<Role | undefined> {
  const r = await analyzeVideo("clip.mp4", { questions: q, flex: true });
  const a: Analysis | undefined = r.ok ? r : undefined;
  const d: Decisions = await decide(sceneEvidence(spans, [Buffer.from("")], [""], { duration: 1 }), qs);
  void d.scenes[0]?.logo?.probability;
  void a?.comments?.[0]?.id;
  return a?.scenes[0]?.role;
}
