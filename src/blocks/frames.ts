import type { FfmpegOptions, Span } from "../types.js";
import { ffmpeg, run, stage } from "./run.js";

export const FRAME_SIDE = 512; // px, long side of the frame the model sees

const fit = (side: number) => `scale=${side}:${side}:force_original_aspect_ratio=decrease:force_divisible_by=2`;

/** The frame at t seconds as a JPEG, at most `side` px on its long side. */
export function grabFrame(video: string, t: number, side = FRAME_SIDE, options: FfmpegOptions = {}): Promise<Buffer> {
  return stage("video", async () => {
    const { stdout } = await run(ffmpeg(options), [
      "-v", "error", "-ss", t.toFixed(2), "-i", video, "-frames:v", "1",
      "-vf", fit(side), "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "-",
    ]);
    if (!stdout.length) throw new Error(`no frame at ${t.toFixed(2)} s`);
    return stdout;
  });
}

export type FrameOptions = FfmpegOptions & {
  /** Where in each span, from 0 (its start) to 1 (its end). Default 0.5, the middle: the ends are often mid-transition. */
  at?: number;
  side?: number;
};

/** One JPEG per span, at `start + at × (end − start)`. */
export function extractFrames(video: string, spans: Span[], options: FrameOptions = {}): Promise<Buffer[]> {
  const at = options.at ?? 0.5;
  return Promise.all(spans.map((s) => grabFrame(video, s.start + at * (s.end - s.start), options.side ?? FRAME_SIDE, options)));
}

/** A photo file (JPEG, PNG, WebP…) as a JPEG, at most `side` px on its long side. */
export function photoFrame(image: string, side = FRAME_SIDE, options: FfmpegOptions = {}): Promise<Buffer> {
  return stage("video", async () => {
    const { stdout } = await run(ffmpeg(options), [
      "-v", "error", "-i", image, "-frames:v", "1", "-vf", fit(side), "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "-",
    ]);
    if (!stdout.length) throw new Error("the photo has no image");
    return stdout;
  });
}
