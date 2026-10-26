# Changelog

## 0.3.1 (2026-10-26)

- Published from GitHub Actions with npm provenance under the new name. No code changes.

## 0.3.0 (2026-10-25)

- Renamed from `shortform-breakdown` to `shortform-analyzer`: the npm package, the CLI command
  (`npx shortform-analyzer analyze clip.mp4`), the MCP server, the agent skill
  (`skills/shortform-analyzer`) and the repository (`trevkang/shortform-analyzer`). The old
  package is deprecated and points here.
- The CLI and MCP write to `<file>.analysis/` (was `<file>.breakdown/`).

## 0.2.0 (2026-10-25)

- apinoa is removed (`@apinoa/sdk`, `APINOA_API_KEY`): input is a video file, a path or a `Buffer`.
  A URL fails as before, with "download the video first and pass the file".
- `primitives`: `TIKTOK_URL` is removed, `resolveInput(input)` takes no options, and
  `ResolvedInput` has no `postId`. `Options` has no `apinoaApiKey`.
- README: the how-it-works animation is now a real run on a TikTok: the timeline cut into 17
  scenes, then one decision labelling them all at once.

## 0.1.2 (2026-10-25)

- Credits: Trevor and Viktor. No code changes.

## 0.1.1 (2026-10-25)

- Published from GitHub Actions with npm provenance (trusted publishing). No code changes.

## 0.1.0 (2026-10-25)

First release.

- `analyzeVideo`, `screenVideo`, `screenCover`, `summarize`, `reportHtml` from `shortform-breakdown`.
- Building blocks and the short-form preset from `shortform-breakdown/primitives` (experimental):
  `resolveInput`, `probe`, `detectScenes`, `grabFrame`, `extractFrames`, `extractAudio`, `transcribe`,
  `alignWords`, `sceneEvidence`, `frameEvidence`, `decide`, `shortformQuestions`, `parseShortform`,
  `makingQuestions`, `parseMaking`, `sectionsOf`.
- CLI (`analyze`, `screen`, `mcp`), MCP server (`analyze_video`, `screen_video`) and an agent skill.
- `schema/analysis.schema.json` for `schemaVersion: 1`.
