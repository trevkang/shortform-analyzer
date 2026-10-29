// The decide request of each analysis asked again, run after run, with the candidate facets (candidates.mjs) in it.
// The evidence is the analysis's own, built as src/pipeline/analyze.ts builds it, so what changes between runs is the
// model. Writes repeats.json next to each analysis.json (the full one, with frames and raw), for eval/stability.mjs.
// Usage: node eval/repeat.mjs <analyses dir> [--runs 5]   (OPENAI_API_KEY)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { decide, DECISIONS_MODEL, parseDescribed, parseRecord, recordIntro, recordQuestions, sceneEvidence } from "../dist/primitives.js";
import { decisionsCost, PRICES } from "../dist/prices.js";
import { CANDIDATE_FIELDS, CANDIDATE_QUESTIONS } from "./candidates.mjs";

const spansOf = (a) => a.scenes.map((s) => ({ start: s.start, end: s.end, ...(s.cut === false ? { cut: false } : {}) }));

/** The evidence the pipeline's decide request read, from a full analysis.json. */
export function decideEvidence(a) {
  const spans = spansOf(a);
  const frames = a.scenes.map((s) => Buffer.from(s.frame.slice(s.frame.indexOf(",") + 1), "base64"));
  const facts = { media: a.media, duration: a.duration, scenes: spans.length, speech: a.speech, ...(a.raw.post ? { post: a.raw.post } : {}) };
  return sceneEvidence(spans, frames, a.scenes.map((s) => s.spoken), {
    duration: a.duration, intro: recordIntro(facts, parseDescribed(a.raw.describe, spans.length)), words: a.speech,
    ...(a.media === "photos" ? { photos: true } : {}),
  });
}

/** `runs` decide requests over the same evidence, at once: each run's decide fields, the candidates per scene, and its answers. */
export async function repeat(a, { runs = 5, ...openai } = {}) {
  if (!a.raw?.describe || !a.scenes.every((s) => s.frame)) throw new Error("repeat: needs the full analysis.json, with frames and raw");
  const evidence = decideEvidence(a);
  const spans = spansOf(a);
  const product = parseDescribed(a.raw.describe, spans.length).product;
  return Promise.all(Array.from({ length: runs }, async () => {
    const decisions = await decide(evidence, [...recordQuestions(), ...CANDIDATE_QUESTIONS], openai);
    const r = parseRecord(decisions, { spans, product });
    return {
      topic: r.topic, format: r.format, sells: r.sells, asksForComment: r.asksForComment,
      scenes: r.scenes.map((s, i) => ({ ...s, ...Object.fromEntries(CANDIDATE_FIELDS.map((f) => [f, decisions.scenes[i]?.[f]?.choice ?? null])) })),
      decisions,
    };
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values, positionals: [dir] } = parseArgs({ allowPositionals: true, options: { runs: { type: "string", default: "5" } } });
  const runs = Number(values.runs);
  if (!dir || !(runs >= 2)) {
    console.error("Usage: node eval/repeat.mjs <analyses dir> [--runs 5]");
    process.exit(2);
  }
  let usd = 0;
  for (const name of readdirSync(dir).filter((d) => d.endsWith(".analysis")).sort()) {
    const file = join(dir, name, "repeats.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).runs.length >= runs) continue;
    try {
      const made = await repeat(JSON.parse(readFileSync(join(dir, name, "analysis.json"), "utf8")), { runs });
      usd += made.reduce((sum, r) => sum + decisionsCost(PRICES, DECISIONS_MODEL, r.decisions.usage), 0);
      writeFileSync(file, JSON.stringify({ model: DECISIONS_MODEL, runs: made }));
      console.log(`${name}: ${runs} runs, $${usd.toFixed(4)} so far`);
    } catch (e) {
      console.log(`${name}: ${String(e?.message ?? e).split("\n")[0]}`);
    }
  }
}
