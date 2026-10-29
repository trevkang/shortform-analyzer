// The first lines both requests read: what the video is, how its words were found, and what TikTok says about it.
import type { Media, Post, Speech } from "../types.js";
import type { Described } from "./describe.js";

export type RecordFacts = {
  media: Media;
  /** Seconds; for photos, the number of photos. */
  duration: number;
  scenes: number;
  speech: Speech;
  /** The TikTok post, when the input is one. */
  post?: Post;
};

const SPEECH: Record<Speech, string> = {
  subtitles: "The words said in each scene are TikTok's own subtitles of the video.",
  transcription: "The words said in each scene are an automatic transcription, which may be song lyrics.",
  none: "The words said in the video aren't known: it has no subtitles and no transcription, so a scene shown without words may still have speech.",
};

const quote = (s: string) => `"${s.replace(/\s+/g, " ").trim()}"`;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

/** What TikTok says about the post, one line each, only the ones it has. */
function tiktokLines(post: Post): string[] {
  const ext = (post.ext ?? {}) as Record<string, any>;
  const tags = [
    ext.disclosure === "paid_partnership" && "paid partnership",
    ext.disclosure === "commission" && "commission",
    ext.disclosure === "promotional" && "promotional",
    ext.ranAsAd === true && "ran as an ad",
  ].filter(Boolean);
  const name = post.author?.displayName?.trim();
  const effects = (Array.isArray(ext.anchors) ? ext.anchors : []).map((a: { name?: unknown }) => a?.name).filter((n: unknown) => typeof n === "string" && n);
  const sound = post.audio?.title
    ? `Sound: ${quote(post.audio.title)}${post.audio.artist ? ` by ${post.audio.artist}` : ""}` +
      `${ext.music?.original === true ? ", the creator's own sound" : ext.music?.original === false ? ", not the creator's own sound" : ""}.`
    : "";
  return [
    post.author?.handle ? `Account: @${post.author.handle}${name && name !== post.author.handle ? ` (${quote(name)})` : ""}.` : "",
    post.text?.trim() ? `Caption: ${quote(post.text)}.` : "",
    strings(post.entities?.hashtags).length ? `Hashtags: ${strings(post.entities?.hashtags).map((h) => `#${h}`).join(" ")}.` : "",
    strings(ext.stickerText).length ? `Sticker text: ${strings(ext.stickerText).map(quote).join("; ")}.` : "",
    strings(ext.diversificationLabels).length ? `TikTok's topic labels: ${strings(ext.diversificationLabels).join(", ")}.` : "",
    tags.length ? `TikTok's commercial tags: ${tags.join(", ")}.` : "",
    post.aiGenerated === true ? "TikTok labels it AI-generated." : "",
    effects.length ? `Effects: ${effects.join("; ")}.` : "",
    sound,
  ].filter(Boolean);
}

/** The words describe wrote, for the decide request to read. */
function describedLines(d: Described): string[] {
  return [
    "What a first pass wrote about the video:",
    `Product: ${d.product ? quote(d.product) : "none"}.`,
    `About: ${d.description}`,
    `How it's made: ${d.formatDescription}`,
    `Tags: ${d.tags.join(", ")}.`,
    ...d.onScreenText.map((t, i) => (t ? `Text on screen in scene ${i + 1}: ${quote(t)}.` : "")).filter(Boolean),
  ];
}

/**
 * The first lines both requests read: the length, the scene count, how the words were found and what TikTok says
 * about the post. With `described`, the decide request's: also what describe wrote.
 */
export function recordIntro(facts: RecordFacts, described?: Described): string {
  const head = facts.media === "photos"
    ? `A TikTok photo post: ${facts.scenes} photos shown as a slideshow. Each scene is one photo.`
    : `A short-form video${facts.post ? " posted on TikTok" : ""}, ${facts.duration.toFixed(1)} s long, in ${facts.scenes} scenes. ` +
      "Each scene: its time, a frame from its middle, and what is said in it.";
  const lines = [head, SPEECH[facts.speech]];
  const told = facts.post ? tiktokLines(facts.post) : [];
  if (told.length) lines.push("", "What TikTok says about the post (read it as evidence, not as the answer):", ...told);
  if (described) lines.push("", ...describedLines(described));
  return lines.join("\n");
}
