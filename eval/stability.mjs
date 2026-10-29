// How steady each field is over the runs eval/repeat.mjs made of the same decide request: per field, how often every run
// agrees, how often two runs agree, and the values that trade places; with labels (the format in eval/README.md), each
// run's accuracy and the majority's. A field whose answer keeps changing on the same evidence has values that overlap.
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
const SCENE = ["role", "footage", "showsProduct", ...CANDIDATE_FIELDS];
const items = Object.fromEntries([...VIDEO, ...SCENE].map((f) => [f, []])); // field → [{ id, values (one per run), want, sure }]
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
  for (const f of VIDEO) items[f].push({ id, values: rs.map((r) => r[f]), want: want?.[f], sure: sure(f) });
  const n = rs[0].scenes.length;
  const scenes = want?.scenes?.length === n ? want.scenes : []; // a label set for another scene split scores no scene
  for (let i = 0; i < n; i++) {
    for (const f of SCENE) {
      if (f === "role" && i === 0) continue; // asked from scene 2: scene 1 is the hook by rule
      const values = rs.map((r) => r.scenes[i][f]);
      if (values.includes(undefined)) continue; // showsProduct, when a run says the video sells nothing
      items[f].push({ id: `${id} scene ${i + 1}`, values, want: scenes[i]?.[f] ?? undefined, sure: sure(`scenes[${i}].${f}`) && sure(`scenes[${i}]`) });
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
    swaps: [...swaps].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([key, count]) => ({ a: key.split("\n")[0], b: key.split("\n")[1], n: count })),
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
  console.log("field            n  all agree  two agree  accuracy: runs (min-max)  majority  (sure: n, majority)  values that trade places");
  for (const f of fields) {
    const acc = f.accuracy ? `${pct(f.accuracy.mean)} (${pct(f.accuracy.min)}-${pct(f.accuracy.max)})` : "-";
    console.log(`${f.field.padEnd(14)} ${String(f.n).padStart(3)}  ${pct(f.allAgree).padStart(9)}  ${pct(f.pairwise).padStart(9)}  ` +
      `${acc.padStart(24)}  ${pct(f.majority).padStart(8)}  ${`(${f.nSure}, ${pct(f.majoritySure)})`.padStart(19)}  ` +
      f.swaps.map((s) => `${s.a}↔${s.b} ${s.n}`).join(", "));
  }
  if (misses.length) {
    console.log("\nMisses of the majority (reference → majority, votes):");
    for (const m of misses) console.log(`  ${m.id}  ${m.field}: ${m.want} → ${m.got}  ${JSON.stringify(m.votes)}`);
  }
}
