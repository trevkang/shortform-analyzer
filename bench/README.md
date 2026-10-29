# Benchmark

Runs shortform-analyzer and three open-source tools on the same videos with the same model
(`gpt-6-luna`), and measures time, CPU, peak memory, OpenAI requests, tokens and cost.
[`results/2026-10.json`](results/2026-10.json) is the October 2026 run, made on 0.3.1: one `whisper-1` transcription
and one Decisions request per video. From 0.4.0 a file is transcribed only with `--transcribe`, which `run.py` passes,
and a describe request runs before the Decisions request. Run it again for 0.4 numbers; the README's
[speed and cost](../README.md#speed-and-cost) come from real TikToks through the post URL instead.

| Tool | Version | What it does before the model |
| --- | --- | --- |
| shortform-analyzer | this repo (`dist/`) | Scenes, one frame per scene, `whisper-1` (`--transcribe`), then one Responses and one Decisions request |
| [claude-video-vision](https://github.com/jordanrendric/claude-video-vision) | `4a4f990` (1.4.0) | Frames at 2 fps (1 fps from 60 s), `whisper-1`, over its MCP tool `video_watch` |
| [claude-real-video](https://github.com/HUANGCHIHHUNGLeo/claude-real-video) | `ab4b9b2` | Scene-change frames, deduplicated; local Whisper `base` |
| [video-analyzer](https://github.com/byjlw/video-analyzer) | `2b095fa` | Key frames, one chat request per frame, then one more; local Whisper `medium` |

claude-video-vision and claude-real-video stop at frames and a transcript, so [`llm_step.py`](llm_step.py)
gives each one Chat Completions request with every frame and the transcript, asking for the same
breakdown. Every OpenAI request goes through [`proxy.py`](proxy.py), which logs it. Two adaptations,
both logged as `adapted`: `gpt-6-luna` rejects `temperature` and `max_tokens`, which video-analyzer sends,
so the proxy drops the first and renames the second to `max_completion_tokens`.

## Run it

Needs Node 20+, Python 3.12, [uv](https://docs.astral.sh/uv/), git, ffmpeg and `OPENAI_API_KEY`.
Everything is written under `bench/.work/` (git-ignored): about 2 GB of tools, plus a 1.5 GB Whisper
model that video-analyzer downloads to `~/.cache/huggingface`.

```bash
pnpm build                     # the CLI under test is dist/
bash bench/setup.sh            # clones the three tools at the commits above and installs them
bash bench/make-videos.sh      # three lavfi videos: 17 s, 28 s and 61 s
python3 bench/run.py --runs 2  # every tool on every video in bench/.work/videos/
python3 bench/report.py        # the table, from bench/.work/results/
```

`run.py --videos <dir>` runs your own `.mp4` files instead, `--tools ours,cvv` a subset. One run of all
four tools on the three videos costs about $0.10 and takes about 15 minutes, most of it video-analyzer.

## Read it

- **Time**: wall clock for the whole job, from the video file to the breakdown.
- **CPU**: user + system seconds, from `/usr/bin/time -l` (macOS) or `-v` (Linux).
- **Peak memory**: the largest resident set of any one process.
- **Cost**: `gpt-6-luna` $0.10 per million input tokens and $0.50 per million output tokens; Decisions
  output is free; `whisper-1` $0.006 a minute (OpenAI's list prices, October 2026). Change them in `report.py`.

Only speed, cost and resources are measured, not the quality of the labels. OpenAI's latency varies
from run to run (one 17 s video took 4.8 s and 8.8 s), so use the median of several runs.

The October 2026 numbers came from three public TikToks (a 17 s product demo, a 28 s skit with 14
cuts, a 61 s talking head) on an Apple Silicon laptop. Those videos are not in this repo;
`make-videos.sh` makes stand-ins of the same lengths.

> [!NOTE]
> The stand-ins check that every tool runs, not how fast. Each shot is one flat colour, so the tools that
> drop repeated frames (claude-real-video, video-analyzer) send only 2-15 of them. Compare on real videos:
> `--videos <dir>`.
