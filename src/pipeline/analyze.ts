// analyzeVideo: the stages of docs/concepts.md, built only from the primitives exports. Never throws.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  alignWords, checkQuestions, commentEvidence, commentList, commentQuestions, commentsWanted, cueWords, describeRequest,
  detectScenes, download, dropHallucinations, extractAudio, extractFrames, fetchSubtitles, parseComments, parseDescribed,
  parseRecord, parseVtt, photoFrame, postMedia, probe, readComments, readPost, recordIntro, recordQuestions, resolveInput,
  sceneEvidence,
  type Analysis, type Comment, type Decisions, type Described, type Failed, type Input, type Media, type Options,
  type PartialAnalysis, type Post, type Raw, type RecordFacts, type ResolvedInput, type Scene, type Span, type Speech,
  type StageName, type StageRun, type Transcriber, type Usage,
} from "../primitives.js";
import { apinoaCost, decisionsCost, responsesCost, transcriptionCost, usd, withPrices } from "../prices.js";
import { openaiDecider, openaiDescriber, openaiTranscriber } from "./engines.js";

/** Raised when a stage's code, prompt or questions change, so `reuse` runs it again. */
export const STAGE_VERSIONS: Record<StageName, string> = {
  source: "1", scenes: "1", frames: "1", speech: "1", describe: "1", decide: "1", comments: "1",
};

/** What each stage reads: a stage is taken from `reuse` only when these were taken too. */
const READS: Record<StageName, StageName[]> = {
  source: [],
  scenes: ["source"],
  frames: ["scenes"],
  speech: ["source", "scenes"],
  describe: ["source", "frames", "speech"],
  decide: ["source", "frames", "speech", "describe"],
  comments: ["source", "decide"],
};

const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0];
const dataUrl = (jpeg: Buffer) => `data:image/jpeg;base64,${jpeg.toString("base64")}`;
const fromDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
const shortHash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 8);

/** The `usage` numbers a stage entry keeps, without the empty ones. */
function used(u: Usage | undefined, more: Partial<StageRun> = {}): Partial<StageRun> {
  const out: Partial<StageRun> = { ...more };
  if (u?.inputTokens !== undefined) out.inputTokens = u.inputTokens;
  if (u?.outputTokens !== undefined) out.outputTokens = u.outputTokens;
  if (u?.audioSec !== undefined) out.audioSec = u.audioSec;
  return out;
}

async function fileId(path: string): Promise<string> {
  try {
    return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
  } catch (e) {
    throw new Error(`video: cannot read ${path} (${(e as NodeJS.ErrnoException).code ?? firstLine(e)})`);
  }
}

/** Checked before any download or request: the keys the run will need. */
function checkKeys(input: ResolvedInput, o: Options) {
  const defaults = !o.describer || !o.decider || o.transcribe === true;
  if (defaults && !(o.openaiApiKey ?? process.env.OPENAI_API_KEY)) {
    throw new Error(`${o.transcribe === true ? "speech" : "describe"}: OPENAI_API_KEY is not set (set it, or pass openaiApiKey)`);
  }
  if (input.kind === "tiktok" && !(o.apinoaApiKey ?? process.env.APINOA_API_KEY)) {
    throw new Error("source: APINOA_API_KEY is not set (set it, or pass apinoaApiKey)");
  }
}

/** The record of one short-form video (docs/reference.md). Returns `{ ok: false, error, partial? }` instead of throwing. */
export async function analyzeVideo(input: Input, options: Options = {}): Promise<Analysis | Failed> {
  const prices = withPrices(options.prices);
  const openai = { openaiApiKey: options.openaiApiKey, openaiBaseUrl: options.openaiBaseUrl, fetch: options.fetch };
  const apinoa = { apinoaApiKey: options.apinoaApiKey, fetch: options.fetch };
  const ffmpeg = { ffmpegPath: options.ffmpegPath, ffprobePath: options.ffprobePath };
  const describer = options.describer ?? openaiDescriber({ ...openai, ...(options.flex ? { serviceTier: "flex" as const } : {}) });
  const decider = options.decider ?? openaiDecider(openai);
  const transcriber: Transcriber | undefined = options.transcribe === true ? openaiTranscriber(openai) : options.transcribe || undefined;

  const stages: Partial<Record<StageName, StageRun>> = {};
  const raw: Raw = {};
  const done: PartialAnalysis = {};
  const taken = new Set<StageName>();
  let prev = options.reuse;
  let resolved: ResolvedInput | undefined;
  let work: string | undefined;

  /** Takes a stage from `reuse` when its version matches, what it reads was taken, and its data is there. */
  const take = (name: StageName, version: string, has: (p: NonNullable<typeof prev>) => boolean): boolean => {
    const entry = prev?.stages?.[name];
    if (!prev || entry?.version !== version || !READS[name].every((r) => taken.has(r)) || !has(prev)) return false;
    taken.add(name);
    stages[name] = { ...entry, reused: true };
    return true;
  };
  const timed = async <T>(fn: () => Promise<T>) => {
    const t0 = performance.now();
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t0) };
  };

  try {
    checkQuestions(options.questions);
    resolved = await resolveInput(input);
    checkKeys(resolved, options);
    const src = resolved;

    // source
    let post: Post | undefined;
    const video = src.kind === "tiktok" ? `tiktok:${src.postId}` : await fileId(src.path);
    if (prev?.stages?.source?.video !== video) prev = undefined; // another video's result
    if (take("source", STAGE_VERSIONS.source, (p) => src.kind === "file" || !!(src.post ?? p.raw?.post))) {
      post = src.kind === "tiktok" ? (src.post ?? prev!.raw!.post) : undefined;
    } else {
      const { value, ms } = await timed(async () => (src.kind !== "tiktok" ? undefined : (src.post ?? (await readPost(src.postId, apinoa)))));
      post = value;
      const calls = src.kind === "tiktok" && !src.post ? 1 : 0;
      stages.source = { version: STAGE_VERSIONS.source, ms, costUsd: apinoaCost(prices, calls), ...(calls ? { apinoaCalls: calls } : {}), video };
    }
    if (post) raw.post = post;

    /**
     * Runs `fn` on the post's links; the first time one fails, reads the post once more for fresh links (they expire
     * about 2 days after a read) and tries again. Only the links change, so what was taken stays taken.
     */
    let refreshed = false;
    const withFreshLinks = async <T>(fn: (p: Post) => Promise<T>): Promise<T> => {
      try {
        return await fn(post!);
      } catch (e) {
        if (refreshed || src.kind !== "tiktok") throw e;
        refreshed = true;
        post = await readPost(src.postId, apinoa);
        raw.post = post;
        const s = stages.source!;
        const calls = (s.reused ? 0 : (s.apinoaCalls ?? 0)) + 1;
        stages.source = { version: s.version, ms: s.reused ? 0 : s.ms, costUsd: apinoaCost(prices, calls), apinoaCalls: calls, video };
        return fn(post);
      }
    };
    const workDir = async () => (work ??= await mkdtemp(join(tmpdir(), "shortform-analyzer-")));
    let videoFile: Promise<string> | undefined;
    const localVideo = () => (videoFile ??= (async () => {
      if (src.kind === "file") return src.path;
      const dest = join(await workDir(), "video.mp4");
      await withFreshLinks(async (p) => {
        const url = postMedia(p).video;
        if (!url) throw new Error("source: the post has no video link");
        await download(url, dest, { fetch: options.fetch });
      });
      return dest;
    })());

    const links = post ? postMedia(post) : undefined;
    const media: Media = links && !links.video ? "photos" : "video";
    if (links && !links.video && !links.photos.length) throw new Error("source: the post has no video or photo links");

    // scenes
    let spans: Span[];
    let duration: number;
    if (take("scenes", STAGE_VERSIONS.scenes, (p) => p.media === media && typeof p.duration === "number" && !!p.scenes?.length && p.scenes.every((s) => typeof s.start === "number" && typeof s.end === "number"))) {
      duration = prev!.duration!;
      spans = prev!.scenes!.map((s) => ({ start: s.start!, end: s.end!, ...(s.cut === false ? { cut: false as const } : {}) }));
    } else {
      const { value, ms } = await timed(async () => {
        if (media === "photos") return { duration: links!.photos.length, spans: links!.photos.map((_, i) => ({ start: i, end: i + 1 })) };
        const v = await localVideo();
        const d = (await probe(v, ffmpeg)).duration;
        return { duration: d, spans: await detectScenes(v, { ...ffmpeg, duration: d }) };
      });
      ({ duration, spans } = value);
      stages.scenes = { version: STAGE_VERSIONS.scenes, ms, costUsd: 0 };
    }
    done.media = media;
    done.duration = duration;
    done.scenes = spans.map((s, i) => ({ index: i, start: s.start, end: s.end, cut: s.cut !== false }));

    // frames
    let frames: Buffer[];
    if (take("frames", STAGE_VERSIONS.frames, (p) => p.scenes?.length === spans.length && p.scenes.every((s) => typeof s.frame === "string" && s.frame.startsWith("data:")))) {
      frames = prev!.scenes!.map((s) => fromDataUrl(s.frame!));
    } else {
      const { value, ms } = await timed(async () => {
        if (media === "video") return extractFrames(await localVideo(), spans, ffmpeg);
        const dir = await workDir();
        const files = await withFreshLinks(async (p) => {
          const urls = postMedia(p).photos;
          if (urls.length !== spans.length) throw new Error(`source: the post has ${urls.length} photos, not ${spans.length}`);
          return Promise.all(urls.map(async (url, i) => { const f = join(dir, `photo-${i}`); await download(url, f, { fetch: options.fetch }); return f; }));
        });
        return Promise.all(files.map((f) => photoFrame(f, undefined, ffmpeg)));
      });
      frames = value;
      stages.frames = { version: STAGE_VERSIONS.frames, ms, costUsd: 0 };
    }
    done.scenes.forEach((s, i) => (s.frame = dataUrl(frames[i])));

    // speech
    const track = links?.subtitles;
    let speech: Speech;
    let spoken: string[];
    const speechVersion = `${STAGE_VERSIONS.speech}:${track ? "subtitles" : (transcriber?.id ?? "off")}`;
    if (take("speech", speechVersion, (p) => !!p.speech && p.scenes?.length === spans.length && p.scenes.every((s) => typeof s.spoken === "string"))) {
      speech = prev!.speech!;
      spoken = prev!.scenes!.map((s) => s.spoken!);
      if (prev!.raw?.subtitles !== undefined) raw.subtitles = prev!.raw.subtitles;
      if (prev!.raw?.transcript !== undefined) raw.transcript = prev!.raw.transcript;
    } else {
      const t0 = performance.now();
      const entry: StageRun = { version: speechVersion, ms: 0, costUsd: 0 };
      speech = "none";
      spoken = spans.map(() => "");
      try {
        if (track) {
          const vtt = await withFreshLinks((p) => fetchSubtitles(postMedia(p).subtitles?.url ?? track.url, { fetch: options.fetch }));
          raw.subtitles = vtt;
          spoken = alignWords(cueWords(parseVtt(vtt)), spans);
          speech = "subtitles";
        } else if (transcriber && media === "video") {
          const v = await localVideo();
          if ((await probe(v, ffmpeg)).audio) {
            const t = await transcriber.transcribe(await extractAudio(v, ffmpeg));
            raw.transcript = t;
            const u = { ...t.usage, audioSec: t.usage?.audioSec ?? duration };
            Object.assign(entry, used(u, { requests: 1 }), { costUsd: transcriptionCost(prices, transcriber.id, u) });
            spoken = alignWords(cueWords(dropHallucinations(t).segments), spans);
            speech = "transcription";
          }
        }
      } catch (e) {
        entry.error = firstLine(e); // a failed speech stage leaves the words unknown, not the analysis failed
      }
      entry.ms = Math.round(performance.now() - t0);
      stages.speech = entry;
    }
    done.speech = speech;
    done.scenes.forEach((s, i) => (s.spoken = spoken[i]));

    // describe
    const facts: RecordFacts = { media, duration, scenes: spans.length, speech, ...(post ? { post } : {}) };
    const evidence = (described?: Described) => sceneEvidence(spans, frames, spoken, {
      duration, intro: recordIntro(facts, described), words: speech, ...(media === "photos" ? { photos: true } : {}),
    });
    const describeVersion = `${STAGE_VERSIONS.describe}:${describer.id}`;
    if (take("describe", describeVersion, (p) => p.raw?.describe !== undefined)) {
      raw.describe = prev!.raw!.describe;
    } else {
      const { value, ms } = await timed(() => describer.describe(evidence(), describeRequest(spans.length)));
      raw.describe = value.output;
      stages.describe = {
        version: describeVersion, ms, costUsd: responsesCost(prices, describer.id, value.usage),
        ...used(value.usage, { requests: 1, images: frames.length }), ...(value.usage?.serviceTier === "flex" ? { serviceTier: "flex" as const } : {}),
      };
    }
    const described = parseDescribed(raw.describe, spans.length);
    Object.assign(done, { product: described.product, tags: described.tags, description: described.description, formatDescription: described.formatDescription });
    done.scenes.forEach((s, i) => (s.onScreenText = described.onScreenText[i]));

    // decide
    const decideVersion = `${STAGE_VERSIONS.decide}:${decider.id}${options.questions?.length ? `:${shortHash(options.questions)}` : ""}`;
    if (take("decide", decideVersion, (p) => p.raw?.decide !== undefined)) {
      raw.decide = prev!.raw!.decide;
    } else {
      const { value, ms } = await timed(() => decider.decide(evidence(described), recordQuestions({ questions: options.questions })));
      raw.decide = value;
      stages.decide = { version: decideVersion, ms, costUsd: decisionsCost(prices, decider.id, value.usage), ...used(value.usage, { requests: 1, images: frames.length }) };
    }
    const record = parseRecord(raw.decide!, { spans, product: described.product, questions: options.questions });

    const scenes: Scene[] = spans.map((s, i) => {
      const r = record.scenes[i];
      return {
        index: i, start: s.start, end: s.end, cut: s.cut !== false, role: r.role, footage: r.footage,
        ...(r.showsProduct !== undefined ? { showsProduct: r.showsProduct } : {}),
        spoken: spoken[i], onScreenText: described.onScreenText[i], frame: dataUrl(frames[i]),
        ...(r.answers ? { answers: r.answers } : {}),
      };
    });

    // comments
    let comments: Comment[] | undefined;
    if (src.kind === "tiktok" && options.comments !== false && commentsWanted(record)) {
      const version = `${STAGE_VERSIONS.comments}:${decider.id}`;
      const forComments = { ...record, scenes };
      const has = (p: NonNullable<typeof prev>) => p.raw?.comments !== undefined &&
        (p.raw.commentsDecide !== undefined || !commentList(p.raw.comments, post).length);
      if (take("comments", version, has)) {
        raw.comments = prev!.raw!.comments;
        if (prev!.raw!.commentsDecide) raw.commentsDecide = prev!.raw!.commentsDecide;
      } else {
        const t0 = performance.now();
        const entry: StageRun = { version, ms: 0, costUsd: 0 };
        try {
          raw.comments = await readComments(src.postId, apinoa);
          entry.apinoaCalls = 1;
          entry.costUsd = apinoaCost(prices, 1);
          const list = commentList(raw.comments, post);
          if (list.length) {
            const d = await decider.decide(commentEvidence(list, forComments), commentQuestions(record));
            raw.commentsDecide = d;
            Object.assign(entry, used(d.usage, { requests: 1 }), { costUsd: usd(entry.costUsd + decisionsCost(prices, decider.id, d.usage)) });
          }
        } catch (e) {
          entry.error = firstLine(e); // a failed comments stage leaves `comments` out, not the analysis failed
          delete raw.comments;
        }
        entry.ms = Math.round(performance.now() - t0);
        stages.comments = entry;
      }
      if (raw.comments) {
        const empty: Decisions = { video: {}, scenes: [] };
        comments = parseComments(raw.commentsDecide ?? empty, commentList(raw.comments, post));
      }
    }

    const ordered = Object.fromEntries((Object.keys(READS) as StageName[]).filter((k) => stages[k]).map((k) => [k, stages[k]]));
    return {
      schemaVersion: 2, ok: true, media, duration, speech,
      topic: record.topic, format: record.format, sells: record.sells, asksForComment: record.asksForComment,
      product: record.product, tags: described.tags, description: described.description, formatDescription: described.formatDescription,
      scenes,
      ...(comments ? { comments } : {}),
      ...(record.answers ? { answers: record.answers } : {}),
      stages: ordered,
      costUsd: usd(Object.values(stages).reduce((sum, s) => sum + (s!.reused ? 0 : s!.costUsd), 0)),
      raw,
    };
  } catch (e) {
    const finished = Object.keys(stages).length > 0;
    return {
      ok: false,
      error: firstLine(e),
      ...(finished ? { partial: { schemaVersion: 2 as const, ...done, stages, raw } } : {}),
    };
  } finally {
    await resolved?.cleanup();
    if (work) await rm(work, { recursive: true, force: true });
  }
}
