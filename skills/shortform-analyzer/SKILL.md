---
name: shortform-analyzer
description: Analyze a short-form video (a TikTok post URL, or a TikTok, Reels or Shorts file) into one fixed record - its topic, format, whether it sells something and what, tags, what it's about and how it's made, and scene by scene its role (hook, body, payoff, cta), footage, what fills the frame, its layout (split screen, overlay, text bar), whether it has captions or a message, words and text on screen; for a TikTok post that sells or asks for a comment, its top comments with a kind each. Use when someone wants to know what a short video is, how it is built, what it pitches, or how viewers reacted.
---

# shortform-analyzer

## When to use it

Someone hands you a short video (a TikTok link or a file) and asks what it is, how it's built (its hook, its structure,
its call to action), whether it sells something, how viewers reacted in the comments, or how to make one like it. Also
for questions of your own about the video or each scene.

## Run it

```bash
npx shortform-analyzer analyze https://www.tiktok.com/@handle/video/<id>
npx shortform-analyzer analyze clip.mp4 --transcribe
npx shortform-analyzer analyze clip.mp4 --question face="Is a person's face on camera at any point?"
```

Needs `ffmpeg` and `ffprobe` on PATH, `OPENAI_API_KEY`, and `APINOA_API_KEY` for a TikTok URL. Other links, TikTok
short links included, are refused: download Reels and Shorts and pass the file. A TikTok post's words come from its
own subtitles. A file, or a post without subtitles, has no words unless you add `--transcribe`. It takes about
9 seconds for a TikTok post, 12 for a long one.

## Read the result

`analyze` prints a summary and writes `<post id>.analysis/` (or `<file>.analysis/` next to a file):

- the first line: format, topic, what it sells, whether it asks for a comment, length, scene count, and where the
  words came from;
- `Tags`, `About` (what it's about) and `Made` (how it's made);
- one line per run of scenes with the same role: the role, the time, the footage, what fills the frame, the layout
  and text that show (split screen, overlay, text bar, captions, message), and what is said and shown;
- for a post that sells or asks: how many comments were read, and how many of each kind;
- `sheet.jpg`: every scene's frame on one image, 4 wide. **Open it** to see what is shown, not only what is said;
- `analysis.json`: the whole record, every probability in `raw.decide`;
- `report.html`: a page for a person to read.

When you explain a video, lead with the hook (what its first scenes say and show), then the structure (the roles in
order), then the ask and what the comments say. Quote the words; don't invent what the video says. When the words
aren't known (`speech` is `none`), say so instead of guessing them from the frames.

## What the labels mean

The fields, their values and their rules are in
[docs/video-analysis.md](https://github.com/trevkang/shortform-analyzer/blob/main/docs/video-analysis.md). A label is
the model's most probable value; the probabilities are in `raw.decide`.

## Keys and costs

- OpenAI: one Responses and one Decisions request per video, and one more Decisions request when comments are read.
  `--transcribe` adds `whisper-1`, billed per minute of audio; `--flex` halves the Responses request's price and makes
  it slower.
- apinoa: one post read per TikTok URL, and one comments read for a post that sells or asks ($0.001 each).
- About $0.0029 a video in all, $0.0060 for a long one with comments.
- Analyse only videos you have the right to analyse.
