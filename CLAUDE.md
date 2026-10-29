# Working in this repo

## Docs first

`docs/` is the source of truth. Read `docs/concepts.md` first (the stages and layers), then
`docs/video-analysis.md` (the record: fields, values, rules) and `docs/reference.md` (the contract
and the examples). A behaviour change starts as a doc edit, then the tests, then the code. Where
code and docs disagree, the code is wrong. Keep doc edits short.

The record is fixed: a field, value or rule changes only through `docs/video-analysis.md`, and
`src/record/taxonomy.ts` follows it (`tests/taxonomy.test.ts` compares them). A change to a model,
a prompt, an engine default or a scene rule reports `bench/` (cost, time) and `eval/` (accuracy),
before and after.

## The layers

- `src/blocks/` is Layer 1: the only code that runs ffmpeg or calls a network API (OpenAI, apinoa
  through `@apinoa/sdk`, TikTok's links), always through the `fetch` option. It knows nothing about hooks or topics. Its
  functions throw, with the stage first (`video:`, `decide:` …).
- `src/record/` is Layer 2: the record's taxonomy, the questions and describe schema made from it,
  and the rules that turn answers into the record. Pure functions.
- `src/pipeline/` is Layer 3. It imports only from `src/primitives.ts`, never from `blocks/` or
  `record/` directly, so `analyzeVideo` stays rebuildable from the public parts
  (`tests/compose.test.ts` checks both). It never throws: every failure is `{ ok: false, error }`.
- `shortform-analyzer` (src/index.ts) is stable; `shortform-analyzer/primitives` is experimental.
  A change to a `primitives` signature goes in CHANGELOG.md.

## Tests

Every change comes with a test that fails without it. `pnpm test` (builds, then vitest),
`pnpm typecheck` and `pnpm test:consumer` must pass. Tests never touch the network: inject
`fetch`, and make videos with ffmpeg `lavfi` (`tests/helpers.ts`). No API keys, and no video you
don't own, anywhere in the repo, tests, fixtures or history.

## Branches

Short-lived branches, small commits. Releases: bump `package.json` and CHANGELOG.md, tag `vX.Y.Z`;
`release.yml` publishes to npm.
