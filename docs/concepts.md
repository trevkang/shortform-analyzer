# Concepts

> What shortform-analyzer is made of: one fixed record per video, the stages that fill it in, what each stage costs, and what you can change.

Implemented in 0.4.0 · Read with: [reference.md](reference.md) (the contract) and [video-analysis.md](video-analysis.md) (the record: its fields, values and rules)

## The idea

One short-form video in, one record out: what kind of video it is, what it's about, whether it sells, and scene by scene what fills the screen, what is said and written, and which part of the video each scene plays. The input is a TikTok post (a URL, or a post already read through [apinoa](https://apinoa.com)) or a video file.

Two rules shape the package:

- **What is extracted is fixed.** The record's fields, values and rules are the package's opinion ([video-analysis.md](video-analysis.md)), the same for every caller, so records from different teams and different months can be compared and searched together. You add your own questions next to the record, never into it.
- **What computes it can be swapped,** because that is where the cost is. Every stage that calls a model or a service is a function you can replace, and every result says what each stage did and cost.

The package is open source for the same reason: so the cost of understanding a video can be measured, compared and pushed down in the open.

## Stages

| Stage | What it does | Calls outside | Writes |
| --- | --- | --- | --- |
| `source` | Reads the TikTok post through apinoa, or takes the post you pass. The video or the photos are downloaded from the post's links, only when a stage that reads them runs | apinoa post read, for a URL; one more read when a link has expired | `raw.post` |
| `scenes` | Cuts the video into scenes ([cuts and takes](video-analysis.md#cuts-and-takes)); a photo post is one scene per photo | none | `media`, `duration`, each scene's `start`, `end`, `cut` |
| `frames` | One JPEG per scene, from its middle, at most 512 px | none | each scene's `frame` |
| `speech` | TikTok's own subtitles; else the transcriber, when it's on; else none ([speech](video-analysis.md#speech)) | the subtitle file (free); transcription only when on | `speech`, each scene's `spoken`, `raw.subtitles` or `raw.transcript` |
| `describe` | One request writes the text fields | one Responses request (`gpt-6-luna`) | `product`, `tags`, `description`, `formatDescription`, each scene's `onScreenText`, `raw.describe` |
| `decide` | One request picks every value, for the video and each scene, and answers your questions | one Decisions request (`gpt-6-luna`); a second when your scene questions on a long video pass its 400 questions | `topic`, `format`, `sells`, `asksForComment`, each scene's `role`, `footage`, `showsProduct`, `subject`, `splitScreen`, `overlay`, `textBar`, `captions`, `message`, `answers`, `raw.decide` |
| `comments` | Only for a TikTok post that sells or asks for a comment: one read of its top comments, and one request labels them all | apinoa comments read, one Decisions request | `comments`, `raw.comments`, `raw.commentsDecide` |

```
TikTok URL ── readPost ──┐
post you already read ───┼─ source ─ scenes ─┬─ frames ─┐
video file ──────────────┘                   └─ speech ─┴─ describe ─ decide ─┬─ the record
                                                                              └─ comments, when it sells or asks
```

Three things in this order matter:

- **Describing and deciding are separate requests.** One writes what the video shows; the other picks values from closed lists, reading the frames, the words and what the first wrote. A wrong description and a wrong label are then different bugs, and each can be measured and fixed on its own.
- **Each is one request for the whole video,** not one per scene, because a scene's role depends on the scenes around it: the same shot is a hook at 0 s and a payoff at 20 s.
- **Deciding uses OpenAI Decisions,** not a chat answer: a probability comes with every value, the answers cost no output tokens, and one request labels every scene in about a second where the same model answering as chat takes 7–18 s.

The words are given to the scenes before either request, because the model reads each scene's frame next to its words. The comments are read after the decide request, because only `sells` and `asksForComment` say whether they are worth reading.

## Cost first

### Every result says what it cost

`stages` holds one entry per stage: its version, how long it took, and what it used (requests, input and output tokens, images, seconds of audio, apinoa calls) with its cost in US dollars. `costUsd` is what this run cost. The prices are one table (`PRICES`, in `src/prices.ts`), and the `prices` option replaces any of them. An engine you pass can report its own cost; one that doesn't is priced from the table by its `id`.

### Nothing paid by default that rarely pays off

- Transcription is off: TikTok's own subtitles cover most videos with speech, and transcribing the rest mostly found song lyrics ([speech](video-analysis.md#speech)).
- One frame per scene, at most 512 px, and the same frames go to both requests.
- Comments are read only where the record says they can show intent.
- A post you already read is passed in as it is: no second read while its links are fresh (about 2 days). A download that fails reads the post once more for fresh links.

### Measured before it lands

- **`bench/`**: time, memory, requests and cost per video, also against other open-source tools.
- **`eval/`**: label accuracy against reference labels, per field.
- A change to a model, a prompt, an engine default or a scene rule shows both, before and after, in its pull request. A record change that makes a field less accurate, or a stage more expensive, says why it's worth it.

### Reuse, and what a failure keeps

Every stage has a version: a number raised whenever its code, prompt or questions change, plus the `id` of the engine that ran it (and, for `decide`, your questions). Pass an earlier result as `reuse` and a stage runs again only when its version differs, or a stage it reads ran again; the rest is taken from the earlier result, at no cost. The rules that turn answers into the record (fallbacks, the hook rule, `product` following `sells`) always run again: they cost nothing, so a rule change reaches old results without a request.

A failure returns `{ ok: false, error, partial }`, where `partial` holds every stage that finished. Pass it as `reuse` and the retry starts at the stage that failed.

The CLI does both with its folder: running it again on the same video reuses `<name>.analysis/analysis.json` and runs only what changed.

## What you can change

| Tier | What | How |
| --- | --- | --- |
| Fixed | The record: its fields, values and rules | Through this repo: an edit to [video-analysis.md](video-analysis.md) first, then the eval |
| Add | Your own questions: yes/no or a choice, about the video or each scene | `questions`. They ride in the same decide request at no extra request, and their answers go to `answers`, apart from the record |
| Swap | What computes a stage, and what it's priced at | `transcribe` (off, `whisper-1`, or your transcriber), `describer`, `flex`, `decider`, `prices`; a post object as input instead of a URL |
| Compose | Any part on its own | `shortform-analyzer/primitives` |

## Layers

```
Layer 3 · Pipeline & output   analyzeVideo · summarize · reportHtml · the engines · PRICES · CLI · MCP · skill
            uses only ↓
Layer 2 · The record          TAXONOMY · checkQuestions · recordIntro · describeRequest · parseDescribed · recordQuestions
                              parseRecord · commentsWanted · commentList · commentEvidence · commentQuestions · parseComments
            uses only ↓
Layer 1 · Building blocks     resolveInput · tiktokPostId · readPost · postMedia · download · fetchSubtitles · readComments
                              probe · detectScenes · grabFrame · extractFrames · photoFrame · extractAudio
                              transcribe · dropHallucinations · parseVtt · cueWords · alignWords
                              sceneEvidence · textEvidence · describe · decide
```

- **Layer 1** knows video, audio, apinoa and the models. It knows nothing about hooks or topics. Someone who wants chapters for a lecture, a per-scene check for a logo, or TikTok subtitles aligned to cuts uses this layer alone.
- **Layer 2** is the record as data and pure functions: the fields, values, tests and rules (`TAXONOMY`, in `src/record/taxonomy.ts`), the describe schema and decide questions made from them, and the rules that turn answers into the record. It makes no ffmpeg run or network call. `TAXONOMY` is the one source for the questions, the describe schema and the value lists in `schema/analysis.schema.json`; a test checks it against the tables in [video-analysis.md](video-analysis.md).
- **Layer 3** joins the two and never throws. `analyzeVideo` is built only from what Layers 1 and 2 export, so anyone can rebuild it, or a variant of it, from the same parts.

Imports: Layer 3, the value lists and the types come from `shortform-analyzer` (stable, semver). Layers 1 and 2 come from `shortform-analyzer/primitives` (experimental: a minor version may change them, and every change is in the changelog).

### Engines

An engine is an object with an `id` and one method. The defaults call OpenAI; pass your own to use another model, provider or price.

| Engine | Method | Default (`id`) |
| --- | --- | --- |
| `Transcriber` | `transcribe(audio)` → segments, each with its text, times and (optionally) words and whisper's two numbers | `openaiTranscriber()` (`whisper-1`), used when `transcribe: true` |
| `Describer` | `describe(evidence, request)` → the JSON the request's schema asks for | `openaiDescriber()` (`gpt-6-luna` at low reasoning effort, Responses) |
| `Decider` | `decide(evidence, questions)` → `Decisions` | `openaiDecider()` (`gpt-6-luna`, Decisions) |

Whatever an engine returns goes through the same checks: the transcript through the same filter, the describe output through its schema's fields, the answers through the record's fallbacks.

### Errors

Layer 1 and 2 functions **throw** an `Error` whose message starts with the stage: `input:`, `source:`, `video:`, `speech:`, `describe:`, `decide:`, `comments:` or `questions:`. They are parts to compose, and a caller composing them wants a stack trace. Layer 3 catches every one and returns `{ ok: false, error, partial }` with the same message. Two stages don't fail the analysis: `speech` (a failed subtitle download or transcription leaves `speech` as `none`) and `comments` (a failed read leaves `comments` out). Each says why in its `stages` entry's `error`.

## Composing your own

TikTok subtitles aligned to the cuts, with no model call:

```ts
import { alignWords, cueWords, detectScenes, download, fetchSubtitles, parseVtt, postMedia, probe, readPost } from "shortform-analyzer/primitives";

const post = await readPost("7500726429689204010");              // one apinoa call, APINOA_API_KEY
const media = postMedia(post);                                    // the video link and the ASR subtitle track
await download(media.video!, "clip.mp4");
const { duration } = await probe("clip.mp4");
const spans = await detectScenes("clip.mp4", { duration });
const vtt = await fetchSubtitles(media.subtitles!.url);
const said = alignWords(cueWords(parseVtt(vtt)), spans);           // one string per scene
```

A scene question of your own, on the same evidence as the record:

```ts
import { decide, extractFrames, sceneEvidence, type DecisionQuestion } from "shortform-analyzer/primitives";

const frames = await extractFrames("clip.mp4", spans);

const logo: DecisionQuestion = { type: "predicate", name: "logo", scope: "scene", instructions: "Is the brand logo visible in scene {scene}?" };
const d = await decide(sceneEvidence(spans, frames, said, { duration }), [logo]);
d.scenes.map((s) => s.logo?.probability);   // one probability per scene, or undefined when not answered
```

The simpler way to ask your own questions is `analyzeVideo`'s `questions`: they ride in the record's decide request.

## Words used in these docs

| Word | Means |
| --- | --- |
| Record | What `analyzeVideo` extracts: the fields in [video-analysis.md](video-analysis.md) |
| Stage | One step that fills part of the record, with its own version, usage and cost |
| Span | A time range in seconds, `{ start, end, cut? }` |
| Scene | A span plus its frame, words and labels |
| Cue | A run of words with one start and end time, from a subtitle track or a transcript segment |
| Evidence | The ordered text and images a model reads |
| DecisionQuestion | One question to the decision model: predicate, choice or score, for the video or per scene |
| Question | A caller's own question in `analyzeVideo`, `{ name, question, scope?, choices? }` |
| Decisions | What `decide` returns: answers only, no fallbacks |
| Engine | An object with an `id` that computes one stage: a transcriber, describer or decider |
| Post | The `data` of an apinoa post read (`Apinoa.Post` in `@apinoa/sdk`) |
