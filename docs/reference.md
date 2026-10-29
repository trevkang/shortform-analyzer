# Reference

> The public contract of shortform-analyzer 0.4: entry points, inputs, options, engines, outputs, CLI, MCP server and skill. The stages and layers are explained in [concepts.md](concepts.md); the record's fields, values and rules in [video-analysis.md](video-analysis.md).


### Layers

[concepts.md](concepts.md#layers) defines them. In short:

| Layer | What | Import from | Stability |
| --- | --- | --- | --- |
| 3 · Pipeline & output | `analyzeVideo`, `summarize`, `reportHtml`, the engines, `PRICES`, CLI, MCP, skill | `shortform-analyzer` | Stable, semver |
| 2 · The record | `TAXONOMY`, `checkQuestions`, `recordIntro`, `describeRequest`, `parseDescribed`, `recordQuestions`, `parseRecord`, `commentsWanted`, `commentList`, `commentEvidence`, `commentQuestions`, `parseComments` | `shortform-analyzer/primitives` | Experimental |
| 1 · Building blocks | `resolveInput`, `tiktokPostId`, `readPost`, `postMedia`, `download`, `fetchSubtitles`, `readComments`, `probe`, `detectScenes`, `grabFrame`, `extractFrames`, `photoFrame`, `extractAudio`, `transcribe`, `dropHallucinations`, `parseVtt`, `cueWords`, `alignWords`, `sceneEvidence`, `textEvidence`, `describe`, `decide` | `shortform-analyzer/primitives` | Experimental |

Rules the code keeps:

- Each layer uses only what the layer below **exports**. `analyzeVideo` is written only from the `primitives` exports, so a caller can rebuild it (`tests/compose.test.ts`).
- ffmpeg runs and network calls happen only in Layer 1, and every network call goes through the `fetch` option.
- Fallbacks for missing answers and the record's rules live in Layer 2. `decide` and `describe` return only what the model answered.
- "Experimental" means a minor version may change a `primitives` signature. Each change goes in the changelog.

### Import

```ts
import { analyzeVideo, reportHtml, summarize } from "shortform-analyzer";

const a = await analyzeVideo("https://www.tiktok.com/@creator/video/7500726429689204010", {
  questions: [{ name: "face_on_camera", question: "Is a person's face on camera at any point?" }],
});
if (!a.ok) throw new Error(a.error);
a.format;                        // "listicle"
a.scenes[0].role;                // "hook"
a.answers?.face_on_camera;       // true
a.costUsd;                       // what this run cost
console.log(summarize(a));
await writeFile("report.html", reportHtml(a));
```

A video file works the same way, with only an OpenAI key; it has no TikTok subtitles, so turn transcription on when its words matter:

```ts
const b = await analyzeVideo("clip.mp4", { transcribe: true });
```

### Exports from `shortform-analyzer`

| Export | Does |
| --- | --- |
| `analyzeVideo(input, options?)` | The record. Returns `Analysis`, or `{ ok: false, error, partial? }` |
| `summarize(analysis)` | Text for an agent: the video fields, one line per run of scenes with the same role, the comments' kinds, the cost |
| `reportHtml(analysis, title?)` | A self-contained HTML page: the role strip, then one row per scene with its frame |
| `openaiTranscriber(o?)`, `openaiDescriber(o?)`, `openaiDecider(o?)` | The default engines. `o`: `model`, `openaiApiKey`, `openaiBaseUrl`, `fetch`; for the describer also `serviceTier: "flex"` |
| `PRICES` | The price table every cost is computed from |
| `TOPICS`, `FORMATS`, `SELLS`, `ROLES`, `FOOTAGE`, `COMMENT_KINDS`, `STAGES` and the types | The value lists, the stage names and the output types |

**One error rule:** no export from `shortform-analyzer` throws for a bad input, a missing key or an API error. `analyzeVideo` returns `{ ok: false, error, partial? }`.

### Exports from `shortform-analyzer/primitives`

| Export | Layer | Does |
| --- | --- | --- |
| `resolveInput(input)` | 1 | A path, Buffer, TikTok URL or `{ post }` → `{ kind: "file", path, cleanup() }` or `{ kind: "tiktok", postId, post? }`. A Buffer goes to a temp file that `cleanup` removes. Any other URL is refused |
| `tiktokPostId(url)` | 1 | The post id in a TikTok post URL (`/video/<id>` or `/photo/<id>`), else `undefined` |
| `readPost(postId, options?)` | 1 | One apinoa post read, through [`@apinoa/sdk`](https://www.npmjs.com/package/@apinoa/sdk) → the post (`Apinoa.Post`) |
| `postMedia(post)` | 1 | The post's links: `{ video?, photos, subtitles? }`, where `subtitles` is the `ASR` track (`{ lang, url }`) and never a translation |
| `download(url, dest, options?)` | 1 | Saves a link from the post, sent as a browser would (TikTok's links need the Referer). Throws `source: download <status>` |
| `fetchSubtitles(url, options?)` | 1 | A subtitle track's WebVTT text, sent the same way. Throws `speech: subtitles <status>` |
| `readComments(postId, options?)` | 1 | One apinoa comments read, up to 50 top comments → the reply's `data` (`Apinoa.CommentPage`) |
| `probe(video, options?)` | 1 | `{ duration, audio }` |
| `detectScenes(video, options?)` | 1 | `Span[]`. Options: `duration`, `threshold` 0.3, `minScene` 0.4, `maxTake` 5, `maxScenes` 40 |
| `grabFrame(video, t, side?)` | 1 | One JPEG Buffer at `t` seconds, long side at most `side` px (512) |
| `extractFrames(video, spans, options?)` | 1 | One JPEG per span. Options: `at` 0.5 (the middle), `side` 512 |
| `photoFrame(image, side?)` | 1 | A photo file → a JPEG Buffer, long side at most `side` px (512) |
| `extractAudio(video, options?)` | 1 | Mono 16 kHz MP3 Buffer |
| `transcribe(audio, options?)` | 1 | `whisper-1` → `Transcript` (segments with their words and whisper's two numbers) |
| `dropHallucinations(transcript)` | 1 | The transcript without the segments [video-analysis.md](video-analysis.md#speech) drops |
| `parseVtt(vtt)` | 1 | A WebVTT file → `Cue[]` |
| `cueWords(cues)` | 1 | Cues → `Word[]`: a cue's own words, else its text spread evenly over its time |
| `alignWords(words, spans)` | 1 | One string per span: the words whose midpoint falls in it |
| `sceneEvidence(spans, frames, texts, options)` | 1 | `Evidence`: per scene, its time, frame and words. Options: `duration`, `intro`, `words` (`subtitles`, `transcription` or `none`: how the words are labelled), `photos` |
| `textEvidence(intro, texts)` | 1 | `Evidence` of texts only, one item per text: `scene` questions are asked once per text |
| `describe(evidence, request, options?)` | 1 | One Responses request with a JSON schema → `{ output, usage }`. No fallbacks. Options: `model`; `effort`, the reasoning effort (`low` for gpt-6-luna, else none sent); `serviceTier: "flex"` |
| `decide(evidence, questions, options?)` | 1 | One Decisions request → `Decisions { video, scenes[], usage? }`. No fallbacks |
| `TAXONOMY` | 2 | Every decide field: its values with their tests, examples and near misses, and its rules |
| `checkQuestions(questions)` | 2 | Throws `questions:` unless the caller's questions are within the limits below |
| `recordIntro(facts, described?)` | 2 | The first lines both requests read: the length, the scene count, whether the words are known, and what TikTok says about the post, its account included. Given the describe output, the decide request's also say what it wrote |
| `describeRequest(scenes)` | 2 | `{ name, instructions, schema }` for the describe request |
| `parseDescribed(output, scenes)` | 2 | The describe output → `product`, `tags`, `description`, `formatDescription`, `onScreenText[]`, with the tag rules |
| `recordQuestions({ questions })` | 2 | The decide questions: the record's, then `q_<name>` per caller question |
| `parseRecord(decisions, facts)` | 2 | Decisions → the decide fields, with the fallbacks, the hook rule, `product` following `sells`, and the caller's answers |
| `commentsWanted(record)` | 2 | Whether a record's comments are read: `sells` isn't `none`, or `asksForComment` |
| `commentList(page, post?)` | 2 | The comments a read gives, in order, without empty ones and the creator's own → `{ id, text, likes }[]` |
| `commentEvidence(comments, record)`, `commentQuestions(record)`, `parseComments(decisions, comments)` | 2 | The comments' decide request and its answers |
| Types: `Span`, `Word`, `Cue`, `Segment`, `Transcript`, `Post`, `Evidence`, `DecisionQuestion`, `Decisions`, `DecisionAnswer`, `Usage` | 1 | `Post` is `@apinoa/sdk`'s `Apinoa.Post` |

`DecisionQuestion` is `{ type: "predicate" | "choice" | "score", name, instructions, scope?: "video" | "scene", from?, choices? | levels? }`. A `scene` question is sent once per scene as `<name>_<i>`, from scene `from` on (0, the first, by default; the record's `role` starts at 1, since the first scene is always the hook), with `{scene}` in `instructions` replaced by the scene number from 1. After that expansion a request holds 1 to 400 questions, or `decide` throws before sending. Names match `[a-z0-9_]+` and are unique. The `q_` prefix keeps a caller's question from colliding with a record field.

**Errors in `primitives`:** these functions **throw** an `Error` whose message starts with its stage (`input:`, `source:`, `video:`, `speech:`, `describe:`, `decide:`, `comments:`; `questions:` from `checkQuestions`). A missing key throws `<stage>: OPENAI_API_KEY is not set …` or `<stage>: APINOA_API_KEY is not set …` before any request.

Internal helpers (`run`, `parseCuts`, `buildScenes`, `splitLong`, `capScenes`, `hookRule`, request building) stay unexported. Tests import them from the `src/` files directly.

### Input

| `input` | What happens | Keys |
| --- | --- | --- |
| A file path, or a `Buffer` of the video's bytes | Analysed as a video. No TikTok facts, subtitles or comments | `OPENAI_API_KEY` |
| A TikTok post URL: `https://www.tiktok.com/@<handle>/video/<id>` or `/photo/<id>` | One apinoa post read, then the video or photos from its links | `OPENAI_API_KEY`, `APINOA_API_KEY` |
| `{ post }`: the `data` of an apinoa post read you already made | No read while its links are fresh (about 2 days); one read for fresh links when a download fails | `OPENAI_API_KEY`, `APINOA_API_KEY` |

Any other URL, a TikTok short link (`vm.tiktok.com`) included, fails with "input: only TikTok post URLs are read; download other videos and pass the file". Reels and Shorts go in as files.

### Options

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `openaiApiKey` | string | env `OPENAI_API_KEY` | For the default engines |
| `openaiBaseUrl` | string | env `OPENAI_BASE_URL`, else `https://api.openai.com/v1` | Azure OpenAI works through it |
| `apinoaApiKey` | string | env `APINOA_API_KEY` | For a TikTok URL or post |
| `transcribe` | boolean or `Transcriber` | `false` | `true` is `openaiTranscriber()` (`whisper-1`). Used only when the post has no `ASR` subtitle track |
| `describer` | `Describer` | `openaiDescriber()` | |
| `flex` | boolean | `false` | Runs the default describer on OpenAI's [flex tier](#flex): half its price, and minutes slower when flex is busy |
| `decider` | `Decider` | `openaiDecider()` | Also labels the comments |
| `questions` | `Question[]` | none | Up to 20, at most 6 of them per scene |
| `comments` | boolean | `true` | `false` never reads comments |
| `reuse` | `Analysis`, or a failure's `partial` | none | Stages whose version matches are taken from it ([reuse](#reuse-and-failure)) |
| `prices` | `Partial<Prices>` | `PRICES` | Merged over the table, per model |
| `ffmpegPath`, `ffprobePath` | string | `ffmpeg`, `ffprobe` | |
| `fetch` | `typeof fetch` | global fetch | Every request goes through it. Tests inject a fake |

The `primitives` functions take the same `openaiApiKey`, `openaiBaseUrl`, `apinoaApiKey`, `ffmpegPath`, `ffprobePath` and `fetch` options, with the same defaults, wherever they apply.

`Question` is `{ name, question, scope?, choices? }`:

| Field | Notes |
| --- | --- |
| `name` | Unique, `[a-z0-9_]+` |
| `question` | What to ask, about what is in the video. For `scope: "scene"`, write it about one scene ("Is a logo visible in this scene?") |
| `scope` | `video` (the default) or `scene`: asked once per scene |
| `choices` | 2 to 20 distinct values. Without it, the question is yes/no |

Each becomes the predicate or choice `q_<name>` in the record's decide request. A yes/no answer is `true` when the probability of yes is 0.5 or more; a choice answer is the most probable value. Video questions answer in `answers`, scene questions in each scene's `answers`. An unanswered question is left out. Every probability is in `raw.decide`.

**Checked first,** before any download or request: the questions are within these limits; an OpenAI key is set unless every engine that will run is your own; an apinoa key is set for a URL or a post; the input is one of the kinds above.

**Requests:** each gives up after 3 minutes; a 429 or 5xx reply is tried again up to 3 times, waiting as long as its `Retry-After` says, at most 60 s (5 minutes on [flex](#flex); else 2, 4 and 6 s). apinoa calls go through `@apinoa/sdk` with the same timeout and count, at its own waits (else about 1, 2 and 4 s).

### Engines

```ts
interface Transcriber { id: string; transcribe(audio: Buffer): Promise<Transcript> }
interface Describer { id: string; describe(evidence: Evidence, request: DescribeRequest): Promise<{ output: unknown; usage?: Usage }> }
interface Decider { id: string; decide(evidence: Evidence, questions: DecisionQuestion[]): Promise<Decisions> }

type Transcript = { segments: Segment[]; language?: string; usage?: Usage };
type Segment = { start: number; end: number; text: string; words?: Word[]; noSpeechProb?: number; avgLogprob?: number };
type DescribeRequest = { name: string; instructions: string; schema: object };   // a JSON Schema for strict structured output
type Usage = { inputTokens?: number; outputTokens?: number; audioSec?: number; costUsd?: number; serviceTier?: "flex" };
```

The `id` goes into the stage's version, so a new engine reruns its stage on reuse. When `usage.costUsd` is given, it is the stage's cost; otherwise the cost is priced from `PRICES` by `id`, and an `id` the table doesn't have costs 0.

#### Flex

`openaiDescriber({ serviceTier: "flex" })`, or the `flex` option, sends the describe request on OpenAI's
[flex tier](https://developers.openai.com/api/docs/guides/flex-processing): the same model at half the price
(`PRICES.flex`), for when waiting is fine: a reply can take minutes. When flex has no capacity, OpenAI answers 429
(not billed) with `Retry-After: 300`; the request waits that out and tries again, 3 times. Then, or when flex fails or
doesn't answer within 15 minutes, it runs on the standard tier. The `describe` stage
says `serviceTier: "flex"` when the reply came from flex. The tier isn't in the version: a result made on either is
reused. The decide request has no flex tier, and the [Batch API](https://developers.openai.com/api/docs/guides/batch)
doesn't take Decisions requests.

`PRICES` (US dollars):

| Key | Default | Unit |
| --- | --- | --- |
| `responses["gpt-6-luna"]` | `{ input: 0.10, output: 0.50 }` | per million tokens |
| `flex["gpt-6-luna"]` | `{ input: 0.05, output: 0.25 }` | per million tokens, a describe request on flex |
| `decisions["gpt-6-luna"]` | `{ input: 0.10 }` | per million input tokens; Decisions output is free |
| `transcription["whisper-1"]` | `0.006` | per minute of audio |
| `apinoa` | `0.001` | per call |

### Output

`Analysis`, the record plus how it was made:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | 2 | yes | Raised on any breaking change |
| `ok` | true | yes | |
| `media` | string | yes | `video` or `photos` |
| `duration` | number | yes | Seconds; for photos, the number of photos |
| `speech` | string | yes | `subtitles`, `transcription` or `none` |
| `topic` | string | yes | [topic](video-analysis.md#topic) |
| `format` | string | yes | [format](video-analysis.md#format) |
| `sells` | string | yes | [sells](video-analysis.md#sells) |
| `asksForComment` | boolean | yes | |
| `product` | string | yes | Empty when `sells` is `none` |
| `tags` | string[] | yes | At most 10 |
| `description` | string | yes | |
| `formatDescription` | string | yes | |
| `scenes` | Scene[] | yes | In order. Together they cover 0 to `duration`; at most 40 |
| `comments` | Comment[] | no | Present only when the comments were read |
| `answers` | object | no | Your video questions' answers, by name. Present only when you asked some |
| `stages` | object | yes | One entry per stage that ran or was reused, by name: `source`, `scenes`, `frames`, `speech`, `describe`, `decide`, `comments` |
| `costUsd` | number | yes | What this run cost: the stages that ran, not the reused ones |
| `raw` | object | yes | What each stage got from outside the package, before any rule |

`Scene`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `index` | number | yes | From 0 |
| `start`, `end` | number | yes | Seconds; for photos, the photo's index and index + 1 |
| `cut` | boolean | yes | `false` when the scene continues the take before it |
| `role` | string | yes | `hook`, `body`, `payoff`, `cta` |
| `footage` | string | yes | `camera_face`, `camera_body`, `camera_no_person`, `screen`, `graphics`, `other` |
| `showsProduct` | boolean | no | Present only when `sells` isn't `none` |
| `spoken` | string | yes | Empty when nothing is said, or when the words aren't known (`speech` is `none`) |
| `onScreenText` | string | yes | |
| `frame` | string | yes | The JPEG the model saw, as a data URL, at most 512 px |
| `answers` | object | no | Your scene questions' answers, by name |

`Comment`: `id` (string, TikTok's id for it, as in `raw.comments`), `text` (string), `likes` (number, 0 when apinoa gives none), `kind` (`cta_reply`, `intent`, `negative`, `positive`, `other`).

A `stages` entry:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | string | yes | The stage's number, then the engine's `id` (`"1:gpt-6-luna"`). For `speech`, `subtitles` when the post has an `ASR` track, else the transcriber's `id`, else `off`. For `decide`, a hash of your questions follows |
| `ms` | number | yes | How long it took. A download counts in the first stage that needs the file, usually `scenes` |
| `costUsd` | number | yes | |
| `reused` | true | no | Taken from `reuse`; its numbers are from the run that made it |
| `requests`, `inputTokens`, `outputTokens`, `images`, `audioSec`, `apinoaCalls` | number | no | What it used, when it used any |
| `serviceTier` | `"flex"` | no | `describe` only: the reply came from the flex tier |
| `video` | string | no | `source` only: `tiktok:<post id>`, or `sha256:<hex>` of a file. `reuse` is ignored for another video |
| `error` | string | no | `speech` and `comments` only: why they are empty when they failed |

`raw`: `post` (the apinoa post read, as returned), `subtitles` (the `ASR` track's WebVTT), `transcript` (the transcriber's `Transcript`, before the filter), `describe` (the describer's output), `decide` (the decider's `Decisions`, every probability), `comments` (the apinoa comments read) and `commentsDecide`. Each is present when its stage ran.

Illustrative values, not a real video (`frame` and `raw` cut short):

```json
{
  "schemaVersion": 2,
  "ok": true,
  "media": "video",
  "duration": 9.4,
  "speech": "subtitles",
  "topic": "education",
  "format": "listicle",
  "sells": "software",
  "asksForComment": true,
  "product": "Notewise",
  "tags": ["studying", "apps", "students", "notes", "recommendation"],
  "description": "A student shows two apps that help with exam revision and recommends one for turning lecture notes into flashcards.",
  "formatDescription": "Opens on her face with the claim as a text caption, then screen recordings of each app with her voice over them, and ends back on camera asking viewers to comment a keyword.",
  "scenes": [
    {
      "index": 0, "start": 0, "end": 2.1, "cut": true, "role": "hook", "footage": "camera_face", "showsProduct": false,
      "spoken": "Two apps that got me through finals.", "onScreenText": "2 apps for finals",
      "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
    },
    {
      "index": 1, "start": 2.1, "end": 6.8, "cut": true, "role": "body", "footage": "screen", "showsProduct": true,
      "spoken": "Notewise turns your lecture notes into flashcards.", "onScreenText": "Notewise",
      "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
    },
    {
      "index": 2, "start": 6.8, "end": 9.4, "cut": true, "role": "cta", "footage": "camera_face", "showsProduct": false,
      "spoken": "Comment notes and I'll send you the link.", "onScreenText": "comment NOTES",
      "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
    }
  ],
  "comments": [
    { "id": "7501862304512345601", "text": "notes", "likes": 41, "kind": "cta_reply" },
    { "id": "7501862304512345602", "text": "does it work on android?", "likes": 12, "kind": "intent" }
  ],
  "stages": {
    "source": { "version": "1", "ms": 640, "costUsd": 0.001, "apinoaCalls": 1, "video": "tiktok:7500726429689204010" },
    "scenes": { "version": "1", "ms": 410, "costUsd": 0 },
    "frames": { "version": "1", "ms": 120, "costUsd": 0 },
    "speech": { "version": "1:subtitles", "ms": 90, "costUsd": 0 },
    "describe": { "version": "1:gpt-6-luna", "ms": 3800, "costUsd": 0.00043, "requests": 1, "inputTokens": 2900, "outputTokens": 280, "images": 3 },
    "decide": { "version": "1:gpt-6-luna", "ms": 900, "costUsd": 0.00034, "requests": 1, "inputTokens": 3400, "images": 3 },
    "comments": { "version": "1:gpt-6-luna", "ms": 1500, "costUsd": 0.00105, "apinoaCalls": 1, "requests": 1, "inputTokens": 500 }
  },
  "costUsd": 0.00282,
  "raw": { "post": { "id": "7500726429689204010" }, "subtitles": "WEBVTT\n\n00:00.000 --> 00:02.100\nTwo apps that got me through finals." }
}
```

### Reuse and failure

- **Reuse.** With `reuse`, a stage is taken from it when its `version` there equals this run's, every stage it reads was taken too, and its data is there. What reads what: `scenes` reads `source`; `frames` reads `scenes`; `speech` reads `source` and `scenes`; `describe` reads `source`, `frames` and `speech`; `decide` reads those and `describe`; `comments` reads `source` and `decide`. Taken stages keep their `stages` entry, marked `reused`, and add nothing to `costUsd`. The rules always run again on the taken answers.
- **Downloads** happen only when a stage that reads the media runs (`scenes`, `frames`, or a transcription), into a temp folder removed at the end. Videos are never kept.
- **Failure:** `{ "ok": false, "error": "<one line a person can act on>", "partial": { … } }`. `partial` has the same shape as `Analysis` for the stages that finished, with their `stages` and `raw` entries; it is left out when nothing finished. A failed `speech` or `comments` stage doesn't fail the analysis: its entry's `error` says why.
- **Fallbacks:** a missing or refused decide answer falls back as [video-analysis.md](video-analysis.md#when-an-answer-is-missing) says.

### CLI

```
npx shortform-analyzer analyze <file | TikTok URL> [--out <dir>] [--transcribe] [--flex] [--no-comments] [--question name="question"]... [--json]
npx shortform-analyzer mcp
```

- `analyze` writes to `--out`. The default is `<file>.analysis/` next to a file, and `<post id>.analysis/` in the current folder for a URL. It writes:
  - `analysis.json`: the whole `Analysis`, frames and `raw` included;
  - `report.html`;
  - `frames/01.jpg` and onwards: the frames the model saw;
  - `sheet.jpg`: every frame tiled 4 wide (ffmpeg `tile`), so an agent can look at one image.
- A folder that already holds `analysis.json` for the same video is reused: only the stages whose version changed run.
- It prints `summarize()` to stdout, or with `--json` the analysis without `frame` and `raw` (both are in `analysis.json`).
- `--transcribe` turns transcription on; `--flex` runs describe on the [flex tier](#flex); `--no-comments` reads no comments.
- `--question` adds a yes/no question about the video. Choice and scene questions are for the library and the MCP tool.
- Keys: `OPENAI_API_KEY`, and `APINOA_API_KEY` for a URL.
- Exit codes: 0 ok, 1 analysis failed (the error goes to stderr), 2 usage error.

### MCP server

`shortform-analyzer mcp` runs over stdio. It is built on `@modelcontextprotocol/sdk` and zod.

| Tool | Input | Returns |
| --- | --- | --- |
| `analyze_video` | `input` (a file path or a TikTok post URL), `questions` (optional, `{ name, question, scope?, choices? }`), `transcribe` (optional, default false) | The `summarize()` text, the output folder path, and the analysis without `frame` and `raw` (base64 wastes the model's context) |

Setup lines for Claude Code, Claude Desktop and Cursor are in the README.

### Agent skill

`skills/shortform-analyzer/SKILL.md` uses the Agent Skills format: `name` and `description` frontmatter, then the body. The body covers:
- when to use it: someone wants to know how a short video is made, why it works, or how to make one like it;
- the command: `npx shortform-analyzer analyze <file or TikTok URL>`;
- reading the summary, and opening `sheet.jpg` to see the frames;
- what the fields mean (link the tables in `docs/video-analysis.md`);
- keys and costs.

The skill ships in both the npm package and the repo, so skills.sh can list it.

## Examples

Each row is pinned by a test in `tests/`. Videos are made with ffmpeg `lavfi`; OpenAI, apinoa and TikTok's links are faked at `fetch`.

| # | Case | Input | Expected |
| --- | --- | --- | --- |
| 1 | Three hard cuts | lavfi red, green, blue shots of 1.5 s each, 360x640, plus a 440 Hz tone | 3 scenes starting at 0, 1.5 and 3.0 s (within 0.1), each `cut` true. `speech` none. Calls: describe, then decide |
| 2 | Transcription on | Example 1 with `transcribe: true` | `speech` transcription; the words land in their scenes; the requests label them "automatic transcription, may be song lyrics". Calls: transcription, describe, decide |
| 3 | One long take | One 11 s shot | 3 scenes of equal length; scenes 2 and 3 have `cut` false |
| 4 | Whisper's music line | A transcript whose segment is "Thanks for watching!" with `noSpeechProb` 0.5 and `avgLogprob` -0.86 | The segment and its words are dropped, from `whisper-1` or a transcriber of your own |
| 5 | Missing or refused answers | A two-scene decide reply where `role_1` is refused and `footage_1` and `topic` are missing | Scene 2: role `body`, footage `other`; topic `other`. Scene 1 is `hook` without being asked |
| 6 | No OpenAI key | Example 1 with an empty key | ok false. The error names `OPENAI_API_KEY`. No network call |
| 7 | Unreadable file | A path that does not exist (`/nope.mp4`) | ok false. The error starts with "video:" |
| 8 | The hook rule | Scenes starting at 0, 2, 4 and 6.5 s; the reply says hook, body, hook for scenes 2–4, then a reply that says hook, hook, hook | First: hook, hook, body, then scene 4's most probable role other than hook. Second: hook, hook, hook, and scene 4 (from 6.5 s) is not hook |
| 9 | A URL that isn't a TikTok post | `https://example.com/video.mp4` | ok false: "input: only TikTok post URLs are read; download other videos and pass the file" |
| 10 | Too many questions | 21 questions; then 7 with `scope: "scene"` | ok false: "the maximum is 20"; "at most 6 per scene". No network call |
| 11 | A TikTok URL | A post with a video link, an `ASR` track and an `MT` track | Calls: apinoa post read, the video, the `ASR` track (never the `MT` one), describe, decide. `speech` subtitles. The requests read the caption, hashtags, labels, effects and sound. `stages.source.apinoaCalls` 1, `costUsd` the sum of the stages |
| 12 | An expired link | Example 11 where the first video download answers 403 | One more post read, then the fresh link. Two failures: ok false, "source: download 403" |
| 13 | Comments | Example 11 where the reply says `sells` software and `asksForComment` no; then `sells` none | First: one comments read, the creator's own left out, one decide request with a `kind` per comment and no `cta_reply` choice. Second: no comments read and no `comments` field |
| 14 | A scene question of your own (`decide`) | `decide` on Example 1's evidence with one predicate `logo`, scope `scene`, "Is a logo visible in scene {scene}?" | The request holds `logo_0`, `logo_1`, `logo_2`, their instructions name scenes 1, 2 and 3. `scenes[i].logo.probability` comes back per scene |
| 15 | Too many questions (`decide`) | `decide` on a 40-scene evidence with 11 scene-scope questions (440 after expansion) | Throws, the message starts with "decide:" and says 400. No network call |
| 16 | An answer left out (`decide`) | `decide` where the reply has no `logo_1` | `scenes[1].logo` is undefined. No fallback value |
| 17 | The parts rebuild the whole | Examples 1 and 3, once through `analyzeVideo` and once through a pipeline made from `primitives` exports | Equal records (stage times aside) |
| 18 | Scene rules as options | Example 3's 11 s take with `detectScenes(video, { maxTake: 3 })` | 4 scenes of 2.75 s. Scenes 2 to 4 have `cut: false` |
| 19 | Reuse | Example 1, then again with `reuse`; then with a new question; then with a new describer | No request; then only decide runs and `costUsd` is decide's; then describe and decide run |
| 20 | A failure keeps what finished | Example 1 where describe answers 400, then a retry with `reuse: partial` | ok false, "describe: …", `partial` holds source, scenes, frames and speech. The retry runs describe and decide only |
| 21 | Your questions | A yes/no video question and a choice question with `scope: "scene"` | Both ride in the record's decide request (`q_face`, `q_shot_0`…); answers in `answers` and each scene's `answers` |
| 22 | A photo post | A post with three photo links and no video | `media` photos, `duration` 3, scenes 0–1, 1–2, 2–3, each `cut` true; the frames are the photos; `speech` none |
| 23 | Cost | Describe reports 1,000 input and 200 output tokens, decide 2,000 input tokens, and two apinoa calls | describe $0.0002, decide $0.0002, apinoa $0.002; `costUsd` 0.0024. With `prices` changed, the new prices |
| 24 | The record matches its docs | `TAXONOMY` and the tables in `docs/video-analysis.md` | The same values, in the same order |
