import type { FfmpegOptions, OpenAIOptions, Segment, Transcript, Word } from "../types.js";
import { ffmpeg, openai, run, send, stage } from "./run.js";

export const TRANSCRIBE_MODEL = "whisper-1"; // the OpenAI model that gives word timestamps

/** The video's audio as a small mono MP3. */
export function extractAudio(video: string, options: FfmpegOptions = {}): Promise<Buffer> {
  return stage("video", async () => {
    const { stdout } = await run(ffmpeg(options), ["-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3", "-"]);
    return stdout;
  });
}

type WhisperSegment = { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number };
type Whisper = { text?: string; words?: Word[]; segments?: WhisperSegment[]; language?: string; duration?: number };

/** whisper's verbose_json → a Transcript: its segments, each with the words whose midpoint falls in it. */
export function fromWhisper(data: Whisper): Transcript {
  const words = (data.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  const raw = data.segments?.length ? data.segments : data.text ? [{ start: 0, end: data.duration ?? words.at(-1)?.end ?? 0, text: data.text }] : [];
  const segments: Segment[] = raw.map((s, i) => {
    const last = i === raw.length - 1;
    const own = words.filter((w) => { const mid = (w.start + w.end) / 2; return mid >= s.start && (mid < s.end || last); });
    return {
      start: s.start, end: s.end, text: s.text.trim(), words: own,
      ...(s.no_speech_prob !== undefined ? { noSpeechProb: s.no_speech_prob } : {}),
      ...(s.avg_logprob !== undefined ? { avgLogprob: s.avg_logprob } : {}),
    };
  });
  return {
    segments,
    ...(data.language ? { language: data.language } : {}),
    ...(typeof data.duration === "number" ? { usage: { audioSec: data.duration } } : {}),
  };
}

/** OpenAI transcription with word timestamps. The pipeline drops whisper's music lines afterwards (dropHallucinations). */
export function transcribe(audio: Buffer, options: OpenAIOptions & { model?: string } = {}): Promise<Transcript> {
  return stage("speech", async () => {
    const api = openai(options, "speech");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", options.model ?? TRANSCRIBE_MODEL);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    const res = await send(api.fetch, `${api.base}/audio/transcriptions`, {
      method: "POST", headers: { Authorization: `Bearer ${api.key}` }, body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`transcription ${res.status}: ${data?.error?.message ?? "no body"}`);
    return fromWhisper(data);
  });
}

// whisper's stock line on music-only audio; dropped whatever its numbers say.
const OUTRO = /^(thanks|thank you)( so much)? for watching[.!]*$/i;

/** The transcript without segments that are likely not speech and unsure, or only "thanks for watching" (docs/video-analysis.md). */
export function dropHallucinations(t: Transcript): Transcript {
  const bad = (s: Segment) => ((s.noSpeechProb ?? 0) > 0.4 && (s.avgLogprob ?? 0) < -0.6) || OUTRO.test(s.text.trim());
  return { ...t, segments: t.segments.filter((s) => !bad(s)) };
}
