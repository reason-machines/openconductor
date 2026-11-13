import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown.ts";

const formats = [
  { format: "yaml", marker: "---" },
  { format: "toml", marker: "+++" },
];
const render = (text: string, options: Omit<Parameters<typeof Markdown>[0], "text"> = {}) =>
  renderToStaticMarkup(createElement(Markdown, { text, ...options }));
const escape = (text: string) => text.replace(/[&<>"']/g, (character) => {
  switch (character) {
    case "&": return "&amp;";
    case "<": return "&lt;";
    case ">": return "&gt;";
    case '"': return "&quot;";
    default: return "&#x27;";
  }
});

function card(html: string, format: string, value: string) {
  const section = /<section\b[^>]*data-markdown-frontmatter="(yaml|toml)"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  assert.ok(section, "leading closed frontmatter must render a section");
  assert.equal(section[1], format);
  assert.match(section[2], /^<div\b[^>]*><span\b[^>]*>Frontmatter<\/span><\/div><pre\b/);
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/.exec(section[2]);
  assert.ok(pre, "frontmatter body must be a plain pre");
  // React inserts an extra initial LF in pre markup to preserve it when HTML is parsed.
  assert.equal(pre[1], (value.startsWith("\n") ? "\n" : "") + escape(value));
  assert.doesNotMatch(section[2], /<(?:button|a|code|script|img)\b|\bhljs\b|contenteditable=/);
  assert.equal((html.match(/data-markdown-frontmatter=/g) ?? []).length, 1);
  return section[0];
}

for (const { format, marker } of formats) {
  for (const [name, ending] of [["LF", "\n"], ["CRLF", "\r\n"], ["CR", "\r"]]) {
    test(`${format} closed frontmatter renders inert multiline text with ${name} boundaries`, () => {
      const value = `title: "plain -- text"${ending}path: src/inside.ts`;
      const html = render(`${marker}${ending}${value}${ending}${marker}${ending}${ending}**After**`, { workspacePath: "/repo" });
      card(html, format, value);
      assert.match(html, /<p><strong>After<\/strong><\/p>/);
    });
  }

  for (const value of ["", "  title: keep spaces  ", "\nfirst\n\nlast\n", "one\n\n\nthree"]) {
    test(`${format} preserves the exact body ${JSON.stringify(value)}`, () => {
      const html = render(`${marker}\n${value}${value ? "\n" : ""}${marker}`);
      card(html, format, value);
    });
  }

  test(`${format} accepts horizontal fence whitespace and a close at EOF`, () => {
    card(render(`${marker} \t\nvalue\n${marker}\t `), format, "value");
  });

  test(`${format} raw HTML, backticks, URLs and paths stay inert inside the pre`, () => {
    const value = '<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n```js\nalert(3)\n```\n`src/file.ts` https://example.com & data';
    card(render(`${marker}\n${value}\n${marker}`, { workspacePath: "/repo" }), format, value);
  });

  const wrong = marker === "---" ? "+++" : "---";
  const negatives = [
    ["interior opener", `Before\n\n${marker}\nvalue\n${marker}`],
    ["blank first line", `\n${marker}\nvalue\n${marker}`],
    ["space-indented opener", ` ${marker}\nvalue\n${marker}`],
    ["tab-indented opener", `\t${marker}\nvalue\n${marker}`],
    ["space-indented closer", `${marker}\nvalue\n ${marker}`],
    ["tab-indented closer", `${marker}\nvalue\n\t${marker}`],
    ["opening suffix", `${marker} suffix\nvalue\n${marker}`],
    ["closing suffix", `${marker}\nvalue\n${marker} suffix`],
    ["four opening markers", `${marker}${marker[0]}\nvalue\n${marker}`],
    ["four closing markers", `${marker}\nvalue\n${marker}${marker[0]}`],
    ["wrong closer", `${marker}\nvalue\n${wrong}`],
    ["unterminated", `${marker}\nvalue\n`],
    ["opener without a line ending", marker],
    ["nested code fence", `\`\`\`text\n${marker}\nvalue\n${marker}\n\`\`\``],
  ];
  for (const [name, input] of negatives) {
    test(`${format} ${name} remains ordinary Markdown`, () => {
      assert.doesNotMatch(render(input), /data-markdown-frontmatter|>Frontmatter<\/span>/);
    });
  }

  test(`${format} keeps wrong-marker lines as data until its own closing marker`, () => {
    const value = `first\n${wrong}\nlast`;
    card(render(`${marker}\n${value}\n${marker}`), format, value);
  });

  test(`${format} preserves the trailing Markdown pipeline and className`, () => {
    const tail = '**After**\nnext line\n\n~~old~~ https://example.com\n\n`src/a.ts`\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    const options = { className: "fixture-text", workspacePath: "/repo" };
    const html = render(`${marker}\nvalue\n${marker}\n${tail}`, options);
    const frontmatter = card(html, format, "value");
    assert.equal(html.replace(frontmatter, ""), render(tail, options));
    assert.match(html, /class="md fixture-text"/);
    assert.match(html, /class="md-file-link"/);
    assert.match(html, /<br\/>/);
    assert.match(html, /class="md-table-scroll"/);
  });
}

test("non-frontmatter Markdown retains its existing content surfaces", () => {
  const html = render('**Bold**\nnext\n\n```text\nplain\n```\n\nraw <script>alert(1)</script>');
  assert.doesNotMatch(html, /data-markdown-frontmatter|<script\b/);
  assert.match(html, /<strong>Bold<\/strong><br\/>/);
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /aria-label="Copy code"/);
});

test("frontmatter leaves file callbacks and the custom Link option on trailing text", () => {
  const files: string[] = [];
  const links: string[] = [];
  const onOpenLink = (href: string) => links.push(href);
  const seenCallbacks: Array<((href: string) => void) | undefined> = [];
  function Link({ href, onOpenLink: open, children }: {
    href?: string; onOpenLink?: (href: string) => void; children?: ReactNode;
  }) {
    seenCallbacks.push(open);
    return createElement("a", { href, onClick: () => href && open?.(href), "data-custom-link": true }, children);
  }
  const { create }: { create: (element: ReactElement) => {
    root: { findAllByType: (type: string) => Array<{ props: {
      className?: string; title?: string; onClick?: () => void; "data-custom-link"?: boolean;
    } }> };
    unmount: () => void;
  } } = createRequire(import.meta.url)("react-test-renderer");
  const renderer = create(createElement(Markdown, {
    text: '---\npath: src/inside.ts\n---\nSee src/plain.ts and `src/code.ts`, then [outside](https://example.com).',
    workspacePath: "/repo", onOpenFile: (path) => files.push(path), onOpenLink, Link,
  }));
  try {
    const buttons = renderer.root.findAllByType("button").filter((node) => node.props.className === "md-file-link");
    assert.deepEqual(buttons.map((node) => node.props.title), ["Open /repo/src/plain.ts", "Open /repo/src/code.ts"]);
    assert.deepEqual(files, []);
    assert.deepEqual(links, []);
    for (const button of buttons) button.props.onClick?.();
    const external = renderer.root.findAllByType("a").filter((node) => node.props["data-custom-link"]);
    assert.equal(external.length, 1);
    assert.deepEqual(seenCallbacks, [onOpenLink]);
    external[0].props.onClick?.();
    assert.deepEqual(files, ["/repo/src/plain.ts", "/repo/src/code.ts"]);
    assert.deepEqual(links, ["https://example.com"]);
  } finally {
    renderer.unmount();
  }
});
