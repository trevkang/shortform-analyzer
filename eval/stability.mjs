// How steady each field is over the runs eval/repeat.mjs made of the same video: per field, how often every run agrees,
// how often two runs agree, the values that trade places, and how often the two most probable values were within 0.2
// of each other (a near tie, which a small change in the evidence turns over); with labels (the format in
// eval/README.md), each run's accuracy and the majority's. A field that keeps changing, or keeps nearly tying between
// the same two values, has values that overlap.
// Usage: node eval/stability.mjs <analyses dir> [labels dir] [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CANDIDATE_FIELDS } from "./candidates.mjs";

const [analysesDir, labelsDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!analysesDir) {
  console.error("Usage: node eval/stability.mjs <analyses dir> [labels dir] [--json]");
  process.exit(2);
}

const VIDEO = ["topic", "format", "sells", "asksForComment"];
const SCENE = ["role", "footage", "showsProduct", ...Object.keys(CANDIDATE_FIELDS)];
const ASKED = { asksForComment: "asks_for_comment", showsProduct: "shows_product", ...CANDIDATE_FIELDS }; // the decide question, where its name differs
const CLOSE = 0.2;
const items = Object.fromEntries([...VIDEO, ...SCENE].map((f) => [f, []])); // field → [{ id, values and answers (one per run), want, sure }]
let videos = 0;
let runs = Infinity;

for (const dir of readdirSync(analysesDir).filter((d) => d.endsWith(".analysis")).sort()) {
  const file = join(analysesDir, dir, "repeats.json");
  if (!existsSync(file)) continue;
  const rs = JSON.parse(readFileSync(file, "utf8")).runs;
  const id = dir.slice(0, -".analysis".length);
  const labels = labelsDir ? join(labelsDir, `${id}.json`) : "";
  const want = labels && existsSync(labels) ? JSON.parse(readFileSync(labels, "utf8")) : undefined;
  const unsure = Object.keys(want?.unsure ?? {});
  const sure = (key) => !unsure.some((u) => u === key || u.startsWith(`${key}.`) || u.startsWith(`${key}[`));
  videos++;
  runs = Math.min(runs, rs.length);
  for (const f of VIDEO) items[f].push({ id, values: rs.map((r) => r[f]), answers: rs.map((r) => r.decisions?.video?.[ASKED[f] ?? f]), want: want?.[f], sure: sure(f) });
  const n = rs[0].scenes.length;
  const scenes = want?.scenes?.length === n ? want.scenes : []; // a label set for another scene split scores no scene
  for (let i = 0; i < n; i++) {
    for (const f of SCENE) {
      if (f === "role" && i === 0) continue; // asked from scene 2: scene 1 is the hook by rule
      const values = rs.map((r) => r.scenes[i][f]);
      if (values.includes(undefined)) continue; // showsProduct, when a run says the video sells nothing
      const answers = rs.map((r) => r.decisions?.scenes?.[i]?.[ASKED[f] ?? f]);
      items[f].push({ id: `${id} scene ${i + 1}`, values, answers, want: scenes[i]?.[f] ?? undefined, sure: sure(`scenes[${i}].${f}`) && !unsure.includes(`scenes[${i}]`) });
    }
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** The value most runs gave, the earliest run's on a tie, and the votes. */
function majority(values) {
  const votes = new Map();
  for (const v of values) votes.set(v, (votes.get(v) ?? 0) + 1);
  let got;
  for (const [v, k] of votes) if (got === undefined || k > votes.get(got)) got = v;
  return { got, votes: Object.fromEntries(votes) };
}

/** How far the most probable value is ahead of the next, and the two; a yes/no answer's yes against its no. */
function lead(answer) {
  if (typeof answer?.probability === "number") return { by: Math.abs(2 * answer.probability - 1), pair: ["false", "true"] };
  const ranked = Object.entries(answer?.probs ?? {}).sort((x, y) => y[1] - x[1]);
  return ranked.length < 2 ? undefined : { by: ranked[0][1] - ranked[1][1], pair: [ranked[0][0], ranked[1][0]].sort() };
}
const top = (counts) => [...counts].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([key, n]) => ({ a: key.split("\n")[0], b: key.split("\n")[1], n }));

const misses = [];
const fields = Object.entries(items).map(([field, list]) => {
  const n = list.length;
  const k = Math.min(...list.map((x) => x.values.length));
  let agree = 0;
  let pairs = 0;
  const swaps = new Map();
  for (const x of list) {
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        pairs++;
        if (x.values[a] === x.values[b]) agree++;
        else {
          const key = [String(x.values[a]), String(x.values[b])].sort().join("\n");
          swaps.set(key, (swaps.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const leads = list.flatMap((x) => x.answers.map(lead).filter(Boolean));
  const ties = new Map();
  for (const l of leads.filter((l) => l.by < CLOSE)) ties.set(l.pair.join("\n"), (ties.get(l.pair.join("\n")) ?? 0) + 1);
  const labelled = list.filter((x) => x.want !== undefined);
  const sure = labelled.filter((x) => x.sure);
  const right = (xs) => xs.filter((x) => majority(x.values).got === x.want).length;
  for (const x of labelled) {
    const m = majority(x.values);
    if (m.got !== x.want) misses.push({ id: x.id, field, want: x.want, got: m.got, votes: m.votes });
  }
  const perRun = labelled.length ? Array.from({ length: k }, (_, r) => labelled.filter((x) => x.values[r] === x.want).length / labelled.length) : [];
  return {
    field, n,
    allAgree: n ? list.filter((x) => x.values.every((v) => v === x.values[0])).length / n : null,
    pairwise: pairs ? agree / pairs : null,
    swaps: top(swaps),
    close: leads.length ? leads.filter((l) => l.by < CLOSE).length / leads.length : null,
    closePairs: top(ties),
    accuracy: perRun.length ? { mean: mean(perRun), min: Math.min(...perRun), max: Math.max(...perRun) } : null,
    majority: labelled.length ? right(labelled) / labelled.length : null,
    nSure: sure.length,
    majoritySure: sure.length ? right(sure) / sure.length : null,
  };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ videos, runs: videos ? runs : 0, fields, misses }, null, 2));
} else {
  const pct = (x) => (x === null ? "-" : `${(x * 100).toFixed(0)}%`);
  console.log(`${videos} videos, ${videos ? runs : 0} runs each\n`);
  console.log("field            n  all agree  two agree  near ties  accuracy: runs (min-max)  majority  (sure: n, majority)  values that trade places | nearly tie");
  for (const f of fields) {
    const acc = f.accuracy ? `${pct(f.accuracy.mean)} (${pct(f.accuracy.min)}-${pct(f.accuracy.max)})` : "-";
    const pairs = (xs) => xs.map((s) => `${s.a}↔${s.b} ${s.n}`).join(", ");
    console.log(`${f.field.padEnd(14)} ${String(f.n).padStart(3)}  ${pct(f.allAgree).padStart(9)}  ${pct(f.pairwise).padStart(9)}  ${pct(f.close).padStart(9)}  ` +
      `${acc.padStart(24)}  ${pct(f.majority).padStart(8)}  ${`(${f.nSure}, ${pct(f.majoritySure)})`.padStart(19)}  ` +
      `${pairs(f.swaps)} | ${pairs(f.closePairs)}`);
  }
  if (misses.length) {
    console.log("\nMisses of the majority (reference → majority, votes):");
    for (const m of misses) console.log(`  ${m.id}  ${m.field}: ${m.want} → ${m.got}  ${JSON.stringify(m.votes)}`);
  }
}
