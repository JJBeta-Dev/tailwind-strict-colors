// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const tsdoc = require("eslint-plugin-tsdoc");
const prettierConfig = require("eslint-config-prettier");
const globals = require("globals");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "out/**", "media/codicons/**", "example/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: { tsdoc },
    rules: {
      "tsdoc/syntax": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Node-run build/config scripts at the repo root — plain CommonJS by design.
    files: ["esbuild.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // The webview client script, loaded directly by the browser context inside the panel.
    files: ["media/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, acquireVsCodeApi: "readonly" },
    },
  },
  prettierConfig
);
