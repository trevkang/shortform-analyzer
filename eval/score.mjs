// Label accuracy per field: analyses (<id>.analysis/analysis.json, as the CLI writes them) against reference labels
// (<id>.json, the format in eval/README.md). Usage: node eval/score.mjs <labels dir> <analyses dir> [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [labelsDir, analysesDir, flag] = process.argv.slice(2);
if (!labelsDir || !analysesDir) {
  console.error("Usage: node eval/score.mjs <labels dir> <analyses dir> [--json]");
  process.exit(2);
}

const fields = {};       // field → { right, total, rightSure, totalSure }
const misses = [];       // { id, field, want, got }
const count = (field, want, got, sure, id) => {
  const f = (fields[field] ??= { right: 0, total: 0, rightSure: 0, totalSure: 0 });
  const right = want === got;
  f.total++; f.right += right;
  if (sure) { f.totalSure++; f.rightSure += right; }
  if (!right) misses.push({ id, field, want, got });
};

let videos = 0;
for (const file of readdirSync(labelsDir).filter((f) => f.endsWith(".json")).sort()) {
  const id = file.slice(0, -5);
  const path = join(analysesDir, `${id}.analysis`, "analysis.json");
  if (!existsSync(path)) continue;
  const want = JSON.parse(readFileSync(join(labelsDir, file), "utf8"));
  const got = JSON.parse(readFileSync(path, "utf8"));
  const unsure = Object.keys(want.unsure ?? {});
  const sure = (key) => !unsure.some((u) => u === key || u.startsWith(`${key}.`) || u.startsWith(`${key}[`));
  videos++;
  for (const f of ["topic", "format", "sells", "asksForComment"]) count(f, want[f], got[f], sure(f), id);
  // A product is right when both name one and either name holds the other.
  if (want.sells !== "none" && got.sells !== "none") {
    const a = want.product.toLowerCase(), b = got.product.toLowerCase();
    count("product", true, Boolean(a && b && (a.includes(b) || b.includes(a))), sure("product"), id);
  }
  if (want.scenes.length !== got.scenes.length) { console.error(`${id}: ${want.scenes.length} labelled scenes, ${got.scenes.length} in the analysis; scenes skipped`); continue; }
  want.scenes.forEach((s, i) => {
    const key = `scenes[${i}]`;
    count("role", s.role, got.scenes[i].role, sure(`${key}.role`) && sure(key), `${id} scene ${i + 1}`);
    count("footage", s.footage, got.scenes[i].footage, sure(`${key}.footage`) && sure(key), `${id} scene ${i + 1}`);
    if (want.sells !== "none" && got.sells !== "none") count("showsProduct", s.showsProduct, got.scenes[i].showsProduct, sure(`${key}.showsProduct`), `${id} scene ${i + 1}`);
  });
  // Comments by id: a later run can read them in another order, or read others.
  const read = new Map((got.comments ?? []).map((c) => [c.id, c.kind]));
  for (const [cid, kind] of Object.entries(want.comments ?? {})) {
    if (read.has(cid)) count("comment kind", kind, read.get(cid), sure(`comments.${cid}`), `${id} comment ${cid}`);
  }
}

const table = Object.entries(fields).map(([field, f]) => ({
  field, n: f.total, accuracy: f.right / f.total, nSure: f.totalSure, accuracySure: f.totalSure ? f.rightSure / f.totalSure : null,
}));
if (flag === "--json") {
  console.log(JSON.stringify({ videos, fields: table, misses }, null, 2));
} else {
  console.log(`${videos} videos\n\nfield           n  accuracy   (labels marked sure: n, accuracy)`);
  for (const t of table) {
    console.log(`${t.field.padEnd(14)} ${String(t.n).padStart(3)}  ${(t.accuracy * 100).toFixed(0).padStart(6)}%   ` +
      `(${t.nSure}, ${t.accuracySure === null ? "-" : `${(t.accuracySure * 100).toFixed(0)}%`})`);
  }
  console.log("\nMisses (reference → analysis):");
  for (const m of misses) console.log(`  ${m.id}  ${m.field}: ${m.want} → ${m.got}`);
}
