// shortform-analyzer: Layer 3, the value lists and the types (stable). Building blocks: shortform-analyzer/primitives.
export { analyzeVideo } from "./pipeline/analyze.js";
export { openaiDecider, openaiDescriber, openaiTranscriber, type EngineOptions } from "./pipeline/engines.js";
export { reportHtml } from "./pipeline/report.js";
export { summarize } from "./pipeline/summary.js";
export { PRICES, type Prices, type PricesOverride } from "./prices.js";
export { COMMENT_KINDS, FOOTAGE, FORMATS, ROLES, SELLS, TOPICS } from "./record/taxonomy.js";
export { STAGES } from "./types.js";
export type {
  Analysis, Answer, Comment, CommentKind, Decider, Describer, Failed, Footage, Format, Input, Media, Options, PartialAnalysis,
  Post, Question, Raw, Role, Scene, Sells, Speech, StageName, StageRun, Topic, Transcriber, Transcript, Usage,
} from "./types.js";
