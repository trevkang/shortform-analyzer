import type { FfmpegOptions, Span } from "../types.js";
import { probe } from "./probe.js";
import { ffmpeg, run, stage } from "./run.js";

export const SCENE_THRESHOLD = 0.3; // ffmpeg scene score that counts as a cut
export const MIN_SCENE = 0.4; // seconds: shorter scenes are transitions (PySceneDetect-style min shot length)
export const MAX_TAKE = 5; // seconds: a longer take is split, so a one-take video isn't one scene, all of it hook
export const MAX_SCENES = 40; // one Decisions request; past this, the shortest neighbours merge

export type SceneRules = { minScene?: number; maxTake?: number; maxScenes?: number };
export type SceneOptions = FfmpegOptions & SceneRules & {
  /** Seconds; probed when left out. */
  duration?: number;
  threshold?: number;
};

/** Cut times from ffmpeg's showinfo log (one line per frame the scene filter let through). */
export function parseCuts(log: string): number[] {
  return [...log.matchAll(/Parsed_showinfo.*?pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Cuts → scenes covering [0, duration]; scenes under minScene join the one before (the first, the one after). */
export function buildScenes(cuts: number[], duration: number, rules: SceneRules = {}): Span[] {
  const min = rules.minScene ?? MIN_SCENE;
  const bounds = [0, ...cuts.filter((t) => t > 0 && t < duration).sort((a, b) => a - b), duration];
  const spans: Span[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = { start: bounds[i], end: bounds[i + 1] };
    if (s.end - s.start < min && spans.length) spans[spans.length - 1].end = s.end;
    else spans.push(s);
  }
  if (spans.length > 1 && spans[0].end - spans[0].start < min) spans.splice(0, 2, { start: 0, end: spans[1].end });
  return capScenes(splitLong(spans, rules.maxTake), rules.maxScenes);
}

/** Takes longer than `max` s → equal parts of at most `max` s; the parts after the first are not cuts. */
export function splitLong(spans: Span[], max = MAX_TAKE): Span[] {
  return spans.flatMap((s) => {
    const n = Math.ceil((s.end - s.start) / max - 1e-9);
    if (n <= 1) return [s];
    const step = (s.end - s.start) / n;
    return Array.from({ length: n }, (_, i) => ({
      start: s.start + i * step, end: i === n - 1 ? s.end : s.start + (i + 1) * step, ...(i ? { cut: false as const } : {}),
    }));
  });
}

/** At most `max` scenes: the shortest scene merges into its shorter neighbour until it fits. */
export function capScenes(spans: Span[], max = MAX_SCENES): Span[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length > max) {
    let i = 0;
    out.forEach((s, j) => { if (s.end - s.start < out[i].end - out[i].start) i = j; });
    const len = (k: number) => (out[k] ? out[k].end - out[k].start : Infinity);
    const k = len(i - 1) <= len(i + 1) ? i - 1 : i + 1;
    const [a, b] = [Math.min(i, k), Math.max(i, k)];
    out.splice(a, 2, { ...out[a], end: out[b].end });
  }
  return out;
}

/** Scene spans of a local video file: in order, without overlap, covering 0 to its duration. */
export async function detectScenes(video: string, options: SceneOptions = {}): Promise<Span[]> {
  const duration = options.duration ?? (await probe(video, options)).duration;
  return stage("video", async () => {
    const { stderr } = await run(ffmpeg(options), [
      "-hide_banner", "-nostats", "-i", video, "-an",
      // Scored on RGB, not luma: a cut between two shots of equal brightness (red → green) is still a cut.
      "-vf", `scale=320:-2,format=rgb24,select='gt(scene,${options.threshold ?? SCENE_THRESHOLD})',showinfo`, "-f", "null", "-",
    ]);
    return buildScenes(parseCuts(stderr), duration, options);
  });
}
