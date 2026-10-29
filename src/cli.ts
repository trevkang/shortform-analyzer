#!/usr/bin/env node
// npx shortform-analyzer analyze <file | TikTok URL> | mcp
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Question } from "./types.js";
import { VERSION } from "./version.js";

const USAGE = `Usage:
  shortform-analyzer analyze <file | TikTok URL> [--out <dir>] [--transcribe] [--flex] [--no-comments] [--question name="question"]... [--json]
  shortform-analyzer mcp

Keys: OPENAI_API_KEY, and APINOA_API_KEY for a TikTok URL.
Docs: https://github.com/trevkang/shortform-analyzer`;

class Usage extends Error {}

export function parseQuestion(arg: string): Question {
  const i = arg.indexOf("=");
  if (i <= 0) throw new Usage(`--question takes name="question", got: ${arg}`);
  return { name: arg.slice(0, i).trim(), question: arg.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2") };
}

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        out: { type: "string" }, question: { type: "string", multiple: true }, json: { type: "boolean" },
        transcribe: { type: "boolean" }, flex: { type: "boolean" }, "no-comments": { type: "boolean" },
        help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) { console.log(VERSION); return 0; }
  const [cmd, input, ...rest] = positionals;
  if (values.help || !cmd) { (values.help ? console.log : console.error)(USAGE); return values.help ? 0 : 2; }

  if (cmd === "mcp") {
    const { runStdio } = await import("./mcp.js");
    await runStdio();
    return -1; // keep running
  }
  if (cmd !== "analyze" || !input || rest.length) {
    console.error(USAGE);
    return 2;
  }
  let questions: Question[];
  try {
    questions = (values.question ?? []).map(parseQuestion);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const { analyzeToFolder, defaultOut, lean } = await import("./pipeline/files.js");
  const { summarize } = await import("./pipeline/summary.js");
  const dir = values.out ? resolve(values.out) : defaultOut(input);
  const r = await analyzeToFolder(input, dir, {
    questions, title: basename(input), ...(values.transcribe ? { transcribe: true } : {}), ...(values.flex ? { flex: true } : {}),
    ...(values["no-comments"] ? { comments: false } : {}),
  });
  if ("ok" in r) { console.error(r.error); return 1; }
  if (values.json) console.log(JSON.stringify(lean(r.analysis), null, 2));
  else console.log(`${summarize(r.analysis)}\n\nWrote ${dir}/ (analysis.json, report.html, frames/, sheet.jpg)`);
  return 0;
}

const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
