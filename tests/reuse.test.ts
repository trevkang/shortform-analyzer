// Examples 19, 20 and 21: reuse, what a failure keeps, and your own questions.
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeVideo, openaiDescriber, type Analysis, type Failed } from "../src/index.js";
import { fake, hasFfmpeg, KEYS, makeCuts, makeLongTake, readText } from "./helpers.js";

function ok(a: Analysis | Failed): Analysis {
  if (!a.ok) throw new Error(a.error);
  return a;
}
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // as the CLI reads analysis.json back

describe.skipIf(!hasFfmpeg)("reuse and failure", () => {
  let cuts: string;
  beforeAll(() => { cuts = makeCuts(true); });

  it("Example 19: the same video again makes no request; a new question reruns decide; a new describer, describe and decide", async () => {
    const first = ok(await analyzeVideo(cuts, { ...KEYS, fetch: fake().fetchFn }));

    const f = fake();
    const again = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, reuse: json(first) }));
    expect(f.calls).toEqual([]);
    expect(again.costUsd).toBe(0);
    expect(Object.values(again.stages).every((s) => s!.reused)).toBe(true);
    const strip = (a: Analysis) => ({ ...a, stages: undefined, costUsd: undefined });
    expect(strip(again)).toEqual(strip(first));

    const g = fake();
    const asked = ok(await analyzeVideo(cuts, { ...KEYS, fetch: g.fetchFn, reuse: json(first), questions: [{ name: "red", question: "Is the first shot red?" }] }));
    expect(g.kinds()).toEqual(["decide"]);
    expect(asked.costUsd).toBe(asked.stages.decide!.costUsd);
    expect(asked.stages.decide?.version).toMatch(/^1:gpt-6-luna:[0-9a-f]{8}$/);
    expect(asked.answers).toEqual({ red: true });

    const h = fake();
    const other = openaiDescriber({ model: "gpt-6-luna-mini", openaiApiKey: "k", fetch: h.fetchFn });
    const swapped = ok(await analyzeVideo(cuts, { ...KEYS, fetch: h.fetchFn, reuse: json(first), describer: other }));
    expect(h.kinds()).toEqual(["describe", "decide"]);
    expect(swapped.stages.describe).toMatchObject({ version: "2:gpt-6-luna-mini", costUsd: 0 }); // not in the price table
    expect(swapped.stages.scenes?.reused).toBe(true);
  });

  it("a 0.4.0 result, described with the old prompt, is described and decided again", async () => {
    const old = json(ok(await analyzeVideo(cuts, { ...KEYS, fetch: fake().fetchFn })));
    old.stages.describe!.version = "1:gpt-6-luna";
    const f = fake();
    const again = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, reuse: old }));
    expect(f.kinds()).toEqual(["describe", "decide"]);
    expect(again.stages.describe?.version).toBe("2:gpt-6-luna");
    expect(again.stages.frames?.reused).toBe(true);
  });

  it("Example 19: the rules run again on reused answers", async () => {
    const first = ok(await analyzeVideo(cuts, { ...KEYS, fetch: fake({ sells: "software", product: "Notewise" }).fetchFn }));
    const edited = json(first);
    edited.raw.decide!.video.sells = { choice: "none", probs: { none: 0.9 } };
    const again = ok(await analyzeVideo(cuts, { ...KEYS, fetch: fake().fetchFn, reuse: edited }));
    expect(again.sells).toBe("none");
    expect(again.product).toBe("");
    expect(again.scenes[0].showsProduct).toBeUndefined();
  });

  it("Example 19: an earlier result for another video is ignored", async () => {
    const first = ok(await analyzeVideo(cuts, { ...KEYS, fetch: fake().fetchFn }));
    const f = fake();
    const take = ok(await analyzeVideo(makeLongTake(), { ...KEYS, fetch: f.fetchFn, reuse: json(first) }));
    expect(f.kinds()).toEqual(["describe", "decide"]);
    expect(take.stages.scenes?.reused).toBeUndefined();
  });

  it("Example 20: a failure keeps what finished, and the retry starts there", async () => {
    const failed = await analyzeVideo(cuts, { ...KEYS, fetch: fake({ describeStatus: 400 }).fetchFn });
    expect(failed.ok).toBe(false);
    const { error, partial } = failed as Failed;
    expect(error).toMatch(/^describe: responses 400/);
    expect(Object.keys(partial!.stages!)).toEqual(["source", "scenes", "frames", "speech"]);
    expect(partial!.scenes).toHaveLength(3);
    expect(partial!.scenes![0].frame).toMatch(/^data:image\/jpeg/);

    const f = fake();
    const retry = ok(await analyzeVideo(cuts, { ...KEYS, fetch: f.fetchFn, reuse: json(partial!) }));
    expect(f.kinds()).toEqual(["describe", "decide"]);
    expect(retry.stages.frames?.reused).toBe(true);
    expect(retry.costUsd).toBe(retry.stages.describe!.costUsd + retry.stages.decide!.costUsd);
  });

  it("Example 21: your questions ride in the record's decide request", async () => {
    const f = fake();
    const a = ok(await analyzeVideo(cuts, {
      ...KEYS, fetch: f.fetchFn,
      questions: [
        { name: "face", question: "Is a person's face on camera at any point?" },
        { name: "shot", question: "How is this scene shot?", scope: "scene", choices: ["close", "wide"] },
      ],
    }));
    expect(f.kinds()).toEqual(["describe", "decide"]);
    const qs = f.calls[1].body.questions;
    const names = qs.map((q: any) => q.name);
    expect(names).toEqual(expect.arrayContaining(["q_face", "q_shot_0", "q_shot_1", "q_shot_2", "topic", "role_1", "footage_0"]));
    expect(qs.find((q: any) => q.name === "q_shot_1").instructions).toBe("About scene 2: How is this scene shot?");
    expect(a.answers).toEqual({ face: true });
    expect(a.scenes.map((s) => s.answers)).toEqual([{ shot: "close" }, { shot: "close" }, { shot: "close" }]);
    expect(readText(f.calls[1].body)).toMatch(/What a first pass wrote about the video/);
  });
});
