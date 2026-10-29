# Changelog

## 0.4.0 (2026-10-29)

A new record, `schemaVersion` 2, defined in [docs/video-analysis.md](docs/video-analysis.md). Breaking.

- The video gets `topic`, `format`, `sells`, `asksForComment` and `product`, plus `tags`, a `description` and a
  `formatDescription` in the model's words. Each scene gets a `role` (`hook`, `body`, `payoff`, `cta`), its `footage`,
  `showsProduct`, the words said and the text on screen. Beats, levers, hold, `goal`, `production`, `voice`, sections
  and `transcript` are gone.
- Two requests per video: one Responses request (`gpt-6-luna` at low reasoning effort, strict JSON schema) writes the
  text fields, then one Decisions request labels every field and scene, reading what the first wrote.
- The hook follows the content, not a fixed window. The first scene is the hook. A later scene stays in it while the
  model says so and it starts before 6 s. A take longer than 5 s is split, and its later parts get `cut: false`.
- TikTok posts are back, through `@apinoa/sdk` and `APINOA_API_KEY`: a post URL (`/video/<id>` or `/photo/<id>`), or
  `{ post }` for a post you already read. Both requests read what TikTok says about the post as evidence: the
  account, caption, hashtags, sticker text, topic labels, commercial tags, effects and sound. Photo posts are analysed
  photo by photo.
- The words come from the post's own `ASR` subtitle track. Transcription is off by default. `transcribe: true` (CLI
  `--transcribe`) runs `whisper-1` for a post without a track and for files. A file gets no words without it.
- Comments: for a post that sells or asks for a comment, one read of up to 50 top comments, without the creator's own.
  One decide request gives each a `kind` (`cta_reply`, `intent`, `negative`, `positive`, `other`), and each keeps
  TikTok's `id`. `comments: false` (CLI `--no-comments`) turns this off.
- `stages` gives each stage's version, time, usage and cost, and `costUsd` gives the run's. `PRICES` is one table, and
  the `prices` option changes it.
- `reuse`: give an earlier result and only the stages whose version changed run again. A failure returns `partial`,
  which works as `reuse`. The CLI reuses its folder.
- `transcribe`, `describer` and `decider` take an engine of your own. The defaults are `openaiTranscriber`,
  `openaiDescriber` and `openaiDecider`.
- `flex: true` (CLI `--flex`) runs the describe request on OpenAI's flex tier, at half its price, for when waiting is
  fine. When flex has no capacity, the request waits it out (OpenAI's `Retry-After`, 3 times), then runs on the
  standard tier.
- Your questions can be per scene (`scope: "scene"`) and multiple choice (`choices`): up to 20, at most 6 per scene.
  Answers go in `answers` and in each scene's `answers`.
- A 429 or 5xx reply is tried again, up to 3 times, waiting at most 60 s (5 minutes on flex).
- Frames are in the analysis as data URLs. `--json` and the MCP tool leave out them and `raw`.
- `screenVideo`, `screenCover`, `SCREEN_AT` and the CLI's `screen` command are removed.
- `shortform-analyzer` exports:
  - Removed: `BEATS`, `LEVERS`, `PRODUCTIONS`, `VOICES`.
  - New: `TOPICS`, `SELLS`, `ROLES`, `FOOTAGE`, `COMMENT_KINDS`, `STAGES`, `PRICES` and the three engines.
  - Changed: `FORMATS` holds the new formats.
  - New types: `Topic`, `Sells`, `Role`, `Footage`, `CommentKind`, `Comment`, `Answer`, `Media`, `Speech`, `Input`,
    `Post`, `Raw`, `PartialAnalysis`, `StageName`, `StageRun`, `Usage`, `Prices`, `PricesOverride`, `Transcript`,
    `Transcriber`, `Describer`, `Decider` and `EngineOptions`.
  - Removed types: `Beat`, `Lever`, `Goal`, `Production`, `Voice`, `Making`, `Section`, `Screen` and `Probs`.
- `primitives`:
  - New in Layer 1: `tiktokPostId`, `readPost`, `postMedia`, `download`, `fetchSubtitles`, `readComments`, `photoFrame`,
    `dropHallucinations`, `parseVtt`, `cueWords`, `textEvidence`, `describe`, with `BROWSER_HEADERS`, `COMMENTS_LIMIT`,
    `DESCRIBE_MODEL`, `DESCRIBE_EFFORT`, `FLEX_TIMEOUT_MS`, `FLEX_MAX_WAIT_MS` and the types `PostMedia`,
    `DescribeOptions`, `SceneEvidenceOptions` and `WordsFrom`.
  - New in Layer 2 (the record): `TAXONOMY`, `valueText`, `RECORD_QUESTIONS`, `recordQuestions`, `recordIntro`,
    `describeRequest`, `parseDescribed`, `parseRecord`, `HOOK_BEFORE`, `commentsWanted`, `commentList`,
    `commentEvidence`, `commentQuestions`, `parseComments`, `MAX_SCENE_QUESTIONS`, `MAX_CHOICES`, `MAX_TAGS`, and the
    types `Field`, `ValueText`, `RecordFacts`, `Described`, `RecordFields`, `SceneFields` and `CommentText`.
  - Removed: `frameEvidence`, `THUMB_SIDE`, `shortformQuestions`, `makingQuestions`, `SHORTFORM_INTRO`,
    `parseShortform`, `parseMaking`, `sectionsOf`, `HOLD_LEVELS`, the `*_TEXT` tables and the types `ShortformLabels`
    and `SceneLabels`.
  - Changed:
    - `resolveInput` takes a TikTok post URL or `{ post }`.
    - `transcribe` returns `{ segments, language?, usage? }`, each segment with its words and whisper's two numbers.
    - `sceneEvidence` takes the `words` and `photos` options.
    - `describe` takes `effort` and `serviceTier`.
    - A `scene` question in `decide` takes `from`.

## 0.3.1 (2026-10-26)

- Published from GitHub Actions with npm provenance under the new name. No code changes.

## 0.3.0 (2026-10-25)

- Renamed from `shortform-breakdown` to `shortform-analyzer`: the npm package, the CLI command
  (`npx shortform-analyzer analyze clip.mp4`), the MCP server, the agent skill
  (`skills/shortform-analyzer`) and the repository (`trevkang/shortform-analyzer`). The old
  package is deprecated and points here.
- The CLI and MCP write to `<file>.analysis/` (was `<file>.breakdown/`).

## 0.2.0 (2026-10-25)

- apinoa is removed (`@apinoa/sdk`, `APINOA_API_KEY`): input is a video file, a path or a `Buffer`.
  A URL fails as before, with "download the video first and pass the file".
- `primitives`: `TIKTOK_URL` is removed, `resolveInput(input)` takes no options, and
  `ResolvedInput` has no `postId`. `Options` has no `apinoaApiKey`.
- README: the how-it-works animation is now a real run on a TikTok: the timeline cut into 17
  scenes, then one decision labelling them all at once.

## 0.1.2 (2026-10-25)

- Credits: Trevor and Viktor. No code changes.

## 0.1.1 (2026-10-25)

- Published from GitHub Actions with npm provenance (trusted publishing). No code changes.

## 0.1.0 (2026-10-25)

First release.

- `analyzeVideo`, `screenVideo`, `screenCover`, `summarize`, `reportHtml` from `shortform-breakdown`.
- Building blocks and the short-form preset from `shortform-breakdown/primitives` (experimental):
  `resolveInput`, `probe`, `detectScenes`, `grabFrame`, `extractFrames`, `extractAudio`, `transcribe`,
  `alignWords`, `sceneEvidence`, `frameEvidence`, `decide`, `shortformQuestions`, `parseShortform`,
  `makingQuestions`, `parseMaking`, `sectionsOf`.
- CLI (`analyze`, `screen`, `mcp`), MCP server (`analyze_video`, `screen_video`) and an agent skill.
- `schema/analysis.schema.json` for `schemaVersion: 1`.
