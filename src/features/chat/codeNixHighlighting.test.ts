import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, MAX_HIGHLIGHT_CHARS } from "./markdown.ts";

const renderFence = (language: string, content: string) => renderToStaticMarkup(
  createElement(Markdown, { text: `\`\`\`${language}\n${content}\n\`\`\`` }),
);
const nix = "let\n  x = true;\nin x;";

for (const language of ["nix", "nixos"]) {
  test(`an ordinary fenced ${language} block renders Nix tokens`, () => {
    const html = renderFence(language, nix);
    assert.match(html, new RegExp(`<code class="hljs language-${language}">`));
    assert.match(html, /<span class="hljs-keyword">let<\/span>/);
    assert.match(html, /<span class="hljs-literal">true<\/span>/);
    assert.match(html, /<span class="hljs-keyword">in<\/span> x;<\/code>/);
    assert.match(html, /class="md-code-block" data-code-surface="true"/);
    assert.match(html, /class="md-code-scroll"/);
    assert.match(html, /aria-label="Copy code"/);
  });
}

test("an existing common language still renders its tokens", () => {
  const html = renderFence("ts", "const x = true;\nreturn x;");
  assert.match(html, /<code class="hljs language-ts">/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  assert.match(html, /<span class="hljs-keyword">return<\/span> x;<\/code>/);
});

for (const language of ["nosuchlang", ""]) {
  test(`a ${language || "missing"} fence language keeps escaped plain source`, () => {
    const html = renderFence(language, 'let\n  x = "<&>";\nin x;');
    assert.match(html, /<code>let\n  x = &quot;&lt;&amp;&gt;&quot;;\nin x;<\/code>/);
    assert.doesNotMatch(html, /hljs/);
    assert.match(html, /aria-label="Copy code"/);
  });
}

for (const length of [100_000, 100_001]) {
  test(`a fenced Nix value of ${length} characters preserves the highlight cutoff`, () => {
    assert.equal(MAX_HIGHLIGHT_CHARS, 100_000);
    const prefix = `${nix}\n# `;
    const content = prefix + "x".repeat(length - prefix.length);
    assert.equal(content.length, length);
    const html = renderFence("nix", content);
    if (length === 100_000) {
      assert.match(html, /<code class="hljs language-nix">/);
      assert.match(html, /<span class="hljs-keyword">let<\/span>/);
      assert.match(html, /<span class="hljs-comment"># x+<\/span><\/code>/);
    } else {
      assert.ok(html.includes(`<code>${content}</code>`));
      assert.doesNotMatch(html, /hljs/);
    }
    assert.doesNotMatch(html, /\n<\/code>/);
    assert.match(html, /aria-label="Copy code"/);
  });
}
