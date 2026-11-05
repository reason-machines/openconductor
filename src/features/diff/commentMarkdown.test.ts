// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentMarkdown } from "./commentMarkdown.ts";

const render = (body: string, suggestionBaseCode: string | null = null) => renderToStaticMarkup(createElement(CommentMarkdown, { body, suggestionBaseCode }));

test("comment bodies render as markdown: inline code, emphasis, lists and links", () => {
  const html = render("Use `sum` here, **not** _total_.\n\n- one\n- two\n\nSee [docs](https://example.com/x).");
  assert.match(html, /<code class="md-code">sum<\/code>/);
  assert.match(html, /<strong>not<\/strong>/);
  assert.match(html, /<em>total<\/em>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  assert.match(html, /<a href="https:\/\/example.com\/x" class="md-link"/);
  assert.doesNotMatch(html, /\*\*not\*\*/);
});

test("fenced code in a comment is a highlighted code block", () => {
  const html = render("Try:\n```ts\nconst a = 1;\nreturn a;\n```");
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
});

test("GitHub's HTML tags render; anything unsafe is stripped", () => {
  const html = render('<details><summary>Walkthrough</summary>\n\nBody <sub>small</sub> <sup>1</sup>\n\n</details>\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>');
  assert.match(html, /<details><summary>Walkthrough<\/summary>/);
  assert.match(html, /<sub>small<\/sub>/);
  assert.match(html, /<sup>1<\/sup>/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /onerror/);
  assert.doesNotMatch(html, /javascript:/);
});

test("a suggestion fence is a Suggested change only when the original code is known", () => {
  const body = "Rename it:\n```suggestion\nconst total = 1;\n```\nThanks";
  const withBase = render(body, "const sum = 1;");
  assert.match(withBase, /Suggested change/);
  assert.match(withBase, /<div class="oc-suggestion-row del"><span class="sign">-<\/span>const sum = 1;<\/div>/);
  assert.match(withBase, /<div class="oc-suggestion-row add"><span class="sign">\+<\/span>const total = 1;<\/div>/);
  assert.match(withBase, /<p>Rename it:<\/p>/);
  assert.match(withBase, /<p>Thanks<\/p>/);

  const without = render(body, null);
  assert.doesNotMatch(without, /Suggested change/);
  assert.match(without, /const total = 1;/);

  // An empty suggestion deletes the lines.
  const del = render("```suggestion\n```", "gone();");
  assert.match(del, /oc-suggestion-row del/);
  assert.doesNotMatch(del, /oc-suggestion-row add/);
});

test("an empty body renders nothing", () => {
  assert.equal(render(""), "");
});
