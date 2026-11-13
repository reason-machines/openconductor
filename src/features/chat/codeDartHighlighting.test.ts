import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, MAX_HIGHLIGHT_CHARS } from "./markdown.ts";

const renderFence = (language: string, content: string) => renderToStaticMarkup(
  createElement(Markdown, { text: `\`\`\`${language}\n${content}\n\`\`\`` }),
);
const dart = "void main() {\n  final answer = 42;\n  print(answer);\n}";

test("an ordinary fenced Dart block renders tokens without changing its source", () => {
  const html = renderFence("dart", dart);
  assert.match(html, /<code class="hljs language-dart">/);
  assert.match(html, /<span class="hljs-keyword">void<\/span>/);
  assert.match(html, /<span class="hljs-keyword">final<\/span>/);
  assert.match(html, /<span class="hljs-number">42<\/span>/);
  const code = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)?.[1];
  assert.equal(code, [
    '<span class="hljs-keyword">void</span> main() {',
    '  <span class="hljs-keyword">final</span> answer = <span class="hljs-number">42</span>;',
    '  <span class="hljs-built_in">print</span>(answer);',
    '}',
  ].join("\n"));
  assert.match(html, /class="md-code-block" data-code-surface="true"/);
  assert.match(html, /class="md-code-scroll"/);
  assert.match(html, /aria-label="Copy code"/);
});

test("the existing Nix registration still renders its tokens", () => {
  const html = renderFence("nix", "let\n  x = true;\nin x;");
  assert.match(html, /<code class="hljs language-nix">/);
  assert.match(html, /<span class="hljs-keyword">let<\/span>/);
  assert.match(html, /<span class="hljs-literal">true<\/span>/);
});

test("an existing common language still renders its tokens", () => {
  const html = renderFence("ts", "const x = true;\nreturn x;");
  assert.match(html, /<code class="hljs language-ts">/);
  assert.match(html, /<span class="hljs-keyword">const<\/span>/);
  assert.match(html, /<span class="hljs-keyword">return<\/span> x;<\/code>/);
});

for (const language of ["nosuchlang", ""]) {
  test(`a ${language || "missing"} fence language keeps escaped plain source`, () => {
    const html = renderFence(language, 'void main() {\n  print("<&>");\n}');
    assert.match(html, /<code>void main\(\) \{\n  print\(&quot;&lt;&amp;&gt;&quot;\);\n\}<\/code>/);
    assert.doesNotMatch(html, /hljs/);
    assert.match(html, /aria-label="Copy code"/);
  });
}

for (const length of [100_000, 100_001]) {
  test(`a fenced Dart value of ${length} characters preserves the highlight cutoff`, () => {
    assert.equal(MAX_HIGHLIGHT_CHARS, 100_000);
    const prefix = `${dart}\n// `;
    const content = prefix + "x".repeat(length - prefix.length);
    assert.equal(content.length, length);
    const html = renderFence("dart", content);
    if (length === 100_000) {
      assert.match(html, /<code class="hljs language-dart">/);
      assert.match(html, /<span class="hljs-keyword">void<\/span>/);
      assert.match(html, /<span class="hljs-comment">\/\/ x+<\/span><\/code>/);
    } else {
      assert.ok(html.includes(`<code>${content}</code>`));
      assert.doesNotMatch(html, /hljs/);
    }
    assert.doesNotMatch(html, /\n<\/code>/);
    assert.match(html, /aria-label="Copy code"/);
  });
}
