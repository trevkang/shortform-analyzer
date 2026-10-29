// schema/analysis.schema.json: every kind of analysis validates against it, and its value lists are TAXONOMY's.
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeVideo, STAGES } from "../src/index.js";
import { TAXONOMY } from "../src/primitives.js";
import { fake, hasFfmpeg, KEYS, makeCuts, makeLongTake, makePhoto, POST_ID, TIKTOK_URL, tiktokPost } from "./helpers.js";

const schema = JSON.parse(readFileSync("schema/analysis.schema.json", "utf8"));
const validate = new Ajv({ allErrors: true }).compile(schema);

describe("schema", () => {
  it("lists TAXONOMY's values and the stages", () => {
    const p = schema.properties;
    expect(p.topic.enum).toEqual([...TAXONOMY.topic.values]);
    expect(p.format.enum).toEqual([...TAXONOMY.format.values]);
    expect(p.sells.enum).toEqual([...TAXONOMY.sells.values]);
    expect(schema.definitions.scene.properties.role.enum).toEqual([...TAXONOMY.role.values]);
    expect(schema.definitions.scene.properties.footage.enum).toEqual([...TAXONOMY.footage.values]);
    expect(schema.definitions.scene.properties.subject.enum).toEqual([...TAXONOMY.subject.values]);
    for (const f of ["splitScreen", "overlay", "textBar", "captions", "message"]) {
      expect(schema.definitions.scene.properties[f], f).toEqual({ type: "boolean" });
      expect(schema.definitions.scene.required, f).toContain(f);
    }
    expect(schema.definitions.scene.required).not.toContain("subject"); // left out when it wasn't answered
    expect(schema.definitions.comment.properties.kind.enum).toEqual([...TAXONOMY.commentKind.values]);
    expect(Object.keys(p.stages.properties)).toEqual([...STAGES]);
  });

  it("rejects an analysis that breaks the contract", () => {
    expect(validate({ schemaVersion: 2, ok: true })).toBe(false);
  });
});

describe.skipIf(!hasFfmpeg)("schema on real analyses", () => {
  let cuts: string;
  beforeAll(() => { cuts = makeCuts(true); });

  const check = (a: unknown) => {
    if (!(a as { ok: boolean }).ok) throw new Error((a as { error: string }).error);
    const valid = validate(JSON.parse(JSON.stringify(a))); // as a consumer reads analysis.json
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  };

  it("a file with questions", async () => {
    check(await analyzeVideo(cuts, { ...KEYS, fetch: fake().fetchFn, questions: [{ name: "face", question: "A face?" }, { name: "shot", question: "Shot?", scope: "scene", choices: ["a", "b"] }] }));
  });
  it("a long take, transcribed", async () => {
    check(await analyzeVideo(makeLongTake(), { ...KEYS, fetch: fake().fetchFn, transcribe: true }));
  });
  it("a TikTok post with comments", async () => {
    const items = [{ platform: "tiktok", id: "1", postId: POST_ID, text: "link?", author: { platform: "tiktok", id: "u1" }, metrics: { likes: 2 }, replies: [] }];
    check(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: fake({ video: cuts, sells: "software", product: "Notewise", comments: items }).fetchFn }));
  });
  it("a photo post", async () => {
    const urls = ["https://p.tiktok.test/1.png", "https://p.tiktok.test/2.png"];
    const photos = Object.fromEntries(urls.map((u) => [u, makePhoto("purple")]));
    check(await analyzeVideo(TIKTOK_URL, { ...KEYS, fetch: fake({ posts: [tiktokPost({ photos: urls })], photos }).fetchFn }));
  });
});
