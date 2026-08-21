import { test } from "node:test";
import assert from "node:assert/strict";
import { looksGenerated } from "../generatedFileHeuristic";

test("does not flag normal-looking source files", () => {
  const source = 'export function Card() {\n  return <div className="bg-red-500" />;\n}\n'.repeat(50);
  assert.equal(looksGenerated(source), false);
});

test("flags a minified bundle with very long lines", () => {
  const bundle = "a".repeat(5000) + "\n" + "b".repeat(5000);
  assert.equal(looksGenerated(bundle), true);
});

test("ignores short files even if their only line is long", () => {
  assert.equal(looksGenerated("x".repeat(500)), false);
});
