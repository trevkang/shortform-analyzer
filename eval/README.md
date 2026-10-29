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
  "comments": ["intent", "positive"],
  "unsure": { "format": "review was close: it compares two apps" }
}
```

- `scenes`: one entry per scene of the analysis, in order. `showsProduct` is `null` when `sells` is `none`.
- `comments`: one kind per comment in the analysis, in order. Leave it out when no comments were read.
- `unsure`: each field where a second value was close, with why. The scores are given twice: on every label, and on
  the labels not marked unsure.
- A `product` matches when either name contains the other, ignoring case. It is scored only when both sides sell.
