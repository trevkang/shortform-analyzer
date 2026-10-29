// The MCP server through a real MCP client over an in-memory transport, with OpenAI and apinoa faked at fetch.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/mcp.js";
import { fake, hasFfmpeg, KEYS, makeCuts, POST_ID, TIKTOK_URL, tmp } from "./helpers.js";

async function connect(options: Parameters<typeof createServer>[0]) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);

describe("mcp", () => {
  it("lists analyze_video with input, questions and transcribe", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["analyze_video"]);
    expect(Object.keys(tools[0].inputSchema.properties!)).toEqual(["input", "questions", "transcribe"]);
  });

  it("returns a tool error, not a crash, on a bad input", async () => {
    const client = await connect(KEYS);
    const r = await client.callTool({ name: "analyze_video", arguments: { input: "https://example.com/v.mp4" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^input: only TikTok post URLs are read/);
  });

  it.skipIf(!hasFfmpeg)("analyze_video returns the summary, the folder and the analysis without frames or raw", async () => {
    const outDir = tmp();
    const f = fake({ video: makeCuts(true) });
    const client = await connect({ ...KEYS, fetch: f.fetchFn, outDir });
    const r = await client.callTool({
      name: "analyze_video",
      arguments: { input: TIKTOK_URL, questions: [{ name: "red", question: "Is it red?" }, { name: "shot", question: "Shot?", scope: "scene", choices: ["close", "wide"] }] },
    });
    expect(r.isError).toBeFalsy();
    const t = text(r);
    expect(t).toMatch(/^listicle about education/);
    const folder = t.match(/Folder: (\S+)/)![1];
    expect(folder).toBe(join(outDir, `${POST_ID}.analysis`));
    expect(existsSync(join(folder, "sheet.jpg"))).toBe(true);
    const json = JSON.parse(t.slice(t.lastIndexOf("\n\n") + 2));
    expect(json.scenes).toHaveLength(3);
    expect(json.scenes[0].frame).toBeUndefined();
    expect(json.raw).toBeUndefined();
    expect(t).not.toContain("base64");
    expect(json.answers).toEqual({ red: true });
    expect(json.scenes[1].answers).toEqual({ shot: "close" });
  });
});
