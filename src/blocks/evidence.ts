import type { Evidence, EvidenceItem, Span } from "../types.js";

export const SCENE_INTRO = "A video, {duration} s long, in {scenes} scenes. Each scene: its time, a frame from its middle, and what is said in it.";

/** How a scene's words are labelled: TikTok's subtitles, an automatic transcription, or not known at all. */
export type WordsFrom = "subtitles" | "transcription" | "none";

export type SceneEvidenceOptions = {
  duration: number;
  intro?: string;
  /** Default `subtitles`: "Said: …" or "Nothing said." `none` leaves the words out, so nothing claims silence. */
  words?: WordsFrom;
  /** A photo post: each scene is a photo, with no time. */
  photos?: boolean;
};

const pct = (t: number, d: number) => Math.round((t / d) * 100);

function said(text: string, from: WordsFrom): string {
  if (from === "none") return "";
  if (from === "transcription") return text ? ` Said (automatic transcription, may be song lyrics): "${text}"` : " Nothing transcribed.";
  return text ? ` Said: "${text}"` : " Nothing said.";
}

/**
 * Per scene, its time and share of the video, whether it continues the take before it, its frame and what is said in it.
 * `{duration}` and `{scenes}` in `intro` become the video's length and scene count.
 */
export function sceneEvidence(spans: Span[], frames: Buffer[], texts: string[], options: SceneEvidenceOptions): Evidence {
  const { duration } = options;
  if (frames.length !== spans.length || texts.length !== spans.length) {
    throw new Error(`decide: ${spans.length} scenes need as many frames and texts (got ${frames.length} and ${texts.length})`);
  }
  const intro = (options.intro ?? SCENE_INTRO).replaceAll("{duration}", duration.toFixed(1)).replaceAll("{scenes}", String(spans.length));
  const items: EvidenceItem[] = spans.flatMap((s, i): EvidenceItem[] => {
    const head = options.photos
      ? `Scene ${i + 1} (photo ${i + 1} of ${spans.length}).`
      : `Scene ${i + 1} (${s.start.toFixed(1)}-${s.end.toFixed(1)} s, ${pct(s.start, duration)}% to ${pct(s.end, duration)}% of the video${s.cut === false ? ", the same take as the scene before" : ""}).`;
    return [{ type: "text", text: head + said(texts[i], options.words ?? "subtitles") }, { type: "image", image: frames[i] }];
  });
  return { intro, items, scenes: spans.length };
}

/** Texts only, one item each, in order: `scene` questions are asked once per text. */
export function textEvidence(intro: string, texts: string[]): Evidence {
  return { intro, items: texts.map((text) => ({ type: "text", text })), scenes: texts.length };
}
