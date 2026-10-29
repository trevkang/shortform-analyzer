# Eval

How often the record's labels match reference labels, field by field. [`bench/`](../bench/README.md)
measures speed and cost; this measures accuracy.

## Run it

```bash
pnpm build
# Analyse each post (OPENAI_API_KEY, APINOA_API_KEY): one folder per post, <id>.analysis/
while read -r id; do
  node dist/cli.js analyze "https://www.tiktok.com/@_/video/$id" --out "out/$id.analysis" > /dev/null
done < ids.txt
node eval/score.mjs labels/ out/        # the table, then every miss
node eval/score.mjs labels/ out/ --json
```

A change to a model, a prompt or a rule runs it before and after, and its pull request shows both tables. Running
the same folder again reuses what didn't change, so only the changed stages make requests.

## Reference labels

One file per post, `labels/<post id>.json`, labelled from the same evidence the model gets: the post's facts, one
frame per scene and the words in each scene. Don't look at the record while labelling.

```json
{
  "topic": "education", "format": "tutorial", "sells": "software", "product": "StudyFetch", "asksForComment": false,
  "scenes": [{ "role": "hook", "footage": "screen", "showsProduct": true }],
  "comments": { "7432114906157491000": "intent", "7432118830426358000": "positive" },
  "unsure": { "format": "review was close: it compares two apps" }
}
```

- `scenes`: one entry per scene of the analysis, in order. `showsProduct` is `null` when `sells` is `none`.
- `comments`: the kind of each comment, by the comment's `id`. Only the comments a run read are scored: a later run
  can read them in another order, or read others. Leave it out when no comments were read.
- `unsure`: each label where a second value was close, with why, keyed `format`, `scenes[2].role` or
  `comments.<id>`. The scores are given twice: on every label, and on the labels not marked unsure.
- A `product` matches when most of the reference's names are found in the analysis's, a name being found when either
  contains the other. Names are split on commas and "and", ignoring case. It is scored only when both sides sell.

## How steady each field is

`repeat.mjs` analyses each video again, `--runs` times, from the analysis's own frames and words: each run describes
it again and asks the decide request with the candidate scene facets of [`candidates.mjs`](candidates.mjs) in it
(`voice`, `layout`, `shot` and `text`, which aren't in the record). Decide alone wouldn't move: OpenAI's Decisions
answered 5 runs of the same evidence identically, to the probability, on all 36 posts tried. `stability.mjs` reports per
field how often every run agrees, how often two runs agree, the values that trade places and how often the two most
probable values were within 0.2 (a near tie), and with labels each run's accuracy and the majority's. A field that keeps
changing, or keeps nearly tying between the same two values, has values that overlap.

```bash
node eval/repeat.mjs out/ --runs 5       # OPENAI_API_KEY; writes out/<id>.analysis/repeats.json
node eval/stability.mjs out/ labels/     # the table, then every miss of the majority
node eval/stability.mjs out/ labels/ --json
```

A candidate's label goes in its scene, next to `role` and `footage`: `"voice": "off_frame"`, `"layout": "full"`,
`"shot": "app"`, `"text": "captions"`. `role` is compared from scene 2, since scene 1 is the hook by rule.

## Results, 0.4.0

The release build on 23 public TikToks (20 videos of 6 to 95 s and 3 photo posts, 11 with TikTok subtitles, from app,
study, skincare, fragrance, game and dance accounts), October 2026, default settings. A separate Claude agent wrote the
reference labels, blind to the record, from the evidence the model gets. They aren't people's labels: read the table
as agreement with a careful second reader. The posts and labels aren't in the repo.

| Field | Labels | Agree | On labels marked sure |
| --- | --- | --- | --- |
| `topic` | 23 | 96% | 100% of 18 |
| `format` | 23 | 78% | 100% of 9 |
| `sells` | 23 | 65% | 100% of 10 |
| `asksForComment` | 23 | 91% | 95% of 20 |
| `product` (when both sell) | 5 | 100% | 100% of 5 |
| a scene's `role` | 215 | 90% | 94% of 187 |
| a scene's `footage` | 215 | 93% | 95% of 187 |
| a scene's `showsProduct` (when both sell) | 70 | 76% | 75% of 67 |
| a comment's `kind` | 254 | 70% | 74% of 212 |

- **Noise.** Two runs of the same build differed by up to 8 points on `format` and 4 on `sells`, and the comments a
  run reads change as a post gets new ones. A smaller difference between two builds is noise.
- **Misses.** Most are on labels the reference marked unsure: for `sells`, several products ranked, a product named only
  in the caption, a creator's own treatments. One clear miss: an app shown without its name, posted by the app's own
  account with only an ad tag, stays `none` (0.54 against 0.37 for `software`).
- **What this eval changed in 0.4.0,** on the same posts, from the first 0.4.0 build to the release:
  - `sells` counts a post with a commercial tag or from the product's own account: 57% to 65–70% across two runs,
    and 90% to 100% on labels marked sure.
  - Comment kinds (`intent` only when the video sells, pushback is `negative`, off-topic is `other`): 63% to 70–75%.
  - `showsProduct` counts the packaging, the screen and the product in use: 71% to 76% on the same 70 scenes.
- **Reasoning effort.** On the first 24 posts, describe at `low` agreed as often as at `medium`, for 43% less per
  video. `none` agreed less on `showsProduct` (44%), and in one video copied one scene's text into every scene.
