import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isMarkdownFile, externalMarkdownLink } from "./fileView.ts";
import { MarkdownFileBody } from "./markdownFileBody.ts";

const render = (text: string, style?: string) => renderToStaticMarkup(createElement(MarkdownFileBody, { text, style }));

test("only Markdown files are eligible for internal read-only preview", () => {
  for (const path of ["README.md", "guide.MDX", "docs/a.Md"]) assert.equal(isMarkdownFile(path), true);
  for (const path of ["code.ts", "README.md.bak", "a.md/file.txt"]) assert.equal(isMarkdownFile(path), false);
});

test("the file preview consumes default and tufte styles without changing content", () => {
  const text = "# Guide\n\n- first\n- second\n\n```js\nconst x = 1;\n```";
  const normal = render(text, "default");
  const tufte = render(text, "tufte");
  assert.match(normal, /class="markdown-file-preview"/);
  assert.match(tufte, /class="markdown-file-preview tufte"/);
  assert.match(normal, /<h1>Guide<\/h1>/);
  assert.match(normal, /<li>first<\/li>/);
  assert.match(normal, /const x = 1;/);
  assert.equal(tufte.replace('markdown-file-preview tufte', 'markdown-file-preview'), normal);
  assert.equal(render(text, "unknown"), normal);
});

test("MDX and HTML are inert and remote images do not load on preview", () => {
  const html = render('# Guide\n\n<script>alert(1)</script>\n\n<Component onClick={run} />\n\n![secret](https://tracker.test/pixel)\n\n[unsafe](javascript:alert)');
  assert.doesNotMatch(html, /<script|<Component|<img|src=|javascript:/);
  assert.match(html, /secret/);
});

test("only explicit HTTP(S) links can open externally", () => {
  assert.equal(externalMarkdownLink("https://example.com/guide"), "https://example.com/guide");
  for (const href of ["javascript:alert(1)", "file:///etc/passwd", "//example.com", "../other.md", "data:text/html,hi"]) assert.equal(externalMarkdownLink(href), undefined);
  const html = render("[safe](https://example.com) [local](../readme.md)");
  assert.match(html, /href="https:\/\/example.com\/"/);
  assert.doesNotMatch(html, /href="\.\./);
});
