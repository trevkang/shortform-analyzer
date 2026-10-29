import assert from "node:assert/strict";
import { analyzeVideo, summarize } from "shortform-analyzer";
import { makeCuts } from "./lavfi.mjs";

// OpenAI faked at fetch: one describe reply, then a decide reply that answers each question with its first choice.
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (String(url).endsWith("/responses")) {
    const output = { product: "", tags: ["study"], description: "Three colours.", formatDescription: "Solid shots.", onScreenText: ["", "", ""] };
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] });
  }
  const answers = body.questions.map((q) =>
    q.type === "predicate" ? { type: "predicate", name: q.name, probability: 0.2 } : { type: "choice", name: q.name, choice: q.choices[0].value });
  return Response.json({ answers });
};
const a = await analyzeVideo(makeCuts(), { openaiApiKey: "k", fetch: fakeFetch });
assert.equal(a.ok, true, a.error);
assert.equal(a.schemaVersion, 2);
assert.equal(a.scenes.length, 3);
assert.equal(a.scenes[0].role, "hook");
assert.equal(a.topic, "beauty");
assert.match(summarize(a), /3 scenes/);
console.log("analyze.mjs: ok");
