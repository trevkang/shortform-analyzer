// Each analysis's describe and decide requests asked again, run after run. Each run describes the analysis's own frames
// and words again and decides on what it wrote, as src/pipeline/analyze.ts does: OpenAI's Decisions answers the same
// evidence the same way every time, so runs differ where two analyses of the same video would. Writes repeats.json next
// to each analysis.json (the full one, with frames and raw), for eval/stability.mjs. With --describe-from <file>, each
// run takes what describe wrote in that file's run of the same folder and asks only decide, so two such files differ
// only by the questions asked.
// Usage: node eval/repeat.mjs <analyses dir> [--runs 5] [--describe-from repeats-v2.json]   (OPENAI_API_KEY)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  decide, DECISIONS_MODEL, describe, DESCRIBE_MODEL, describeRequest, parseDescribed, parseRecord, recordIntro, recordQuestions, sceneEvidence,
} from "../dist/primitives.js";
import { decisionsCost, PRICES, responsesCost } from "../dist/prices.js";

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

/**
 * `runs` runs at once, each a describe and a decide request, or with `describes` (what describe wrote, one per run) only
 * the decide request: its decide fields, what describe wrote and the answers.
 */
export async function repeat(a, { runs = 5, describes, ...openai } = {}) {
  if (!a.raw?.describe || !a.scenes.every((s) => s.frame)) throw new Error("repeat: needs the full analysis.json, with frames and raw");
  const spans = spansOf(a);
  return Promise.all(Array.from({ length: describes?.length ?? runs }, async (_, i) => {
    const written = describes ? { output: describes[i] } : await describe(evidence(a), describeRequest(spans.length), openai);
    const described = parseDescribed(written.output, spans.length);
    const decisions = await decide(evidence(a, described), recordQuestions(), openai);
    const r = parseRecord(decisions, { spans, product: described.product });
    return {
      topic: r.topic, format: r.format, sells: r.sells, asksForComment: r.asksForComment, scenes: r.scenes,
      describe: written.output, describeUsage: written.usage, decisions,
    };
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values, positionals: [dir] } = parseArgs({
    allowPositionals: true, options: { runs: { type: "string", default: "5" }, "describe-from": { type: "string" } },
  });
  const runs = Number(values.runs);
  const from = values["describe-from"];
  if (!dir || !(runs >= 2)) {
    console.error("Usage: node eval/repeat.mjs <analyses dir> [--runs 5] [--describe-from repeats-v2.json]");
    process.exit(2);
  }
  let usd = 0;
  for (const name of readdirSync(dir).filter((d) => d.endsWith(".analysis")).sort()) {
    const file = join(dir, name, "repeats.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).runs.length >= runs) continue;
    try {
      const describes = from ? JSON.parse(readFileSync(join(dir, name, from), "utf8")).runs.map((r) => r.describe) : undefined;
      const made = await repeat(JSON.parse(readFileSync(join(dir, name, "analysis.json"), "utf8")), { runs, describes });
      usd += made.reduce((sum, r) => sum + (r.describeUsage ? responsesCost(PRICES, DESCRIBE_MODEL, r.describeUsage) : 0) + decisionsCost(PRICES, DECISIONS_MODEL, r.decisions.usage), 0);
      writeFileSync(file, JSON.stringify({ model: DECISIONS_MODEL, runs: made }));
      console.log(`${name}: ${runs} runs, $${usd.toFixed(4)} so far`);
    } catch (e) {
      console.log(`${name}: ${String(e?.message ?? e).split("\n")[0]}`);
    }
  }
}
