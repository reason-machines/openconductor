// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentMarkdown } from "./commentMarkdown.ts";

const html = (text: string) => renderToStaticMarkup(createElement(CommentMarkdown, { text }));

test("comment bodies render GitHub-flavoured markdown with soft breaks", () => {
  const out = html("**Bold** and `code`\nnext line\n\n- [ ] task\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ https://example.com");
  assert.match(out, /^<div class="md oc-md">/);
  assert.match(out, /<strong>Bold<\/strong>/);
  assert.match(out, /<code class="md-code">code<\/code><br\/>/);
  assert.match(out, /<input type="checkbox" disabled=""\/>/);
  assert.match(out, /<table>/);
  assert.match(out, /<del>gone<\/del>/);
  assert.match(out, /<a href="https:\/\/example.com" class="md-link" target="_blank" rel="noreferrer noopener">/);
});

test("comment code blocks use the chat's highlighted code block", () => {
  assert.match(html("```ts\nconst a = 1;\n```"), /class="md-code-block"[^>]*><pre class="md-code-scroll"><code class="hljs language-ts">/);
});

test("raw HTML from GitHub renders through the sanitizer: details/sub/sup/img stay, scripts and handlers go", () => {
  const out = html('<details><summary>More</summary>Hidden <sub>x</sub><sup>2</sup></details>\n\n<img src="https://example.com/a.png" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))');
  assert.match(out, /<details><summary>More<\/summary>/);
  assert.match(out, /<sub>x<\/sub><sup>2<\/sup>/);
  assert.match(out, /<img src="https:\/\/example.com\/a.png"\/>/);
  assert.doesNotMatch(out, /script|onerror|javascript:/);
});
