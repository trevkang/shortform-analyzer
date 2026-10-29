// eval/score.mjs: accuracy per field, against reference labels, on a hand-made analysis.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tmp } from "./helpers.js";

describe("eval/score.mjs", () => {
  it("scores each field, keeps the labels marked unsure apart, and lists the misses", () => {
    const root = tmp();
    mkdirSync(join(root, "labels"));
    mkdirSync(join(root, "out", "1.analysis"), { recursive: true });
    writeFileSync(join(root, "labels", "1.json"), JSON.stringify({
      topic: "tech", format: "tutorial", sells: "software", product: "Notewise", asksForComment: true,
      scenes: [{ role: "hook", footage: "camera_face", showsProduct: false }, { role: "cta", footage: "screen", showsProduct: true }],
      comments: ["intent", "positive"],
      unsure: { format: "review was close", "scenes[1].footage": "graphics was close" },
    }));
    writeFileSync(join(root, "out", "1.analysis", "analysis.json"), JSON.stringify({
      topic: "tech", format: "review", sells: "software", product: "Notewise app", asksForComment: true,
      scenes: [{ role: "hook", footage: "camera_face", showsProduct: false }, { role: "body", footage: "graphics", showsProduct: true }],
      comments: [{ kind: "intent" }, { kind: "other" }],
    }));
    const out = JSON.parse(execFileSync(process.execPath, ["eval/score.mjs", join(root, "labels"), join(root, "out"), "--json"], { encoding: "utf8" }));
    const by = Object.fromEntries(out.fields.map((f: { field: string }) => [f.field, f]));
    expect(out.videos).toBe(1);
    expect(by.topic).toMatchObject({ n: 1, accuracy: 1 });
    expect(by.format).toMatchObject({ n: 1, accuracy: 0, nSure: 0, accuracySure: null });
    expect(by.product).toMatchObject({ n: 1, accuracy: 1 });
    expect(by.role).toMatchObject({ n: 2, accuracy: 0.5 });
    expect(by.footage).toMatchObject({ n: 2, accuracy: 0.5, nSure: 1, accuracySure: 1 });
    expect(by["comment kind"]).toMatchObject({ n: 2, accuracy: 0.5 });
    expect(out.misses).toContainEqual({ id: "1 scene 2", field: "role", want: "cta", got: "body" });
  });
});
