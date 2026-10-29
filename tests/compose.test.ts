// Example 17: the parts rebuild the whole, and Layer 3 reaches the parts only through primitives.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeVideo, openaiDecider, openaiDescriber, type Analysis } from "../src/index.js";
import * as P from "../src/primitives.js";
import { fake, hasFfmpeg, KEYS, makeCuts, makeLongTake } from "./helpers.js";

const dataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;

/** A video file's record, written in the test from the primitives exports and the default engines alone. */
async function rebuilt(video: string, options: P.Options): Promise<Omit<Analysis, "stages" | "costUsd">> {
  const describer = openaiDescriber(options);
  const decider = openaiDecider(options);
  const { duration } = await P.probe(video);
  const spans = await P.detectScenes(video, { duration });
  const frames = await P.extractFrames(video, spans);
  const spoken = spans.map(() => "");
  const facts: P.RecordFacts = { media: "video", duration, scenes: spans.length, speech: "none" };
  const evidence = (d?: P.Described) => P.sceneEvidence(spans, frames, spoken, { duration, intro: P.recordIntro(facts, d), words: "none" });
  const out = await describer.describe(evidence(), P.describeRequest(spans.length));
  const described = P.parseDescribed(out.output, spans.length);
  const decisions = await decider.decide(evidence(described), P.recordQuestions());
  const r = P.parseRecord(decisions, { spans, product: described.product });
  return {
    schemaVersion: 2, ok: true, media: "video", duration, speech: "none",
    topic: r.topic, format: r.format, sells: r.sells, asksForComment: r.asksForComment, product: r.product,
    tags: described.tags, description: described.description, formatDescription: described.formatDescription,
    scenes: spans.map((s, i) => ({
      index: i, start: s.start, end: s.end, cut: s.cut !== false, role: r.scenes[i].role, footage: r.scenes[i].footage,
      ...(r.scenes[i].showsProduct !== undefined ? { showsProduct: r.scenes[i].showsProduct } : {}),
      spoken: spoken[i], onScreenText: described.onScreenText[i], frame: dataUrl(frames[i]),
    })),
    raw: { describe: out.output, decide: decisions },
  };
}

describe.skipIf(!hasFfmpeg)("composition (Example 17)", () => {
  const videos: Record<string, string> = {};
  beforeAll(() => { videos.cuts = makeCuts(true); videos.take = makeLongTake(); });

  for (const name of ["cuts", "take"]) {
    it(`a pipeline made from primitives equals analyzeVideo on ${name}`, async () => {
      const options = { ...KEYS, fetch: fake({ sells: "software", product: "Notewise", roles: ["hook", "hook", "cta"] }).fetchFn };
      const whole = await analyzeVideo(videos[name], options);
      if (!whole.ok) throw new Error(whole.error);
      const { stages: _s, costUsd: _c, ...record } = whole;
      expect(await rebuilt(videos[name], options)).toEqual(record);
    });
  }
});

describe("layer rules", () => {
  const files = (dir: string) => readdirSync(join("src", dir)).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(join("src", dir, f), "utf8")] as const);

  it("pipeline/ imports blocks/ and record/ only through primitives.ts", () => {
    for (const [f, src] of files("pipeline")) expect(src, f).not.toMatch(/from "\.\.\/(blocks|record)\//);
  });

  it("record/ (Layer 2) runs no programs, makes no requests and uses no block", () => {
    for (const [f, src] of files("record")) {
      expect(src, f).not.toMatch(/node:child_process|node:fs|fetch\(|from "\.\.\/blocks\//);
    }
  });

  it("only blocks/ runs ffmpeg or calls fetch, except pipeline/files.ts writing the sheet", () => {
    for (const [f, src] of files("pipeline")) {
      if (f === "files.ts") continue;
      expect(src, f).not.toMatch(/node:child_process|\bfetch\(/);
    }
  });

  it("the main entry does not load the MCP SDK", () => {
    for (const f of ["index.ts", "primitives.ts"]) expect(readFileSync(join("src", f), "utf8"), f).not.toMatch(/modelcontextprotocol/);
  });

  it("apinoa is reached only through @apinoa/sdk in blocks/apinoa.ts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.dependencies)).toContain("@apinoa/sdk");
    for (const dir of ["blocks", "record", "pipeline"]) {
      for (const [f, src] of files(dir)) {
        expect(src, f).not.toMatch(/gateway\.apinoa\.com/);
        if (!(dir === "blocks" && f === "apinoa.ts")) expect(src, f).not.toMatch(/^import (?!type)[^;]*from "@apinoa\/sdk"/m);
      }
    }
  });
});
