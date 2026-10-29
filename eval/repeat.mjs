// Each analysis's describe and decide requests asked again, run after run, with the candidate facets (candidates.mjs) in
// the decide request. Each run describes the analysis's own frames and words again and decides on what it wrote, as
// src/pipeline/analyze.ts does: OpenAI's Decisions answers the same evidence the same way every time, so runs differ
// where two analyses of the same video would. Writes repeats.json next to each analysis.json (the full one, with frames
// and raw), for eval/stability.mjs.
// Usage: node eval/repeat.mjs <analyses dir> [--runs 5]   (OPENAI_API_KEY)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  decide, DECISIONS_MODEL, describe, DESCRIBE_MODEL, describeRequest, parseDescribed, parseRecord, recordIntro, recordQuestions, sceneEvidence,
} from "../dist/primitives.js";
import { decisionsCost, PRICES, responsesCost } from "../dist/prices.js";
import { CANDIDATE_FIELDS, CANDIDATE_QUESTIONS, candidateValue } from "./candidates.mjs";

const spansOf = (a) => a.scenes.map((s) => ({ start: s.start, end: s.end, ...(s.cut === false ? { cut: false } : {}) }));

/** The evidence of a full analysis.json as the pipeline builds it: describe's without `described`, decide's with it. */
function evidence(a, described) {
  const spans = spansOf(a);
  const frames = a.scenes.map((s) => Buffer.from(s.frame.slice(s.frame.indexOf(",") + 1), "base64"));
  const facts = { media: a.media, duration: a.duration, scenes: spans.length, speech: a.speech, ...(a.raw.post ? { post: a.raw.post } : {}) };
  return sceneEvidence(spans, frames, a.scenes.map((s) => s.spoken), {
    duration: a.duration, intro: recordIntro(facts, described), words: a.speech, ...(a.media === "photos" ? { photos: true } : {}),
  });
}

/** The evidence the analysis's own decide request read. */
export const decideEvidence = (a) => evidence(a, parseDescribed(a.raw.describe, a.scenes.length));

/** `runs` runs at once, each a describe and a decide request: its decide fields, the candidates per scene, what describe wrote and the answers. */
export async function repeat(a, { runs = 5, ...openai } = {}) {
  if (!a.raw?.describe || !a.scenes.every((s) => s.frame)) throw new Error("repeat: needs the full analysis.json, with frames and raw");
  const spans = spansOf(a);
  return Promise.all(Array.from({ length: runs }, async () => {
    const written = await describe(evidence(a), describeRequest(spans.length), openai);
    const described = parseDescribed(written.output, spans.length);
    const decisions = await decide(evidence(a, described), [...recordQuestions(), ...CANDIDATE_QUESTIONS], openai);
    const r = parseRecord(decisions, { spans, product: described.product });
    return {
      topic: r.topic, format: r.format, sells: r.sells, asksForComment: r.asksForComment,
      scenes: r.scenes.map((s, i) => ({
        ...s, ...Object.fromEntries(Object.entries(CANDIDATE_FIELDS).map(([f, name]) => [f, candidateValue(name, decisions.scenes[i]?.[name])])),
      })),
      describe: written.output, describeUsage: written.usage, decisions,
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
      usd += made.reduce((sum, r) => sum + responsesCost(PRICES, DESCRIBE_MODEL, r.describeUsage) + decisionsCost(PRICES, DECISIONS_MODEL, r.decisions.usage), 0);
      writeFileSync(file, JSON.stringify({ model: DECISIONS_MODEL, runs: made }));
      console.log(`${name}: ${runs} runs, $${usd.toFixed(4)} so far`);
    } catch (e) {
      console.log(`${name}: ${String(e?.message ?? e).split("\n")[0]}`);
    }
  }
}
