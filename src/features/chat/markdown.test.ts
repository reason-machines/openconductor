// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, highlight, languageOf, MAX_HIGHLIGHT_CHARS } from "./markdown.ts";

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

test("inline code renders as a code chip and lists as list items", () => {
  const html = render("Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n- `src/lib/auth.ts`: only redirect when valid.\n- Tests pass.");
  assert.match(html, /<code class="md-code">\/login<\/code>/);
  assert.match(html, /<ul>\s*<li><code class="md-code">src\/lib\/auth.ts<\/code>: only redirect when valid.<\/li>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
});

test("a fenced block with a known language is highlighted with hljs classes", () => {
  const html = render("```ts\nconst a = 1;\nreturn a;\n```");
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<code class="hljs language-ts">/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  assert.match(html, /aria-label="Copy code"/);
  // The trailing newline is dropped from the displayed block.
  assert.doesNotMatch(html, /return a;\n<\/code>/);
});

test("a fenced block with an unknown language stays plain text", () => {
  const html = render("```nosuchlang\nline one\nline two\n```");
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<code>line one\nline two<\/code>/);
});

test("a one-line fence is still a block (its text ends with a newline)", () => {
  const html = render("```js\nlet x\n```");
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<span class="hljs-keyword">let<\/span> x<\/code>/);
});

test("soft line breaks become <br> (remark-breaks), like Conductor", () => {
  const html = render("first line\nsecond line");
  assert.match(html, /first line<br\/>\s*second line/);
});

test("GFM tables, strikethrough and autolinks render", () => {
  const html = render("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~old~~ see https://example.com");
  assert.match(html, /<div class="md-table-scroll"><table>/);
  assert.match(html, /<del>old<\/del>/);
  assert.match(html, /<a href="https:\/\/example.com" class="md-link"/);
});

test("an inline-code URL becomes a link around the code chip", () => {
  const html = render("Open `https://github.com/reason-machines/openconductor` now");
  assert.match(html, /<a href="https:\/\/github.com\/reason-machines\/openconductor" class="md-link"[^>]*><code class="md-code">https:/);
});

test("raw HTML is escaped, never rendered", () => {
  const html = render('Hi <img src=x onerror="alert(1)"> there <script>alert(2)</script>');
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script/);
});

test("javascript: links are neutralised", () => {
  const html = render("[click](javascript:alert(1))");
  assert.doesNotMatch(html, /javascript:/);
});

test("languageOf reads the first language- class", () => {
  assert.equal(languageOf("language-rust foo"), "rust");
  assert.equal(languageOf("foo"), undefined);
  assert.equal(languageOf(undefined), undefined);
});

test("highlight skips unknown languages and over-long values", () => {
  assert.equal(highlight("nosuchlang", "x"), undefined);
  assert.equal(highlight(undefined, "x"), undefined);
  assert.equal(highlight("js", "a".repeat(MAX_HIGHLIGHT_CHARS + 1)), undefined);
  assert.ok(highlight("js", "let a = 1"));
});
