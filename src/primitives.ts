// shortform-analyzer/primitives: Layers 1 and 2 (docs/concepts.md). Experimental: a minor version may change these.

// Layer 1 · building blocks
export { resolveInput, tiktokPostId, type ResolvedInput } from "./blocks/input.js";
export {
  BROWSER_HEADERS, COMMENTS_LIMIT, download, fetchSubtitles, postMedia, readComments, readPost, type PostMedia,
} from "./blocks/apinoa.js";
export { probe } from "./blocks/probe.js";
export { detectScenes, MAX_SCENES, MAX_TAKE, MIN_SCENE, SCENE_THRESHOLD, type SceneOptions, type SceneRules } from "./blocks/scenes.js";
export { extractFrames, FRAME_SIDE, grabFrame, photoFrame, type FrameOptions } from "./blocks/frames.js";
export { dropHallucinations, extractAudio, transcribe, TRANSCRIBE_MODEL } from "./blocks/transcribe.js";
export { cueWords, parseVtt } from "./blocks/vtt.js";
export { alignWords } from "./blocks/align.js";
export { SCENE_INTRO, sceneEvidence, textEvidence, type SceneEvidenceOptions, type WordsFrom } from "./blocks/evidence.js";
export { describe, DESCRIBE_EFFORT, DESCRIBE_MODEL, FLEX_MAX_WAIT_MS, FLEX_TIMEOUT_MS, type DescribeOptions } from "./blocks/describe.js";
export { decide, DECISIONS_MODEL, MAX_DECISION_QUESTIONS } from "./blocks/decide.js";

// Layer 2 · the record
export {
  COMMENT_KINDS, FOOTAGE, FORMATS, ROLES, SELLS, SUBJECTS, TAXONOMY, TOPICS, valueText, type Field, type ValueText,
} from "./record/taxonomy.js";
export {
  checkQuestions, MAX_CHOICES, MAX_QUESTIONS, MAX_SCENE_QUESTIONS, RECORD_QUESTIONS, recordQuestions,
} from "./record/questions.js";
export { recordIntro, type RecordFacts } from "./record/intro.js";
export { describeRequest, MAX_TAGS, parseDescribed, type Described } from "./record/describe.js";
export { HOOK_BEFORE, parseRecord, type RecordFields, type SceneFields } from "./record/parse.js";
export { commentEvidence, commentList, commentQuestions, commentsWanted, parseComments, type CommentText } from "./record/comments.js";

export * from "./types.js";
