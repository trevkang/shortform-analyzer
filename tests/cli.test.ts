// The built CLI (dist/cli.js) on generated videos, with a fake OpenAI served on localhost through OPENAI_BASE_URL.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fake, hasFfmpeg, makeCuts, tmp } from "./helpers.js";

const exec = promisify(execFile);
const CLI = join(process.cwd(), "dist/cli.js");

type Result = { code: number; stdout: string; stderr: string };
let base = "";
let server: Server;
const seen: string[] = [];

async function cli(args: string[], env: Record<string, string | undefined> = {}): Promise<Result> {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI, ...args], { env: { ...process.env, OPENAI_API_KEY: "k", OPENAI_BASE_URL: base, ...env } as NodeJS.ProcessEnv });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

beforeAll(async () => {
  const { fetchFn } = fake();
  // The fake OpenAI behind a real HTTP server: the CLI runs in its own process.
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    seen.push(String(req.url));
    const json = req.url === "/responses" || req.url === "/decisions";
    const r = await fetchFn(`https://api.openai.com/v1${req.url}`, { method: req.method, body: json ? body.toString() : body });
    res.writeHead(r.status, { "content-type": "application/json" }).end(await r.text());
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("cli", () => {
  it("prints usage and exits 2 on a usage error", async () => {
    expect((await cli([])).code).toBe(2);
    expect((await cli(["analyze"])).code).toBe(2);
    expect((await cli(["dance", "x.mp4"])).code).toBe(2);
    expect((await cli(["screen", "x.mp4"])).code).toBe(2);
    expect((await cli(["analyze", "x.mp4", "--question", "noequals"])).code).toBe(2);
    const help = await cli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toMatch(/shortform-analyzer analyze <file \| TikTok URL>/);
    expect((await cli(["--version"])).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits 1 with the error on stderr when the analysis fails", async () => {
    const r = await cli(["analyze", "/nope.mp4"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^video:/);
    expect((await cli(["analyze", "/nope.mp4"], { OPENAI_API_KEY: "" })).stderr).toMatch(/OPENAI_API_KEY/);
    expect((await cli(["analyze", "https://example.com/v.mp4"])).stderr).toMatch(/^input: only TikTok post URLs/);
  });

  it.skipIf(!hasFfmpeg)("writes analysis.json, report.html, frames and sheet.jpg, prints the summary, and reuses the folder", async () => {
    const video = makeCuts(true);
    seen.length = 0;
    const r = await cli(["analyze", video, "--question", 'red="Is the first shot red?"']);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^listicle about education, sells nothing\. 4\.5 s, 3 scenes, words: not known\./);
    expect(r.stdout).toMatch(/\n {2}hook 0\.0-1\.5 s, 1 scene \(screen\)/);
    expect(r.stdout).toMatch(/Answers: red yes\./);
    expect(seen).toEqual(["/responses", "/decisions"]);
    const dir = `${video}.analysis`;
    for (const f of ["analysis.json", "report.html", "frames/01.jpg", "frames/02.jpg", "frames/03.jpg", "sheet.jpg"]) expect(existsSync(join(dir, f)), f).toBe(true);
    const a = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8"));
    expect(a.answers).toEqual({ red: true });
    expect(a.scenes[0].frame).toMatch(/^data:image\/jpeg;base64,/);
    expect(readFileSync(join(dir, "sheet.jpg")).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(readFileSync(join(dir, "report.html"), "utf8")).toMatch(/<img src="data:image\/jpeg;base64,/);

    seen.length = 0;
    const again = await cli(["analyze", video, "--question", 'red="Is the first shot red?"']);
    expect(again.code).toBe(0);
    expect(seen).toEqual([]);
    expect(again.stdout).toMatch(/Cost: \$0\.00000 \(reused: source, scenes, frames, speech, describe, decide\)/);
  });

  it.skipIf(!hasFfmpeg)("prints the analysis without frames and raw with --json, writes to --out, and transcribes with --transcribe", async () => {
    const out = join(tmp(), "here");
    seen.length = 0;
    const r = await cli(["analyze", makeCuts(true), "--out", out, "--json", "--transcribe"]);
    expect(r.code).toBe(0);
    const a = JSON.parse(r.stdout);
    expect(a).toMatchObject({ schemaVersion: 2, ok: true, speech: "transcription" });
    expect(a.raw).toBeUndefined();
    expect(a.scenes[0].frame).toBeUndefined();
    expect(seen).toEqual(["/audio/transcriptions", "/responses", "/decisions"]);
    expect(existsSync(join(out, "sheet.jpg"))).toBe(true);
  });
});
