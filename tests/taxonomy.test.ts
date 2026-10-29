// Example 24: TAXONOMY is the tables and rules of docs/video-analysis.md, word for word (backticks aside).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAXONOMY } from "../src/primitives.js";

const doc = readFileSync("docs/video-analysis.md", "utf8");
const norm = (s: string) => s.replace(/`/g, "").replace(/\s+/g, " ").trim();

/** The text under a `### heading`, up to the next heading. */
function section(heading: string): string {
  const start = doc.indexOf(`\n### ${heading}\n`);
  if (start < 0) throw new Error(`no section ${heading}`);
  const rest = doc.slice(start + heading.length + 6);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The rows of the first table in `text`, as cells. */
function table(text: string): string[][] {
  const rows = text.split("\n").filter((l) => l.startsWith("|")).map((l) => l.split("|").slice(1, -1).map(norm));
  return rows.slice(2);
}

const FIELDS = { topic: "topic", format: "format", sells: "sells", role: "role", footage: "footage", subject: "subject", commentKind: "kind" } as const;

describe("TAXONOMY (Example 24)", () => {
  for (const [field, heading] of Object.entries(FIELDS) as [keyof typeof TAXONOMY, string][]) {
    it(`${field} has the docs' values, tests, examples and near misses, in order`, () => {
      const t = TAXONOMY[field];
      const rows = table(section(heading));
      expect(rows.map((r) => r[0])).toEqual([...t.values]);
      for (const r of rows) {
        const about = (t.about as Record<string, { test: string; example: string; nearMiss: string }>)[r[0]];
        expect({ test: about.test, example: about.example, nearMiss: about.nearMiss }, r[0]).toEqual({ test: r[1], example: r[2] ?? "", nearMiss: r[3] ?? "" });
      }
    });

    it(`${field}'s rules are in the docs`, () => {
      const text = norm(section(heading));
      for (const rule of TAXONOMY[field].rules) expect(text).toContain(norm(rule));
    });
  }

  it("the field tables list the same values", () => {
    const listed = (name: string) => {
      const row = doc.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
      return row!.split("|")[3].split("·").map(norm);
    };
    expect(listed("topic")).toEqual([...TAXONOMY.topic.values]);
    expect(listed("format")).toEqual([...TAXONOMY.format.values]);
    expect(listed("sells")).toEqual([...TAXONOMY.sells.values]);
    expect(listed("role")).toEqual([...TAXONOMY.role.values]);
    expect(listed("footage")).toEqual([...TAXONOMY.footage.values]);
    expect(listed("subject")).toEqual([...TAXONOMY.subject.values]);
    expect(listed("kind")).toEqual([...TAXONOMY.commentKind.values]);
  });
});
