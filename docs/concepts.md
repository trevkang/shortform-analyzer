# Concepts

> What shortform-analyzer is made of: four building blocks that any video tool can use on their own, a short-form preset that turns them into a breakdown, and the pipeline that runs both in one call.

Implemented in 0.1.0 · Read with: [reference.md](reference.md) (the contract) and [video-analysis.md](video-analysis.md) (the labels and thresholds)

## The idea

A short-form analysis is four steps:

1. Cut the video into **scenes**.
2. **Transcribe** it, with a time for every word.
3. Take each scene's **middle frame**, put it next to the words said in that scene, and ask the **decision model** questions about every scene in one request.
4. **Assemble** the answers into metadata per scene and for the whole video.

None of the first three steps knows about short-form video. Only the questions do. So the package keeps them apart:

```
Layer 3 · Pipeline & output        analyzeVideo · screenVideo · screenCover · summarize · reportHtml · CLI · MCP · skill
            uses only ↓
Layer 2 · Short-form preset        shortformQuestions · parseShortform · makingQuestions · parseMaking · sectionsOf · label sets
            uses only ↓
Layer 1 · Building blocks          resolveInput · probe · detectScenes · grabFrame · extractFrames · extractAudio
                                   transcribe · alignWords · sceneEvidence · frameEvidence · decide
```

- **Layer 1** knows video, audio and the decision model. It knows nothing about hooks or CTAs. Someone who wants chapters for a lecture, a per-scene check for a brand logo, or only word-timed transcripts per scene uses this layer alone.
- **Layer 2** is one set of questions and how to read their answers: beats, levers, hold, format, production, voice. It makes no ffmpeg or network calls.
- **Layer 3** joins the two and never fails by throwing. `analyzeVideo` is built only from what Layers 1 and 2 export, so anyone can rebuild it, or a variant of it, from the same parts.

Imports: Layer 3 and the label sets come from `shortform-analyzer` (stable, semver). Layers 1 and 2 come from `shortform-analyzer/primitives` (experimental: they may change in a minor version until 1.0 of that subpath, and every change is listed in the changelog).

## The data flow

```
input (path | Buffer)
  │ resolveInput
  ▼
video file ──probe──▶ { duration, audio }
  │
  ├─detectScenes──▶ Span[] ──┬─extractFrames──▶ JPEG per scene (512 px for the model, 160 px for thumbnails)
  │                          │
  └─extractAudio─▶ transcribe─▶ Transcript { text, words[] } ──alignWords(words, spans)──▶ text per scene
                             │
                             ▼
              sceneEvidence(spans, frames, texts) ──▶ Evidence
                                                        │
                            DecisionQuestion[] ─────────┤  (Layer 2: shortformQuestions, or your own)
                                                        ▼
                                                     decide ──▶ Decisions { video, scenes[] }
                                                                   │
                                                                   ▼ Layer 2: parseShortform, sectionsOf
                                                                Analysis
```

The order matters in one place: the transcript must be aligned to the scenes **before** the decision, because the model reads each scene's words next to its frame. The decision is not a step that runs per scene and gets merged later. It is one request over the whole video, because a scene's role depends on the scenes around it: the same shot is a hook at 0 s and a payoff at 20 s.

## Building blocks (Layer 1)

### Span and scene

A **span** is `{ start, end, cut? }` in seconds. Spans from `detectScenes` are in order, do not overlap, and together cover 0 to the video's duration. `cut: false` marks a span that continues the take before it.

`detectScenes(video, options)` finds cuts with ffmpeg's scene-change score on RGB frames, then applies three rules, each an option:

| Option | Default | Rule |
| --- | --- | --- |
| `threshold` | 0.3 | A frame whose scene score is above this starts a new scene |
| `minScene` | 0.4 s | A shorter scene is a transition and joins the one before it |
| `maxTake` | 5 s | A longer take is split into equal parts of at most this length (`cut: false`), so a one-take video still has a beginning, middle and end |
| `maxScenes` | 40 | Past this, the shortest neighbours merge, so one decision request stays within limits |

A **scene** is a span plus what was found in it. Layer 1 never builds a `Scene`; Layer 2 does.

### Frame

`grabFrame(video, t, side?, options?)` returns one JPEG whose long side is at most `side` px. `extractFrames(video, spans, { at, side })` returns one per span, at `start + at × (end − start)`; `at` defaults to 0.5, the middle. The middle is the default because the first and last frames of a scene are often mid-transition.

### Transcript and alignment

`transcribe(audio)` sends the audio to OpenAI `whisper-1` and returns `{ text, words[], language? }`, each word with `start` and `end`. It drops what whisper writes on music-only audio ("Thanks for watching!"; the thresholds are in [video-analysis.md](video-analysis.md)).

`alignWords(words, spans)` returns one string per span: the words whose midpoint falls in it. A word past the last span goes to the last span. A word is never split between scenes and never appears twice.

### Evidence

**Evidence** is what the decision model sees, in order: an intro line, then one block per item, each a text, an image or both.

- `sceneEvidence(spans, frames, texts, { duration, intro? })`: per scene, its time and share of the video, whether it continues the take before it, its frame, and what is said in it ("Nothing said." when empty). `{duration}` and `{scenes}` in `intro` become the video's length and scene count. The default intro (`SCENE_INTRO`) says "A video"; the preset's (`SHORTFORM_INTRO`) says "A short-form social video".
- `frameEvidence(frames, intro)`: frames only, no time and no words. The screen check uses it.

### Decision

`decide(evidence, questions, options)` sends one request to OpenAI Decisions (`gpt-6-luna`) and returns what came back, with no fallbacks.

A **DecisionQuestion** is one of:

| `type` | Extra field | Answer |
| --- | --- | --- |
| `predicate` | none | `{ probability }` of yes |
| `choice` | `choices: { value, description? }[]` | `{ choice, probs }` |
| `score` | `levels: { label, description? }[]` | `{ score }`, from 0 to `levels.length − 1`, probability-weighted |

Each question has a `name` (`[a-z0-9_]+`, unique), `instructions`, and a `scope`:

- `video` (the default): asked once. The answer lands in `decisions.video[name]`.
- `scene`: asked once per scene, as `<name>_<i>`, with `{scene}` in the instructions replaced by the scene's number from 1. The answers land in `decisions.scenes[i][name]`.

The request sends every `scene` question scene by scene first, then the `video` questions. A question the model refused or left out, or a choice it did not offer, is **absent** from the result. Deciding what an absent answer means belongs to whoever wrote the question, which is why fallbacks live in Layer 2. After `scene` questions are expanded, a request must hold 1 to 400 questions, or `decide` throws before sending anything.

A successful HTTP response must contain a JSON object; `answers` may be omitted or an array.
Invalid JSON or a malformed response envelope throws `decide: invalid response …`.
Malformed individual answers are absent, as are predicates outside 0 to 1 and scores outside
0 to `levels.length - 1` (including non-finite numbers). Invalid choice probability entries are
ignored; a valid choice still survives without probabilities. Missing and refused answers keep
their usual fallbacks in Layer 2.

```ts
import { decide, sceneEvidence } from "shortform-analyzer/primitives";

const d = await decide(sceneEvidence(spans, frames, texts, { duration }), [
  { type: "predicate", name: "logo", scope: "scene", instructions: "Is the brand logo visible in scene {scene}?" },
]);
d.scenes.map((s) => s.logo?.probability);   // one probability per scene, or undefined
```

### Shared options and errors

Every Layer 1 function that runs ffmpeg takes `ffmpegPath` and `ffprobePath`. Every one that calls OpenAI takes `openaiApiKey` (default: env `OPENAI_API_KEY`), `openaiBaseUrl` (default: env `OPENAI_BASE_URL`, else `https://api.openai.com/v1`; Azure works through it) and `fetch`.

Layer 1 functions **throw** an `Error` whose message starts with the stage: `input:`, `video:`, `transcribe:` or `decide:` (a missing key is `decide: OPENAI_API_KEY is not set …`). Layer 2's `checkQuestions` throws `questions:`. They are parts to compose, and a caller composing them wants a stack trace. Layer 3 catches every one and returns `{ ok: false, error }` with the same message.

## Short-form preset (Layer 2)

The preset is a list of plain `DecisionQuestion`s:

| Name | Scope | Type | Fallback when absent |
| --- | --- | --- | --- |
| `beat` | scene | choice: hook, setup, value, proof, payoff, cta | `value` |
| `lever` | scene | choice: curiosity, pattern_interrupt, relatable, demonstration, social_proof, emotion, direct_ask, none | `none` |
| `hold` | scene | score: scroll, weak, average, strong, gripping (0 to 4) | 2 |
| `text` | scene | predicate: text on screen | left out |
| `format` | video | choice: the 11 formats | `other` |
| `sells` | video | predicate: asks the viewer to buy, sign up or click | 0 |
| `production` | video | choice: the 7 productions | `mixed` |
| `voice` | video | choice: the 4 voices | `none` |
| `q_<name>` | video | predicate: each of the caller's own questions | 0.5 |

What each label means is in [video-analysis.md](video-analysis.md).

- `shortformQuestions({ questions })` returns all of these. Both it and `makingQuestions` call `checkQuestions` (at most 20, unique `[a-z0-9_]+` names). `makingQuestions({ questions })` returns only `production`, `voice` and the caller's questions, for the screen check.
- `parseShortform(decisions, questions)` applies the fallbacks. It returns per scene `beat`, `beatProbs`, `lever`, `leverProbs`, `hold`, `textOnScreen`, and for the video `format`, `formatProbs`, `sells`, `goal` (`conversion` when `sells` ≥ 0.5, else `awareness`), `production`, `voice` and `answers`. `parseMaking` does the same for the screen check.
- `sectionsOf(scenes)` joins consecutive scenes with the same beat into a **section**: `{ beat, start, end, scenes, transcript }`.

To change the preset, write the questions you want, keep the ones you like with `shortformQuestions().filter(...)`, and parse the answers yourself.

## Pipeline and output (Layer 3)

| Function | Steps |
| --- | --- |
| `analyzeVideo(input, options)` | resolveInput → probe → detectScenes → extractFrames (512 px and 160 px) → extractAudio → transcribe → alignWords → sceneEvidence → decide(shortformQuestions) → parseShortform → sectionsOf → `Analysis` |
| `screenVideo(input, questions, options)` | resolveInput → probe → grabFrame at 15, 50 and 85 percent → frameEvidence → decide(makingQuestions) → parseMaking → `{ ok: true, production, voice, answers }` |
| `screenCover(image, questions, options)` | frameEvidence of one image → decide(makingQuestions) → parseMaking |
| `summarize(analysis)` | Text for an agent: format, goal, scene count, production, then one line per section |
| `reportHtml(analysis, title?)` | One self-contained HTML page |

Layer 3 adds three rules on top of the parts:

- **One error rule.** It never throws. A bad input, a missing key or an API error returns `{ ok: false, error }`, and it never returns a partial `Analysis`.
- **Speech is optional.** No audio track, or a failed transcription, gives empty transcripts plus `transcriptError`, and the decision still runs on the frames.
- **Limits are checked first.** At most 20 caller questions, a key present, and a supported input, all checked before any ffmpeg run or request.

The CLI, the MCP server and the skill are thin wrappers over Layer 3. The field tables for `Analysis`, `Scene` and `Section` are in [reference.md](reference.md#output), and the JSON Schema is `schema/analysis.schema.json`.

## Composing your own

Only scenes and words per scene, no model call:

```ts
import { probe, detectScenes, extractAudio, transcribe, alignWords } from "shortform-analyzer/primitives";

const { duration } = await probe("talk.mp4");
const spans = await detectScenes("talk.mp4", { duration, maxTake: 30 });
const { words } = await transcribe(await extractAudio("talk.mp4"));
const texts = alignWords(words, spans);
```

The preset plus a scene question of your own:

```ts
import { shortformQuestions, parseShortform, decide, sceneEvidence, type DecisionQuestion } from "shortform-analyzer/primitives";

const questions: DecisionQuestion[] = [
  ...shortformQuestions(),
  { type: "predicate", name: "product", scope: "scene", instructions: "Is the product visible in scene {scene}?" },
];
const d = await decide(sceneEvidence(spans, frames, texts, { duration }), questions);
const labels = parseShortform(d);
const productPerScene = d.scenes.map((s) => s.product?.probability ?? 0.5);
```

## Words used in these docs

| Word | Means |
| --- | --- |
| Span | A time range in seconds, `{ start, end, cut? }` |
| Scene | A span plus its frame, words and labels |
| Section | Consecutive scenes with the same beat |
| Evidence | The ordered text and images the decision model reads |
| DecisionQuestion | One question to the decision model: predicate, choice or score, for the video or per scene |
| Question | A caller's own yes/no question in `analyzeVideo`, `{ name, question }`; it becomes the `q_<name>` predicate |
| Decisions | What `decide` returns, answers only, no fallbacks |
| Preset | A set of DecisionQuestions with a parser that applies fallbacks; the short-form preset is the only one in v1 |
| Analysis | What `analyzeVideo` returns |
