// The describe request (the record's text fields) and the rules on its output.
import type { DescribeRequest } from "../types.js";

export const MAX_TAGS = 10;

export type Described = {
  product: string;
  tags: string[];
  description: string;
  formatDescription: string;
  /** One per scene, in order. */
  onScreenText: string[];
};

const INSTRUCTIONS = `You write the text fields of a record of one short-form video, from its frames, the words said in it and what TikTok says about it. Write in English, except onScreenText.
- product: the name of the product the video pitches, a specific product it names or links and recommends that the viewer get; for several products: their names, separated by commas. Showing or using a product isn't a pitch, unless the post has one of TikTok's commercial tags or the product's own account posted it. Empty when it pitches none.
- tags: 5 to 10 single lowercase English words for what the video means: its specific subject (skincare, furniture), the names in it (amazon, duolingo), its intent (recommendation, deal, dupe), who it's for only when the video says or writes it (students, moms, gamers), and funny when the video is built around a joke or a punchline. More specific than the topic. Join a name of several words like a hashtag: leagueoflegends. Nothing about how it's made: green screen, voiceover, AI footage and reused clips go in formatDescription.
- description: what the video is about, in a few sentences.
- formatDescription: how it is made, so someone could remake it about something else: the shots, the edit, how it opens, where the product appears, and techniques such as green screen, voiceover, AI-generated footage or clips taken from someone else.
- onScreenText: one entry per scene, in order ({scenes} entries): only the video's main caption in the scene's frame, verbatim and in its own language: the text added in the edit that says what is happening or being said, usually over the footage (subtitles, a hook line, a list item, a step). Write it in every scene it shows in, also when it stays on screen for several scenes or the whole video. Leave out the fixed layout around the footage (a title or header in a band above or below it, the channel's name or logo, a watermark, a label such as FANMADE) and text that is part of the footage itself (an app's or game's interface, names, numbers, signs). Empty when the scene has no such caption. TikTok's sticker text helps with the spelling, but write only text visible in the frame.`;

/** The describe request for a video of `scenes` scenes: instructions and a strict JSON schema. */
export function describeRequest(scenes: number): DescribeRequest {
  const text = { type: "string" };
  return {
    name: "video_record_text",
    instructions: INSTRUCTIONS.replace("{scenes}", String(scenes)),
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["product", "tags", "description", "formatDescription", "onScreenText"],
      properties: {
        product: text,
        tags: { type: "array", items: text },
        description: text,
        formatDescription: text,
        onScreenText: { type: "array", items: text },
      },
    },
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A tag as the record keeps it: lowercase, without `#`, spaces or punctuation. */
export const cleanTag = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The describe output → the record's text fields: a field left out is empty; tags cleaned, unique, at most 10. */
export function parseDescribed(output: unknown, scenes: number): Described {
  const o = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const tags = [...new Set((Array.isArray(o.tags) ? o.tags : []).map((t) => cleanTag(str(t))).filter(Boolean))].slice(0, MAX_TAGS);
  const texts = Array.isArray(o.onScreenText) ? o.onScreenText : [];
  return {
    product: str(o.product),
    tags,
    description: str(o.description),
    formatDescription: str(o.formatDescription),
    onScreenText: Array.from({ length: scenes }, (_, i) => str(texts[i])),
  };
}
