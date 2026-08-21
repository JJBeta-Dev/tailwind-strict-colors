import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTheme } from "../cssThemeParser";

test("extracts --color-* tokens from a @theme block", () => {
  const css = `
    @import "tailwindcss";
    @theme {
      --color-brand-primary: #ff0044;
      --font-display: "Inter";
    }
  `;
  const { tokens } = parseTheme([css]);

  assert.equal(tokens.size, 1);
  assert.equal(tokens.get("brand-primary")?.resolvedHex, "#ff0044");
  assert.equal(tokens.has("font-display" as never), false);
});

test("resolves var() chains within the same file", () => {
  const css = `
    @theme {
      --brand-500: #123456;
      --color-brand-primary: var(--brand-500);
    }
  `;
  const { tokens } = parseTheme([css]);
  assert.equal(tokens.get("brand-primary")?.resolvedHex, "#123456");
});

test("ignores unresolvable values (oklch) but still registers the token", () => {
  const css = `
    @theme {
      --color-brand-danger: oklch(0.6 0.2 25);
    }
  `;
  const { tokens } = parseTheme([css]);
  const token = tokens.get("brand-danger");
  assert.ok(token);
  assert.equal(token?.resolvedHex, undefined);
});

test("supports @theme inline and multiple sources", () => {
  const cssA = `@theme inline { --color-a: #111111; }`;
  const cssB = `@theme { --color-b: #222222; }`;
  const { tokens } = parseTheme([cssA, cssB]);

  assert.equal(tokens.size, 2);
  assert.equal(tokens.get("a")?.resolvedHex, "#111111");
  assert.equal(tokens.get("b")?.resolvedHex, "#222222");
});

test("strips comments before parsing", () => {
  const css = `
    @theme {
      /* --color-fake: #ffffff; */
      --color-real: #ffffff;
    }
  `;
  const { tokens } = parseTheme([css]);
  assert.equal(tokens.has("fake"), false);
  assert.equal(tokens.has("real"), true);
});
