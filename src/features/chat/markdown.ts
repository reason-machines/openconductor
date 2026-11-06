// Assistant text as markdown, the way Conductor renders it (REA evidence in
// evidence/chat/README.md): react-markdown with GitHub-flavoured markdown
// and hard line breaks, smart punctuation (remark-smartypants), code highlighted by lowlight (highlight.js grammars,
// `hljs` classes), and an inline-code URL turned into a link.
//
// - A code span or fence whose text has a newline is a code block (rounded,
//   muted background, copy button, scrolls past 500px); a single-line code
//   span with a language is highlighted inline; anything else is a plain
//   `<code>` chip.
// - Values over 100,000 characters, and languages lowlight does not know,
//   are shown unhighlighted.
// - Raw HTML in the text is escaped, never rendered.
// - Links open in the default browser through `openUrl`.
// - With a workspace folder, an inline-code file path in it (`src/lib/a.ts`,
//   `./x`, or an absolute path under the folder) is a file link in the link
//   colour, as Conductor's `xXs` / `_Xs` remark plugin and `IXs` link do.
//
// No JSX so `markdown.test.ts` can render it with react-dom/server.

import { createElement as h, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import { visit } from "unist-util-visit";
import { common, createLowlight } from "lowlight";
import type { Root as MdRoot } from "mdast";
import type { Element, ElementContent, Root as HastRoot } from "hast";

/** Conductor does not highlight code longer than this. */
export const MAX_HIGHLIGHT_CHARS = 100_000;

const lowlight = createLowlight(common);
const HTTP_URL = /^https?:\/\/\S+$/;

/** `language-ts other` -> `ts` (the first `language-` class). */
export function languageOf(className: string | undefined): string | undefined {
  return className?.split(/\s+/).find((c) => c.startsWith("language-"))?.slice("language-".length);
}

/** A code span whose whole text is an http(s) URL becomes a link around that code span. */
export function remarkInlineCodeUrls() {
  return (tree: MdRoot) => {
    visit(tree, "inlineCode", (node, index, parent) => {
      if (!parent || index === undefined || parent.type === "link" || !HTTP_URL.test(node.value)) return;
      parent.children.splice(index, 1, { type: "link", url: node.value, children: [{ type: "inlineCode", value: node.value }] });
    });
  };
}

// remark-smartypants: Conductor's `TDs` plugin (curly quotes and apostrophes, en/em dashes, ellipses).
export const remarkPlugins = [remarkGfm, remarkBreaks, remarkSmartypants, remarkInlineCodeUrls];

function hastToReact(node: ElementContent, key: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  const el = node as Element;
  const cls = el.properties?.className;
  return h("span", { key, className: Array.isArray(cls) ? cls.join(" ") : undefined }, el.children.map(hastToReact));
}

/** Highlighted spans for `value`, or undefined when the language is unknown or the text too long. */
export function highlight(language: string | undefined, value: string): ReactNode[] | undefined {
  if (language === undefined || value.length > MAX_HIGHLIGHT_CHARS || !lowlight.registered(language)) return undefined;
  const tree: HastRoot = lowlight.highlight(language, value);
  return tree.children.map((c, i) => hastToReact(c as ElementContent, i));
}

function CopyCode({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return h(
    "button",
    {
      type: "button",
      className: "md-code-copy",
      "aria-label": copied ? "Copied" : "Copy code",
      title: copied ? "Copied" : "Copy",
      onClick: () => void navigator.clipboard.writeText(text).then(() => setCopied(true), () => undefined),
    },
    copied ? "Copied" : "Copy",
  );
}

export function CodeBlock({ language, content }: { language: string | undefined; content: string }) {
  const value = content.replace(/\n$/, "");
  const spans = highlight(language, value);
  return h(
    "div",
    { className: "md-code-block", "data-code-surface": true },
    h("pre", { className: "md-code-scroll" }, h("code", { className: spans ? `hljs${language ? ` language-${language}` : ""}` : undefined }, spans ?? value)),
    h(CopyCode, { text: content.trim() }),
  );
}

function childText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childText).join("");
  return "";
}

export interface MarkdownOptions {
  /** Opens a link; the desktop app passes `openUrl` from backend.ts. */
  onOpenLink?: (href: string) => void;
  /** The workspace folder: inline-code paths inside it become file links. */
  workspacePath?: string;
  /** Opens a file link (its absolute path). */
  onOpenFile?: (path: string) => void;
}

/** Conductor's `_Xs`: whether an inline-code value looks like a file path. */
export function looksLikePath(value: string): boolean {
  if (/\s/.test(value)) return false;
  const path = value.replace(/:\d+(:\d+)?$/, "");
  if (path.includes("://") || path.startsWith("http")) return false;
  if (path.startsWith(".") && !path.startsWith("./") && !path.includes("/")) return false;
  return path.startsWith("/") || path.startsWith("./") || (path.includes("/") && /\.[a-zA-Z0-9]{1,10}$/.test(path));
}

/** The absolute path an inline-code path names in the workspace, or undefined when it is outside it. */
export function resolveWorkspacePath(value: string, workspacePath: string | undefined): string | undefined {
  if (!workspacePath || !looksLikePath(value)) return undefined;
  const root = workspacePath.replace(/\/$/, "");
  const path = value.replace(/:\d+(:\d+)?$/, "");
  if (path.startsWith("/")) return path.startsWith(`${root}/`) ? path : undefined;
  return `${root}/${path.replace(/^\.\//, "")}`;
}

export function markdownComponents({ onOpenLink, workspacePath, onOpenFile }: MarkdownOptions = {}): Components {
  return {
    // The code component draws its own <pre> for blocks.
    pre: ({ children }) => h("div", { className: "md-pre" }, children),
    code: ({ className, children }) => {
      const text = childText(children);
      const language = languageOf(className);
      if (text.includes("\n")) return h(CodeBlock, { language, content: text });
      const spans = highlight(language, text);
      if (spans) return h("code", { className: `md-code hljs${className ? ` ${className}` : ""}` }, spans);
      const code = h("code", { className: className ? `md-code ${className}` : "md-code" }, children);
      const file = className ? undefined : resolveWorkspacePath(text, workspacePath);
      if (file === undefined) return code;
      return h("button", { type: "button", className: "md-file-link", title: `Open ${file}`, onClick: () => onOpenFile?.(file) }, code);
    },
    a: ({ href, children }) =>
      h(
        "a",
        {
          href,
          className: "md-link",
          target: "_blank",
          rel: "noreferrer noopener",
          onClick: (e: { preventDefault: () => void }) => {
            if (!href || !onOpenLink) return;
            e.preventDefault();
            onOpenLink(href);
          },
        },
        children,
      ),
    table: ({ children }) => h("div", { className: "md-table-scroll" }, h("table", null, children)),
  };
}

export function Markdown({ text, className, onOpenLink, workspacePath, onOpenFile }: { text: string; className?: string } & MarkdownOptions) {
  return h(
    "div",
    { className: className ? `md ${className}` : "md" },
    h(ReactMarkdown, { remarkPlugins, components: markdownComponents({ onOpenLink, workspacePath, onOpenFile }) }, text),
  );
}
