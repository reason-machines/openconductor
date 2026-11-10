// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, highlight, languageOf, MAX_HIGHLIGHT_CHARS, resolveWorkspacePath } from "./markdown.ts";

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

test("Mermaid keeps a readable copyable source fallback before client rendering", () => {
  const html = render("```mermaid\nflowchart LR\n  A[Request] --> B[Response]\n```");
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /A\[Request\] --&gt; B\[Response\]/);
  assert.match(html, /aria-label="Copy code"/);
});

test("partial Mermaid input remains readable during server rendering", () => {
  const html = render("```mermaid\nflowchart LR\n A[unfinished");
  assert.match(html, /A\[unfinished/);
  assert.match(html, /aria-label="Copy code"/);
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

test("plain workspace paths render as file buttons without backticks", () => {
  const html = renderToStaticMarkup(createElement(Markdown, { text: "See src/lib/auth.ts.", workspacePath: "/repo" }));
  assert.match(html, /See <button type="button" class="md-file-link" title="Open \/repo\/src\/lib\/auth.ts">src\/lib\/auth.ts<\/button>\./);
  assert.doesNotMatch(html, /<code/);
});

test("plain file buttons invoke onOpenFile rather than the external link callback", () => {
  const opened: string[] = [];
  const external: string[] = [];
  const { create }: { create: (element: ReactElement) => {
    root: { findAllByType: (type: "button") => Array<{ props: { className?: string; onClick: () => void } }> };
    unmount: () => void;
  } } = createRequire(import.meta.url)("react-test-renderer");
  const renderer = create(createElement(Markdown, {
    text: "See src/lib/auth.ts.", workspacePath: "/repo",
    onOpenFile: (path) => opened.push(path), onOpenLink: (href) => external.push(href),
  }));
  try {
    const buttons = renderer.root.findAllByType("button").filter((button) => button.props.className === "md-file-link");
    assert.equal(buttons.length, 1);
    buttons[0].props.onClick();
    assert.deepEqual(opened, ["/repo/src/lib/auth.ts"]);
    assert.deepEqual(external, []);
  } finally {
    renderer.unmount();
  }
});

test("plain file paths keep punctuation and multiple targets in order", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "See (src/lib/auth.ts), ./src/main.ts:12:3; /repo/tests/auth.test.ts.", workspacePath: "/repo",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), [
    "/repo/src/lib/auth.ts", "/repo/src/main.ts", "/repo/tests/auth.test.ts",
  ]);
  assert.match(html, /auth\.ts<\/button>\), /);
  assert.match(html, /main\.ts:12:3<\/button>; /);
  assert.match(html, /auth\.test\.ts<\/button>\./);
});

test("comma-adjacent bare relative paths keep both targets and the comma", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "src/a.ts,src/b.ts", workspacePath: "/repo",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), [
    "/repo/src/a.ts", "/repo/src/b.ts",
  ]);
  assert.match(html, /src\/a\.ts<\/button>,<button[^>]+>src\/b\.ts<\/button>/);
});

test("a colon before a bare relative path stays text beside its file button", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "files:src/a.ts", workspacePath: "/repo",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), ["/repo/src/a.ts"]);
  assert.match(html, /files:<button[^>]+>src\/a\.ts<\/button>/);
});

test("punctuation-adjacent file buttons invoke ordered file callbacks only", () => {
  const opened: string[] = [];
  const external: string[] = [];
  const { create }: { create: (element: ReactElement) => {
    root: { findAllByType: (type: "button") => Array<{ props: { className?: string; title?: string; onClick: () => void } }> };
    unmount: () => void;
  } } = createRequire(import.meta.url)("react-test-renderer");
  const renderer = create(createElement(Markdown, {
    text: "src/a.ts,src/b.ts", workspacePath: "/repo",
    onOpenFile: (path) => opened.push(path), onOpenLink: (href) => external.push(href),
  }));
  try {
    const buttons = renderer.root.findAllByType("button").filter((button) => button.props.className === "md-file-link");
    assert.deepEqual(buttons.map((button) => button.props.title), ["Open /repo/src/a.ts", "Open /repo/src/b.ts"]);
    for (const button of buttons) button.props.onClick();
    assert.deepEqual(opened, ["/repo/src/a.ts", "/repo/src/b.ts"]);
    assert.deepEqual(external, []);
  } finally {
    renderer.unmount();
  }
});

test("space and parenthesis delimiters retain ordinary relative file targets", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "src/a.ts src/b.ts (src/c.ts)", workspacePath: "/repo",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), [
    "/repo/src/a.ts", "/repo/src/b.ts", "/repo/src/c.ts",
  ]);
  assert.match(html, /<\/button> <button/);
  assert.match(html, /\(<button[^>]+>src\/c\.ts<\/button>\)/);
});

test("punctuation does not widen absolute or dot-prefixed path recognition", () => {
  for (const prefix of [",", "files:"]) {
    for (const path of ["/repo/src/a.ts", "./src/a.ts", "../src/a.ts", "/outside/a.ts"]) {
      const html = renderToStaticMarkup(createElement(Markdown, { text: `${prefix}${path}`, workspacePath: "/repo" }));
      assert.doesNotMatch(html, /md-file-link|<button/, `${prefix}${path}`);
      assert.ok(html.includes(`${prefix}${path}`));
    }
  }
});

test("punctuation-adjacent URL and explicit-link labels are not file buttons", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "https://example.com/src/a.ts,src/b.ts [src/a.ts,src/b.ts](https://example.org) [**files:src/c.ts**](https://example.net) [src/d.ts,src/e.ts][ref]\n\n[ref]: https://example.edu",
    workspacePath: "/repo",
  }));
  assert.doesNotMatch(html, /md-file-link/);
  assert.equal((html.match(/<a /g) ?? []).length, 4);
  assert.match(html, /href="https:\/\/example\.com\/src\/a\.ts,src\/b\.ts"/);
  assert.match(html, /<strong>files:src\/c\.ts<\/strong>/);
});

test("punctuation recognition leaves inline code and fenced paths on their code surfaces", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "`src/a.ts`\n\n```text\nsrc/b.ts,src/c.ts\n```", workspacePath: "/repo",
  }));
  assert.equal((html.match(/md-file-link/g) ?? []).length, 1);
  assert.match(html, /<button[^>]+title="Open \/repo\/src\/a\.ts"><code class="md-code">src\/a\.ts<\/code><\/button>/);
  assert.match(html, /<code[^>]*>src\/b\.ts,src\/c\.ts<\/code>/);
});

test("punctuation-adjacent paths remain text without an absolute workspace", () => {
  for (const workspacePath of [undefined, "repo"]) {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "src/a.ts,src/b.ts files:src/c.ts", workspacePath }));
    assert.doesNotMatch(html, /<button|<a /);
    assert.match(html, /src\/a\.ts,src\/b\.ts files:src\/c\.ts/);
  }
});

test("punctuation-adjacent paths still reject traversal and workspace roots", () => {
  for (const path of ["src/../../escape.ts", "src/..", "src/../.", "src/../../repo"]) {
    const html = renderToStaticMarkup(createElement(Markdown, { text: `files:${path}`, workspacePath: "/repo" }));
    assert.doesNotMatch(html, /md-file-link|<button|<a /, path);
    assert.ok(html.includes(`files:${path}`));
  }
});

test("plain paths normalize dot segments before workspace containment", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "src/lib/../auth.ts /repo/src/./main.ts /repo/src/../../outside.ts ../escape.ts /repo-other/file.ts /repo/.",
    workspacePath: "/repo/./",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), ["/repo/src/auth.ts", "/repo/src/main.ts"]);
  assert.match(html, /\/repo\/src\/\.\.\/\.\.\/outside\.ts/);
  assert.match(html, /\.\.\/escape\.ts/);
  assert.match(html, /\/repo-other\/file\.ts/);
});

test("plain paths stay text without an absolute workspace folder", () => {
  for (const workspacePath of [undefined, "repo"]) {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "See src/lib/auth.ts.", workspacePath }));
    assert.doesNotMatch(html, /<button|<a /);
    assert.match(html, /See src\/lib\/auth\.ts\./);
  }
});

test("plain path recognition does not rewrite URLs, explicit links or their nested labels", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "https://example.com/src/auth.ts [src/lib/auth.ts](https://example.com) [**src/main.ts**](https://example.org) [src/ref.ts][ref]\n\n[ref]: https://example.net",
    workspacePath: "/repo",
  }));
  assert.doesNotMatch(html, /md-file-link/);
  assert.equal((html.match(/<a /g) ?? []).length, 4);
  assert.match(html, /href="https:\/\/example\.com\/src\/auth\.ts"/);
  assert.match(html, /<strong>src\/main\.ts<\/strong>/);
});

test("code paths retain code chips and fenced paths never become buttons", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "`src/lib/auth.ts`\n\n```text\nsrc/main.ts\n```", workspacePath: "/repo",
  }));
  assert.equal((html.match(/md-file-link/g) ?? []).length, 1);
  assert.match(html, /<button[^>]+title="Open \/repo\/src\/lib\/auth\.ts"><code class="md-code">src\/lib\/auth\.ts<\/code><\/button>/);
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<code[^>]*>src\/main\.ts<\/code>/);
});

test("inline-code paths outside the normalized workspace remain code chips", () => {
  for (const path of ["../secret.txt", "./../secret.txt", "src/../../secret.txt", "/repo/../secret.txt", "/repo/src/../../secret.txt", "/repo-other/secret.txt"]) {
    const html = renderToStaticMarkup(createElement(Markdown, { text: `See \`${path}\`.`, workspacePath: "/repo" }));
    assert.doesNotMatch(html, /md-file-link|<button|<a /, path);
    assert.ok(html.includes(`<code class="md-code">${path}</code>`), path);
  }
});

test("inline-code workspace roots are not file buttons", () => {
  for (const path of ["./", "/repo", "/repo/", "/repo/.", "./src/..", "/repo/src/.."]) {
    const html = renderToStaticMarkup(createElement(Markdown, { text: `\`${path}\``, workspacePath: "/repo" }));
    assert.doesNotMatch(html, /md-file-link|<button|<a /, path);
    assert.ok(html.includes(`<code class="md-code">${path}</code>`), path);
  }
});

test("inline-code file titles use normalized contained absolute targets", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "`src/lib/../auth.ts` `./src/./main.ts:12:3` `/repo/src//auth.ts` `src/../../repo/tests/auth.test.ts`",
    workspacePath: "/repo/./src/..//",
  }));
  assert.deepEqual([...html.matchAll(/title="Open ([^"]+)"/g)].map((match) => match[1]), [
    "/repo/src/auth.ts", "/repo/src/main.ts", "/repo/src/auth.ts", "/repo/tests/auth.test.ts",
  ]);
  assert.equal((html.match(/<code class="md-code">/g) ?? []).length, 4);
  assert.match(html, /<code class="md-code">\.\/src\/\.\/main\.ts:12:3<\/code>/);
});

test("inline-code callbacks open only normalized contained files", () => {
  const opened: string[] = [];
  const external: string[] = [];
  const { create }: { create: (element: ReactElement) => {
    root: { findAllByType: (type: "button") => Array<{ props: { className?: string; title?: string; onClick: () => void } }> };
    unmount: () => void;
  } } = createRequire(import.meta.url)("react-test-renderer");
  const renderer = create(createElement(Markdown, {
    text: "`src/lib/../auth.ts:12:3` `/repo/src/./main.ts` `../secret.txt` `/repo/../secret.txt` `./`",
    workspacePath: "/repo",
    onOpenFile: (path) => opened.push(path), onOpenLink: (href) => external.push(href),
  }));
  try {
    const buttons = renderer.root.findAllByType("button").filter((button) => button.props.className === "md-file-link");
    assert.deepEqual(buttons.map((button) => button.props.title), ["Open /repo/src/auth.ts", "Open /repo/src/main.ts"]);
    for (const button of buttons) button.props.onClick();
    assert.deepEqual(opened, ["/repo/src/auth.ts", "/repo/src/main.ts"]);
    assert.deepEqual(external, []);
  } finally {
    renderer.unmount();
  }
});

test("workspace path resolution rejects missing context and root targets", () => {
  for (const workspacePath of [undefined, "repo"]) {
    assert.equal(resolveWorkspacePath("src/auth.ts", workspacePath), undefined);
  }
  assert.equal(resolveWorkspacePath("./", "/"), undefined);
  assert.equal(resolveWorkspacePath("/repo/../secret.txt", "/repo"), undefined);
  assert.equal(resolveWorkspacePath("/repo-other/auth.ts", "/repo"), undefined);
  assert.equal(resolveWorkspacePath("./src/../auth.ts", "/"), "/auth.ts");
  assert.equal(resolveWorkspacePath("./src/../auth.ts", "/repo/./"), "/repo/auth.ts");
});

test("inline containment preserves URLs, explicit links, fences and missing-workspace code", () => {
  const text = "`https://example.com/src/auth.ts` [src/auth.ts](https://example.org)\n\n```text\n../secret.txt\n```";
  const html = renderToStaticMarkup(createElement(Markdown, { text, workspacePath: "/repo" }));
  assert.doesNotMatch(html, /md-file-link/);
  assert.equal((html.match(/<a /g) ?? []).length, 2);
  assert.match(html, /href="https:\/\/example\.com\/src\/auth\.ts"/);
  assert.match(html, /href="https:\/\/example\.org"/);
  assert.match(html, /class="md-code-block"/);
  assert.match(html, /<code[^>]*>\.\.\/secret\.txt<\/code>/);
  const noWorkspace = render("`src/lib/../auth.ts`");
  assert.doesNotMatch(noWorkspace, /md-file-link|<button|<a /);
  assert.match(noWorkspace, /<code class="md-code">src\/lib\/\.\.\/auth\.ts<\/code>/);
});

test("a custom external-link component does not intercept plain file buttons", () => {
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: "src/lib/auth.ts [docs](https://example.com)", workspacePath: "/repo",
    Link: ({ href, children }) => createElement("a", { href, "data-custom-link": true }, children),
  }));
  assert.match(html, /class="md-file-link"/);
  assert.equal((html.match(/data-custom-link/g) ?? []).length, 1);
  assert.match(html, /href="https:\/\/example\.com"/);
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
