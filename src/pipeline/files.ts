import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { tiktokPostId, type Analysis, type Failed, type FfmpegOptions, type Input, type Options } from "../primitives.js";
import { analyzeVideo } from "./analyze.js";
import { reportHtml } from "./report.js";

const exec = promisify(execFile);
export const SHEET_COLUMNS = 4;
const SHEET_TILE = 256; // px, width of one frame in sheet.jpg

const two = (i: number) => String(i + 1).padStart(2, "0");
const jpeg = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

/** Where `analyze` writes by default: next to a file, or `<post id>.analysis/` in the current folder for a TikTok URL. */
export function defaultOut(input: string): string {
  const id = tiktokPostId(input);
  return resolve(id ? `${id}.analysis` : `${input}.analysis`);
}

/** The analysis without `frame` and `raw`: what a terminal or a model reads (base64 only fills its context). */
export function lean(a: Analysis) {
  const { raw: _raw, ...rest } = a;
  return { ...rest, scenes: a.scenes.map(({ frame: _frame, ...s }) => s) };
}

/** An earlier analysis.json in `dir`, to pass as `reuse`; undefined when there is none or it can't be read. */
export async function readEarlier(dir: string): Promise<Analysis | undefined> {
  try {
    const a = JSON.parse(await readFile(join(dir, "analysis.json"), "utf8"));
    return a?.schemaVersion === 2 && a.ok === true ? a : undefined;
  } catch {
    return undefined;
  }
}

/** Writes analysis.json, report.html, frames/01.jpg… and sheet.jpg (every frame tiled 4 wide) into `dir`. */
export async function writeOutput(dir: string, analysis: Analysis, options: FfmpegOptions & { title?: string } = {}) {
  const framesDir = join(dir, "frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  await writeFile(join(dir, "analysis.json"), JSON.stringify(analysis, null, 2) + "\n");
  await writeFile(join(dir, "report.html"), reportHtml(analysis, options.title));
  await Promise.all(analysis.scenes.map((s, i) => writeFile(join(framesDir, `${two(i)}.jpg`), jpeg(s.frame))));
  const n = analysis.scenes.length;
  const rows = Math.max(1, Math.ceil(n / SHEET_COLUMNS));
  const cols = Math.min(SHEET_COLUMNS, Math.max(1, n));
  // Every frame scaled to one size and padded, so frames of any shape tile; tile flushes a last, partly empty row.
  await exec(options.ffmpegPath ?? "ffmpeg", [
    "-v", "error", "-y", "-start_number", "1", "-i", join(framesDir, "%02d.jpg"),
    "-vf", `scale=${SHEET_TILE}:${SHEET_TILE}:force_original_aspect_ratio=decrease,pad=${SHEET_TILE}:${SHEET_TILE}:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}`,
    "-frames:v", "1", "-q:v", "3", join(dir, "sheet.jpg"),
  ]);
  return { dir, files: ["analysis.json", "report.html", ...analysis.scenes.map((_, i) => `frames/${two(i)}.jpg`), "sheet.jpg"] };
}

/** Analyses into a folder: reuses its analysis.json when it holds the same video, then writes the output. */
export async function analyzeToFolder(input: Input, dir: string, options: Options & { title?: string } = {}): Promise<{ analysis: Analysis; dir: string } | Failed> {
  const reuse = options.reuse ?? (await readEarlier(dir));
  const a = await analyzeVideo(input, { ...options, ...(reuse ? { reuse } : {}) });
  if (!a.ok) return a;
  try {
    await writeOutput(dir, a, options);
  } catch (e) {
    return { ok: false, error: `writing ${dir}: ${(e as Error).message.split("\n")[0]}` };
  }
  return { analysis: a, dir };
}
