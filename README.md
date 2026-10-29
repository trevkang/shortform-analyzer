<div align="center">

# shortform-analyzer

*One fixed record per short-form video: what it is, what it sells, and what each scene does*

[![npm version](https://img.shields.io/npm/v/shortform-analyzer?style=flat-square)](https://www.npmjs.com/package/shortform-analyzer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/trevkang/shortform-analyzer/ci.yml?style=flat-square&label=CI)](https://github.com/trevkang/shortform-analyzer/actions)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Features](#features) • [Time and cost](#time-and-cost) • [Get started](#get-started) • [Usage](#usage) • [How it works](#how-it-works) • [The record](#the-record) • [Building blocks](#building-blocks)

</div>

Give it a TikTok post, or a TikTok, Reels or Shorts file, and it returns one record: the video's topic and format,
whether it sells something and what, tags, what it's about and how it's made, and scene by scene its role (hook, body,
payoff, cta), its footage, whether the product shows, the words said and the text on screen. For a post that sells or
asks for a comment, it also reads the top comments and gives each a kind. One line in Node, or a CLI, an MCP server and
an agent skill.

```ts
import { analyzeVideo, summarize } from "shortform-analyzer";

const a = await analyzeVideo("https://www.tiktok.com/@studyfetch/video/7500726429689204010");
if (a.ok) console.log(summarize(a));
```

```
tutorial about education, sells software ("StudyFetch"). 19.4 s, 6 scenes, words: TikTok's subtitles.
Tags: studyfetch, studyapp, education, lecture, studytools, notes, flashcards, practicetests, recommendation.
About: The video promotes StudyFetch as a way to turn a lecture video into detailed notes, flashcards, and practice tests. It shows a phone playing a neuroscience lecture, then generating study materials from it.
Made: A handheld phone demo filmed over a wooden floor. It opens with the phone showing a lecture video, then cuts to a closer view as the user copies and pastes material into the StudyFetch app. Subsequent shots show generated notes, flashcards, and a multiple-choice practice question. Large text overlays narrate the benefits, ending with a sticker naming the app.
  hook 0.0-3.0 s, 1 scene (camera body): "Look at this. Oh," [on screen: "I don’t have 1 hour 💀💀💀"]
  body 3.0-19.4 s, 5 scenes (camera body, product shown): "perfect. Oh, my god. Isn't it great, Chris? I know. It's my dream. I have goosebumps everywhere. This is out of this world. What a birthday!..." [on screen: "I just copy + paste / watch this... / detailed notes in seconds / it even makes ..."]
Comments: 50 read, 31 negative, 9 other, 7 positive, 3 intent.
Cost: $0.00481.
```

<sub>A real run on <a href="https://www.tiktok.com/@studyfetch/video/7500726429689204010">@studyfetch's post</a>
(the video is theirs).</sub>

## Features

- **One fixed record.** Every field, value and rule is written down in [docs/video-analysis.md](docs/video-analysis.md)
  and is the same for every video, so records compare across videos and teams. You add questions; the record stays.
- **Read from the content.** The hook ends where the video's opening ends, not at a fixed 3 seconds. Whether it sells,
  each scene's role and the format come from what is said and shown, with TikTok's own facts about the post (the
  account, caption, hashtags, sticker text, topic labels, commercial tags) as evidence.
- **TikTok posts in one call**, through [apinoa](https://apinoa.com): the post, its video or photos, its own
  subtitles, and for a post that sells or asks, up to 50 top comments, each labelled `cta_reply`, `intent`, `negative`,
  `positive` or `other`.
- **Cheap.** Two model requests per video and no transcription by default (TikTok's subtitles are free): about
  $0.0029 per post, the post read included. `flex` halves the price of the describe request.
- **Reuse.** Every stage has a version. Give an earlier result and only what changed runs again; a failure keeps what
  finished.
- **Never throws.** A bad input or a missing key comes back as `{ ok: false, error }`; a refused answer falls back to
  a stated default.
- **Yours to extend.** Up to 20 questions of your own, about the video or each scene, ride in the same request. The
  transcriber, the describer and the decider can each be your own.
- **Four ways in**: a library, a CLI, an MCP server and an agent skill. The output is `analysis.json` with a
  [JSON Schema](schema/analysis.schema.json), a one-page `report.html`, and `sheet.jpg` with every frame on one image.

## Time and cost

23 public TikToks (20 videos of 6 to 95 s and 3 photo posts; 11 with TikTok subtitles), one at a time from the post URL to the record, on a busy Apple Silicon laptop, October 2026, on the default settings:

| | p50 | p90 |
| --- | --- | --- |
| **Time per post** | 8.5 s | 12.3 s |
| ↳ post read (apinoa) | 0.1 s | 0.3 s |
| ↳ download and scenes | 1.8 s | 3.1 s |
| ↳ frames | 0.3 s | 0.9 s |
| ↳ words (subtitles) | 0.0 s | 0.2 s |
| ↳ describe request | 5.5 s | 7.8 s |
| ↳ decide request | 0.5 s | 1.0 s |
| ↳ comments, when read (8 posts) | 1.8 s | 2.4 s |
| **Cost per post** | $0.0029 | $0.0060 |

Most of the time is the describe request; the download and scene detection grow with the video's length. The post reads
were quick because apinoa had read these posts earlier that day: a first read took 1.1 s at p50 and 1.7 s at p90. Most
of the cost is the decide request and the apinoa reads; a post you already read (`{ post }`) skips the first read. With
`flex`, the describe request costs half and can take minutes. How accurate each field is: [eval/](eval/README.md). The
comparison with other tools in [bench/](bench/README.md) was measured on 0.3.1.

## Get started

You need:

- [Node.js](https://nodejs.org) 20 or later;
- `ffmpeg` and `ffprobe` on PATH (`brew install ffmpeg`, `apt install ffmpeg`), or pass `ffmpegPath` and `ffprobePath`;
- an OpenAI key in `OPENAI_API_KEY`, and for TikTok posts an [apinoa](https://apinoa.com) key in `APINOA_API_KEY`.

```bash
npm install shortform-analyzer
```

Or run it without installing:

```bash
npx shortform-analyzer analyze https://www.tiktok.com/@handle/video/<id>
```

> [!NOTE]
> A TikTok post URL (`/video/<id>` or `/photo/<id>`) is read through apinoa. Any other URL is refused, TikTok short
> links included: download a Reel or a Short and pass the file. A file has no words unless transcription is on.

## Usage

### Library

```ts
import { writeFile } from "node:fs/promises";
import { analyzeVideo, reportHtml, summarize } from "shortform-analyzer";

const a = await analyzeVideo("https://www.tiktok.com/@studyfetch/video/7500726429689204010", {
  questions: [{ name: "face_on_camera", question: "Is a person's face on camera at any point?" }],
});
if (!a.ok) throw new Error(a.error);

a.topic;        // "education"
a.format;       // "tutorial"
a.sells;        // "software", and a.product is "StudyFetch"
a.scenes[0];    // { index, start, end, cut, role: "hook", footage, showsProduct, spoken, onScreenText, frame }
a.comments;     // [{ id, text, likes, kind: "intent" }, …] when it sells or asks
a.answers;      // { face_on_camera: false }
a.costUsd;      // what this run cost
console.log(summarize(a));                       // text for an agent
await writeFile("report.html", reportHtml(a));   // one self-contained page
```

| Export | Does |
| --- | --- |
| `analyzeVideo(input, options?)` | The record. `input`: a file path, a `Buffer`, a TikTok post URL, or `{ post }` for a post you already read through apinoa |
| `summarize(analysis)` | Text for an agent: the video's fields, then one line per run of scenes with the same role |
| `reportHtml(analysis, title?)` | A self-contained HTML page: the role strip, then one row per scene, then the comments |
| `openaiTranscriber`, `openaiDescriber`, `openaiDecider` | The default engines, to configure or to replace with your own |
| `PRICES` | The price table behind `costUsd` and every stage's cost |
| `TOPICS`, `FORMATS`, `SELLS`, `ROLES`, `FOOTAGE`, `COMMENT_KINDS` | The value lists |

The main options: `transcribe` (off; `true` runs `whisper-1` for a file, or a post without subtitles), `flex`,
`comments` (on), `questions`, `reuse`, and `describer`, `decider` and `transcribe` for engines of your own. Every option
and output field is in [docs/reference.md](docs/reference.md); the output's schema is
[`schema/analysis.schema.json`](schema/analysis.schema.json) (`schemaVersion: 2`).

### CLI

```bash
npx shortform-analyzer analyze https://www.tiktok.com/@handle/video/<id>
npx shortform-analyzer analyze clip.mp4 --transcribe --question face="Is a person's face on camera?" --json
```

`analyze` prints the summary, or with `--json` the record without frames and `raw`, and writes `<post id>.analysis/`
(or `<file>.analysis/` next to a file):

- `analysis.json` and `report.html`;
- `frames/01.jpg`…: the 512 px frames the model saw;
- `sheet.jpg`: every frame tiled 4 wide, so an agent can look at one image.

Running it again on the same video reuses the folder: only the stages whose version changed run. Flags: `--out`,
`--transcribe`, `--flex`, `--no-comments`, `--question name="question"` (yes/no, repeatable), `--json`. Exit codes: 0
ok, 1 the analysis failed (the reason is on stderr), 2 a usage error.

### MCP server

Claude Code:

```bash
claude mcp add shortform-analyzer -e OPENAI_API_KEY=sk-... -e APINOA_API_KEY=... -- npx -y shortform-analyzer mcp
```

Claude Desktop, Cursor and other clients:

```json
{
  "mcpServers": {
    "shortform-analyzer": {
      "command": "npx",
      "args": ["-y", "shortform-analyzer", "mcp"],
      "env": { "OPENAI_API_KEY": "sk-...", "APINOA_API_KEY": "..." }
    }
  }
}
```

| Tool | Input | Returns |
| --- | --- | --- |
| `analyze_video` | `input` (a file path or a TikTok post URL), `questions` (optional: yes/no or a choice, about the video or each scene), `transcribe` (optional) | The summary, the output folder, and the record without frames and `raw` |

### Agent skill

[`skills/shortform-analyzer/SKILL.md`](skills/shortform-analyzer/SKILL.md) teaches an agent when to run it and how to
read the result. It ships in the npm package too.

```bash
npx skills add trevkang/shortform-analyzer
```

## How it works

| Stage | What happens | Calls |
| --- | --- | --- |
| `source` | Reads the TikTok post through apinoa, or takes the post you pass | apinoa post read |
| `scenes` | ffmpeg finds the cuts. Flashes under 0.4 s join the scene before; a take over 5 s is split, so a one-take video still has a beginning, middle and end | none |
| `frames` | The middle frame of every scene, 512 px | none |
| `speech` | The post's own subtitles, each word given to the scene its midpoint falls in. Transcription only when it's on | the subtitle file |
| `describe` | One request writes the product, the tags, what the video is about and how it's made, and each scene's text on screen | OpenAI Responses |
| `decide` | One request picks every value, for the video and each scene, reading what describe wrote next to the frames and words, and answers your questions | OpenAI Decisions |
| `comments` | For a post that sells or asks: its top comments, and one request gives each a kind | apinoa comments read, OpenAI Decisions |

Then code applies the rules: the fallback for a refused answer, the hook rule, and `product` following `sells`.

Describing and deciding are two requests: one writes what the video shows in its own words, the other picks each value
from a closed list, with a probability. A wrong description and a wrong label are then different bugs, and a change to
the labels reruns only the decide request. The decide request covers the whole video at once, because a scene's role
depends on its neighbours: the same shot is a hook at 0 s and a payoff at 20 s. The stages and layers are explained in
[docs/concepts.md](docs/concepts.md).

## The record

| Field | Values |
| --- | --- |
| `topic` | `beauty` · `fashion` · `gaming` · `tech` · `education` · `business_money` · `entertainment` · `music_dance` · `food` · `fitness_sports` · `shopping` · `lifestyle` · `other` |
| `format` | `tutorial` · `listicle` · `before_after` · `review` · `storytime` · `skit` · `performance` · `reaction` · `highlight` · `interview` · `vlog` · `talking_head` · `other` |
| `sells` | `none` · `software` · `physical_goods` · `service` · `digital_content` · `other` |
| `asksForComment` | yes or no |
| A scene's `role` | `hook` · `body` · `payoff` · `cta` |
| A scene's `footage` | `camera_face` · `camera_body` · `camera_no_person` · `screen` · `graphics` · `other` |
| A scene's `showsProduct` | yes or no, when the video sells |
| A comment's `kind` | `cta_reply` · `intent` · `negative` · `positive` · `other` |

The model writes the rest in its own words: `product`, `tags`, `description`, `formatDescription` and each scene's
`onScreenText`. Each value's test, example and near misses, and what happens when an answer is missing, are in
[docs/video-analysis.md](docs/video-analysis.md).

## Building blocks

Every step is public from `shortform-analyzer/primitives`.

> [!WARNING]
> This subpath is experimental: a minor version may change a signature. Every change is in [CHANGELOG.md](CHANGELOG.md).

TikTok subtitles aligned to the cuts, with no model call:

```ts
import { alignWords, cueWords, detectScenes, download, fetchSubtitles, parseVtt, postMedia, probe, readPost } from "shortform-analyzer/primitives";

const post = await readPost("7500726429689204010");   // one apinoa call, APINOA_API_KEY
const media = postMedia(post);                         // the video link and the ASR subtitle track
await download(media.video!, "clip.mp4");
const { duration } = await probe("clip.mp4");
const spans = await detectScenes("clip.mp4", { duration });
const said = alignWords(cueWords(parseVtt(await fetchSubtitles(media.subtitles!.url))), spans); // one string per scene
```

A question of your own, asked of every scene:

```ts
import { decide, extractFrames, sceneEvidence, type DecisionQuestion } from "shortform-analyzer/primitives";

const frames = await extractFrames("clip.mp4", spans);
const logo: DecisionQuestion = { type: "predicate", name: "logo", scope: "scene", instructions: "Is the brand logo visible in scene {scene}?" };
const d = await decide(sceneEvidence(spans, frames, said, { duration, words: "subtitles" }), [logo]);
const logoShown = d.scenes.map((s) => (s.logo?.probability ?? 0.5) >= 0.5);
```

`decide` takes `predicate` (a probability), `choice` (one of your values, with probabilities) and `score` questions,
for the whole video or per scene, up to 400 per request. It returns only what the model answered: a refused answer is
absent, and you choose the fallback. The building blocks throw an `Error` that names the stage (`source:`, `video:`,
`speech:`, `describe:`, `decide:`); `analyzeVideo` never throws.

## Keys and costs

- OpenAI, on `OPENAI_API_KEY`: one Responses and one Decisions request per video, and one more Decisions request when
  comments are read. `whisper-1` per minute of audio when transcription is on.
- apinoa, on `APINOA_API_KEY`: $0.001 per post read and per comments read.
- `costUsd` says what each run cost, from the `PRICES` table. There is no telemetry; the keys go only to OpenAI and
  apinoa.

> [!IMPORTANT]
> Analyse your own videos, or videos you have the right to analyse.

## Development

```bash
pnpm install
pnpm test           # builds, then runs every test (videos are made with ffmpeg lavfi; no network)
pnpm typecheck
pnpm test:consumer  # installs the packed tarball into a blank project and imports it
```

Start with [docs/concepts.md](docs/concepts.md); a change starts as a doc edit, then a test, then the code. A change to
a prompt or a model runs [eval/](eval/README.md) before and after.

## Credits

Built by [Trevor](https://github.com/trevkang) and [Viktor](https://github.com/Reblexis). It started as the video
analysis module of viral-oracle, their team project at the Omnara hackathon (October 2026).
