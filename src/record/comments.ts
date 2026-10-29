// The comments: which videos read them, which are kept, and the decide request that gives each its kind.
import type { Apinoa } from "@apinoa/sdk";
import type { Comment, DecisionQuestion, Decisions, Evidence, Post, Role, Sells } from "../types.js";
import { COMMENT_KINDS, valueText } from "./taxonomy.js";

/** A comment as read, before its kind is decided. */
export type CommentText = { id: string; text: string; likes: number };

type ForComments = {
  sells: Sells;
  asksForComment: boolean;
  product: string;
  scenes: { role: Role; spoken: string; onScreenText: string }[];
};

/** Whether a record's comments are read: it sells something, or asks for a comment. */
export const commentsWanted = (r: { sells: Sells; asksForComment: boolean }) => r.sells !== "none" || r.asksForComment;

/** The comments kept from a read: in TikTok's order, with text, without the creator's own. */
export function commentList(page: Apinoa.CommentPage | undefined, post?: Post): CommentText[] {
  const creator = post?.author?.id;
  return (page?.items ?? [])
    .filter((c) => typeof c.text === "string" && c.text.trim() && !c.byAuthor && !(creator && c.author?.id === creator))
    .map((c) => ({ id: c.id, text: c.text, likes: c.metrics?.likes ?? 0 }));
}

/** The comments as evidence, one item each, after what the video pitches and what its `cta` scenes say and show. */
export function commentEvidence(comments: CommentText[], record: ForComments): Evidence {
  const cta = record.scenes.filter((s) => s.role === "cta");
  const said = cta.map((s) => s.spoken).filter(Boolean).join(" ");
  const shown = cta.map((s) => s.onScreenText).filter(Boolean).join(" ");
  const ask = !cta.length ? "The video has no call-to-action scene."
    : !said && !shown ? "The words of the video's call to action aren't known."
    : `The video's call to action${said ? ` says: "${said}"` : ""}${said && shown ? " and" : ""}${shown ? ` shows: "${shown}"` : ""}.`;
  const intro = [
    "Comments on a TikTok video, one per item, in the order TikTok shows them.",
    record.product ? `The product the video pitches: "${record.product}".` : "The video pitches no product by name.",
    ask,
  ].join("\n");
  return { intro, items: comments.map((c, i) => ({ type: "text", text: `Comment ${i + 1}: "${c.text}"` })), scenes: comments.length };
}

/** One `kind` per comment; `cta_reply` only when the video asks for a comment. */
export function commentQuestions(record: { asksForComment: boolean }): DecisionQuestion[] {
  const kinds = COMMENT_KINDS.filter((k) => k !== "cta_reply" || record.asksForComment);
  return [{
    type: "choice", name: "kind", scope: "scene",
    instructions: "What comment {scene} does. When more than one value fits, the first in the list wins.",
    choices: kinds.map((value) => ({ value, description: valueText("commentKind", value) })),
  }];
}

/** The comments with their kinds; a missing or refused answer is `other`. */
export function parseComments(d: Decisions, comments: CommentText[]): Comment[] {
  return comments.map((c, i) => {
    const k = d.scenes[i]?.kind?.choice;
    return { id: c.id, text: c.text, likes: c.likes, kind: COMMENT_KINDS.includes(k as Comment["kind"]) ? (k as Comment["kind"]) : "other" };
  });
}
