# How-it-works video

> [!NOTE]
> The animation shows 0.3's labels (beats, hold, sections), which 0.4.0 replaced with the record. It is out of the
> README until it is rendered again from a 0.4 analysis; `prep.mjs` and `how-it-works.src.html` still read 0.3's
> `analysis.json`.

`how-it-works.gif` (README) and `how-it-works.mp4` show a real run of `analyzeVideo` on
[Zach King's "a message to all AI"](https://www.tiktok.com/@zachking/video/7655004069190192398)
(27.9 s, 17 scenes). Every time, word and label on screen comes from that run. The video belongs
to its creator: it is credited and linked, and only the rendered GIF and MP4 are in the repo
(not the video, not `data.json`).

`how-it-works.src.html` is a `seek(t)` page (1280×720, 27.5 s) about two things: how the video
is cut into scenes on a timeline, and how one decision labels them. The video plays while
`detectScenes` cuts the timeline; then one Decisions request fills the beat and hold rows for
every scene at once, and the sections; then the playhead runs over it again, showing each
scene's labels and words. `render.mjs` is
from [Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics) (MIT). Geist
fonts: SIL Open Font License (`OFL-Geist.txt`).

To render again, with ffmpeg, `npm i playwright`, the built package and `OPENAI_API_KEY`
(`geist.b64` and `geistmono.b64` are the base64 of `Geist-Variable.woff2` and `GeistMono-Medium.woff2`):

```bash
npx shortform-analyzer analyze video.mp4 --out video.analysis
PKG=<repo> node prep.mjs video.mp4 video.analysis/analysis.json data.json
FONTS=<dir with geist.b64, geistmono.b64> node build.mjs data.json how-it-works.html
node render.mjs how-it-works.html how-it-works.mp4 30 1 6
ffmpeg -i how-it-works_silent.mp4 -vf "fps=12,scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" how-it-works.gif
```

## Why this video

The candidates, picked from the most viewed TikToks through apinoa (views on 2026-10-25, cuts
from `detectScenes`). The videos belong to their creators: credit the account and link the
post, and keep the video files out of the repo (only the rendered GIF and MP4 go in).

| Video | Views | Length | Real cuts | What it shows |
| --- | --- | --- | --- | --- |
| [Cat brush (@pet..supplies)](https://www.tiktok.com/@pet..supplies/video/7112871757157092650) | 96.3M | 17 s | 5 | The cat, the brush at work, the happy cat, then the caption "works very well": hook → value → proof → cta in plain sight. Should come out `product_demo`, `conversion` |
| [Zach King, "a message to all AI"](https://www.tiktok.com/@zachking/video/7655004069190192398) | 67.8M | 28 s | 14 | Many cuts, speech and on-screen text, but 17 scenes look busy in one GIF |
| [Khaby Lame](https://www.tiktok.com/@khaby.lame/video/7678009073421405471) | 124.5M | 31 s | 5 | No speech, so it cannot show words being given to scenes |

The most viewed TikTok, [Zach King's Hogwarts broom](https://www.tiktok.com/@zachking/video/6768504823336815877)
(2.4B), is one take with no cuts: it would only show the 5 s split, not cut detection.
