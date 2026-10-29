import type { Cue, Word } from "../types.js";

/** "00:01:02.500", "01:02.500" or "01:02,500" → seconds. */
function seconds(t: string): number | undefined {
  const m = t.trim().match(/^(?:(\d+):)?(\d+):(\d+(?:[.,]\d+)?)/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(",", "."));
}

/** A WebVTT file → its cues in order, without markup and without a cue that only repeats the one before. */
export function parseVtt(vtt: string): Cue[] {
  const out: Cue[] = [];
  const lines = vtt.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("-->")) continue;
    const [a, b] = lines[i].split("-->");
    const start = seconds(a);
    const end = seconds(b ?? "");
    if (start === undefined || end === undefined) continue;
    const text: string[] = [];
    for (i++; i < lines.length && lines[i].trim(); i++) text.push(lines[i].replace(/<[^>]+>/g, "").trim());
    const joined = text.join(" ").replace(/\s+/g, " ").trim();
    if (joined && out.at(-1)?.text !== joined) out.push({ start, end: Math.max(start, end), text: joined });
  }
  return out;
}

const ms = (t: number) => Math.round(t * 1000) / 1000;

/** Cues → words: a cue's own words when it has them, else its text spread evenly over its time (to the millisecond). */
export function cueWords(cues: Cue[]): Word[] {
  return cues.flatMap((c) => {
    if (c.words?.length) return c.words;
    const parts = c.text.split(/\s+/).filter(Boolean);
    const step = (c.end - c.start) / Math.max(parts.length, 1);
    return parts.map((word, i) => ({ word, start: ms(c.start + i * step), end: ms(c.start + (i + 1) * step) }));
  });
}
