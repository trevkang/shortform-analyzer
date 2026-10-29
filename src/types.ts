// The types every layer shares (docs/concepts.md, docs/reference.md "Output").
import type { Apinoa } from "@apinoa/sdk";
import type { CommentKind, Footage, Format, Role, Sells, Subject, Topic } from "./record/taxonomy.js";
import type { PricesOverride } from "./prices.js";

/** A scene's span in seconds; `cut: false` when it continues the take before it (a long take split up). */
export type Span = { start: number; end: number; cut?: false };

/** One word with its time in seconds. */
export type Word = { word: string; start: number; end: number };

/** A run of words with one start and end time: a subtitle cue, or a transcript segment. */
export type Cue = { start: number; end: number; text: string; words?: Word[] };

/** A transcript segment, with whisper's two numbers when the transcriber gives them. */
export type Segment = Cue & { noSpeechProb?: number; avgLogprob?: number };

/** What a request used. `costUsd`, when an engine gives it, is the stage's cost as it is. `serviceTier` is set when it ran on flex. */
export type Usage = { inputTokens?: number; outputTokens?: number; audioSec?: number; costUsd?: number; serviceTier?: "flex" };

export type Transcript = { segments: Segment[]; language?: string; usage?: Usage };

/** The `data` of an apinoa post read (https://apinoa.com). Kept as it came; the package reads only some of it. */
export type Post = Apinoa.Post;

/** A probability per option, as Decisions returns them. */
export type Probs = Record<string, number>;

// ---- Layer 1: evidence, describe and decide ----

export type EvidenceItem = { type: "text"; text: string } | { type: "image"; image: Buffer; mime?: string };

/** What a model reads, in order. `scenes` is how many items `scene` questions are asked about (0 for none). */
export type Evidence = { intro: string; items: EvidenceItem[]; scenes: number };

type QuestionBase = {
  name: string;
  instructions: string;
  scope?: "video" | "scene";
  /** For a `scene` question: the first scene it is asked about, from 0. Default 0. */
  from?: number;
};
export type DecisionQuestion =
  | (QuestionBase & { type: "predicate" })
  | (QuestionBase & { type: "choice"; choices: { value: string; description?: string }[] })
  | (QuestionBase & { type: "score"; levels: { label: string; description?: string }[] });

/** One answer as the model gave it: `probability` for a predicate, `choice` and `probs` for a choice, `score` for a score. */
export type DecisionAnswer = { probability?: number; choice?: string; probs?: Probs; score?: number };

/** What `decide` returns: only what the model answered. A refused or missing answer is absent. */
export type Decisions = {
  video: Record<string, DecisionAnswer>;
  scenes: Record<string, DecisionAnswer>[];
  /** Of every request together. */
  usage?: Usage;
  /** How many requests the questions went out in, when more than one (400 questions each at most). */
  requests?: number;
};

/** A describe request: instructions and the JSON Schema of the output (strict structured output). */
export type DescribeRequest = { name: string; instructions: string; schema: Record<string, unknown> };

// ---- Engines: what computes a stage ----

export interface Transcriber {
  id: string;
  transcribe(audio: Buffer): Promise<Transcript>;
}
export interface Describer {
  id: string;
  describe(evidence: Evidence, request: DescribeRequest): Promise<{ output: unknown; usage?: Usage }>;
}
export interface Decider {
  id: string;
  decide(evidence: Evidence, questions: DecisionQuestion[]): Promise<Decisions>;
}

// ---- Options ----

export type OpenAIOptions = {
  /** Default: env OPENAI_API_KEY. */
  openaiApiKey?: string;
  /** Default: env OPENAI_BASE_URL, else https://api.openai.com/v1. */
  openaiBaseUrl?: string;
  fetch?: typeof fetch;
};

export type ApinoaOptions = {
  /** Default: env APINOA_API_KEY. */
  apinoaApiKey?: string;
  fetch?: typeof fetch;
};

export type FfmpegOptions = {
  /** Default: ffmpeg. */
  ffmpegPath?: string;
  /** Default: ffprobe. */
  ffprobePath?: string;
};

/** A caller's own question about the video, or about each scene; yes/no unless it has choices. */
export type Question = { name: string; question: string; scope?: "video" | "scene"; choices?: string[] };

/** A yes/no answer, or the chosen value. */
export type Answer = boolean | string;

/** A video file (path or bytes), a TikTok post URL, or a post already read through apinoa. */
export type Input = string | Buffer | { post: Post };

export type Options = OpenAIOptions & ApinoaOptions & FfmpegOptions & {
  /** Off by default. `true` is whisper-1; or pass your own. Used only when the post has no ASR subtitle track. */
  transcribe?: boolean | Transcriber;
  describer?: Describer;
  /** Run the default describer on OpenAI's flex tier: half its price, slower. Ignored with your own `describer`. */
  flex?: boolean;
  decider?: Decider;
  /** Up to 20, at most 6 of them per scene. */
  questions?: Question[];
  /** Read the comments of a TikTok post that sells or asks for a comment. Default true. */
  comments?: boolean;
  /** An earlier result, or a failure's `partial`: stages whose version matches are taken from it. */
  reuse?: Analysis | PartialAnalysis;
  prices?: PricesOverride;
};

// ---- Layer 3: the record ----

export type Media = "video" | "photos";
export type Speech = "subtitles" | "transcription" | "none";

export const STAGES = ["source", "scenes", "frames", "speech", "describe", "decide", "comments"] as const;
export type StageName = (typeof STAGES)[number];

/** One stage of one run: its version, what it used and what it cost. */
export type StageRun = {
  version: string;
  ms: number;
  costUsd: number;
  /** Taken from `reuse`; the numbers are from the run that made it. */
  reused?: true;
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  audioSec?: number;
  apinoaCalls?: number;
  /** `describe` only: the request ran on OpenAI's flex tier, at its price. */
  serviceTier?: "flex";
  /** `source` only: `tiktok:<post id>`, or `sha256:<hex>` of a file. */
  video?: string;
  /** `speech` and `comments` only: why they are empty when they failed. */
  error?: string;
};

export type Scene = {
  index: number;
  start: number;
  end: number;
  /** false when the scene continues the take before it. */
  cut: boolean;
  role: Role;
  footage: Footage;
  /** Only when `sells` isn't none. */
  showsProduct?: boolean;
  /** What fills most of the frame; left out when it wasn't answered. */
  subject?: Subject;
  splitScreen: boolean;
  overlay: boolean;
  textBar: boolean;
  captions: boolean;
  message: boolean;
  spoken: string;
  onScreenText: string;
  /** The JPEG the model saw, as a data URL. */
  frame: string;
  answers?: Record<string, Answer>;
};

/** A comment read, with its `kind`. `id` is TikTok's, as in `raw.comments`. */
export type Comment = { id: string; text: string; likes: number; kind: CommentKind };

/** What each stage got from outside the package, before any rule. */
export type Raw = {
  post?: Post;
  subtitles?: string;
  transcript?: Transcript;
  describe?: unknown;
  decide?: Decisions;
  comments?: Apinoa.CommentPage;
  commentsDecide?: Decisions;
};

export type Analysis = {
  schemaVersion: 2;
  ok: true;
  media: Media;
  duration: number;
  speech: Speech;
  topic: Topic;
  format: Format;
  sells: Sells;
  asksForComment: boolean;
  product: string;
  tags: string[];
  description: string;
  formatDescription: string;
  scenes: Scene[];
  comments?: Comment[];
  answers?: Record<string, Answer>;
  stages: Partial<Record<StageName, StageRun>>;
  costUsd: number;
  raw: Raw;
};

/** The stages that finished before a failure, in the shape of an Analysis. */
export type PartialAnalysis = Partial<Omit<Analysis, "ok" | "scenes">> & { scenes?: Partial<Scene>[] };

export type Failed = { ok: false; error: string; partial?: PartialAnalysis };

export type { CommentKind, Footage, Format, Role, Sells, Subject, Topic };
