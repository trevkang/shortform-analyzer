import type { Analysis, Scene } from "../primitives.js";

const words = (s: string) => s.replace(/_/g, " ");
/** One line: whitespace collapsed, cut at `n` characters. */
const clip = (s: string, n = 140) => {
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > n ? `${line.slice(0, n)}...` : line;
};
const SPEECH = { subtitles: "TikTok's subtitles", transcription: "an automatic transcription", none: "not known" };
const FACETS = { splitScreen: "split screen", overlay: "overlay", textBar: "text bar", captions: "captions", message: "message" } as const;

/** Consecutive scenes with the same role, as one run. */
function runs(scenes: Scene[]): Scene[][] {
  const out: Scene[][] = [];
  for (const s of scenes) {
    const last = out.at(-1);
    if (last && last[0].role === s.role) last.push(s);
    else out.push([s]);
  }
  return out;
}

function runLine(run: Scene[]): string {
  const footage = [...new Set(run.map((s) => words(s.footage)))].join(", ");
  const subject = [...new Set(run.flatMap((s) => (s.subject ? [words(s.subject)] : [])))].join(", ");
  const facets = Object.entries(FACETS).filter(([f]) => run.some((s) => s[f as keyof typeof FACETS])).map(([, w]) => w).join(", ");
  const product = run.some((s) => s.showsProduct) ? ", product shown" : "";
  const said = run.map((s) => s.spoken).filter(Boolean).join(" ");
  const shown = run.map((s) => s.onScreenText).filter(Boolean).join(" / ");
  const start = run[0].start.toFixed(1);
  const end = run.at(-1)!.end.toFixed(1);
  return `${run[0].role} ${start}-${end} s, ${run.length} scene${run.length > 1 ? "s" : ""} (${footage}${subject && `; ${subject}`}${facets && `; ${facets}`}${product})` +
    `${said ? `: "${clip(said)}"` : ""}${shown ? ` [on screen: "${clip(shown, 80)}"]` : ""}`;
}

const answer = (v: boolean | string) => (v === true ? "yes" : v === false ? "no" : v);

/** What an agent reads about one analysed video: the video fields, one line per run of scenes with the same role, the comments, the cost. */
export function summarize(a: Analysis): string {
  const length = a.media === "photos" ? `${a.duration} photos` : `${a.duration.toFixed(1)} s`;
  const sells = a.sells === "none" ? "sells nothing" : `sells ${words(a.sells)}${a.product ? ` ("${a.product}")` : ""}`;
  const lines = [
    `${words(a.format)} about ${words(a.topic)}, ${sells}${a.asksForComment ? ", asks for a comment" : ""}. ` +
      `${length}, ${a.scenes.length} scenes, words: ${SPEECH[a.speech]}.`,
    a.tags.length ? `Tags: ${a.tags.join(", ")}.` : "",
    a.description ? `About: ${a.description}` : "",
    a.formatDescription ? `Made: ${a.formatDescription}` : "",
    ...runs(a.scenes).map((r) => `  ${runLine(r)}`),
  ];
  if (a.answers && Object.keys(a.answers).length) {
    lines.push(`Answers: ${Object.entries(a.answers).map(([k, v]) => `${k} ${answer(v)}`).join(", ")}.`);
  }
  const perScene = a.scenes.filter((s) => s.answers && Object.keys(s.answers).length);
  if (perScene.length) {
    lines.push(`Scene answers: ${perScene.map((s) => `${s.index + 1}: ${Object.entries(s.answers!).map(([k, v]) => `${k} ${answer(v)}`).join(", ")}`).join("; ")}.`);
  }
  if (a.comments) {
    const count = new Map<string, number>();
    for (const c of a.comments) count.set(c.kind, (count.get(c.kind) ?? 0) + 1);
    const kinds = [...count].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n} ${words(k)}`).join(", ");
    lines.push(`Comments: ${a.comments.length} read${kinds ? `, ${kinds}` : ""}.`);
  }
  for (const name of ["speech", "comments"] as const) {
    const e = a.stages[name]?.error;
    if (e) lines.push(`No ${name}: ${e}.`);
  }
  const reused = Object.entries(a.stages).filter(([, s]) => s?.reused).map(([k]) => k);
  lines.push(`Cost: $${a.costUsd.toFixed(5)}${reused.length ? ` (reused: ${reused.join(", ")})` : ""}.`);
  return lines.filter(Boolean).join("\n");
}
