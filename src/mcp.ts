// shortform-analyzer mcp: analyze_video over stdio.
import { basename, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { analyzeToFolder, defaultOut, lean } from "./pipeline/files.js";
import { summarize } from "./pipeline/summary.js";
import type { Options } from "./types.js";

const question = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/).describe("A short id, e.g. face_on_camera"),
  question: z.string().describe("What to ask about what is in the video; for scope scene, about one scene"),
  scope: z.enum(["video", "scene"]).optional().describe("video (the default), or scene: asked once per scene"),
  choices: z.array(z.string()).min(2).max(20).optional().describe("2 to 20 values to choose from; without it the question is yes/no"),
});

const error = (text: string): CallToolResult => ({ content: [{ type: "text", text }], isError: true });

/** The MCP server. `options` go to every analysis (tests pass a fake fetch and keys); `outDir` is where folders go. */
export function createServer(options: Options & { outDir?: string; version?: string } = {}): McpServer {
  const server = new McpServer({ name: "shortform-analyzer", version: options.version ?? "0.0.0" });

  server.registerTool("analyze_video", {
    title: "Analyze a short-form video",
    description: "The record of one short-form video (a local file path or a TikTok post URL): its format, topic, whether it sells and what, " +
      "tags, a description of what it's about and how it's made, and scene by scene its role (hook, body, payoff, cta), footage, " +
      "what fills the frame, its layout (split screen, overlay, text bar), whether it has captions or a message, " +
      "words said and text on screen; for a TikTok post that sells or asks for a comment, its top comments with a kind each. " +
      "Writes analysis.json, report.html, frames/ and sheet.jpg (all frames on one image) to a folder and returns its path.",
    inputSchema: {
      input: z.string().describe("A local video file path, or a TikTok post URL (https://www.tiktok.com/@handle/video/<id>)"),
      questions: z.array(question).max(20).optional().describe("Up to 20 questions of your own, at most 6 with scope scene"),
      transcribe: z.boolean().optional().describe("Transcribe the audio when the post has no TikTok subtitles (off by default; costs a transcription)"),
    },
  }, async ({ input, questions, transcribe }) => {
    const dir = options.outDir ? join(options.outDir, basename(defaultOut(input))) : defaultOut(input);
    const r = await analyzeToFolder(input, dir, { ...options, questions, ...(transcribe ? { transcribe: true } : {}) });
    if ("ok" in r) return error(r.error);
    return { content: [{ type: "text", text: `${summarize(r.analysis)}\n\nFolder: ${r.dir} (open sheet.jpg to see every frame)\n\n${JSON.stringify(lean(r.analysis))}` }] };
  });

  return server;
}

export async function runStdio(): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { VERSION } = await import("./version.js");
  await createServer({ version: VERSION }).connect(new StdioServerTransport());
  if (!process.env.OPENAI_API_KEY) console.error("shortform-analyzer mcp: OPENAI_API_KEY is not set; every call will fail until it is.");
}
