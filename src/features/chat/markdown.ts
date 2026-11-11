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

import { createElement as h, Fragment, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { MermaidBlock } from "./mermaid.ts";
import type { ToastItem } from "../../components/toastTiming.ts";
import { splitFrontmatter } from "./markdownFrontmatter.ts";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import { SKIP, visit } from "unist-util-visit";
import { common, createLowlight } from "lowlight";
import nix from "highlight.js/lib/languages/nix";
import dart from "highlight.js/lib/languages/dart";
import type { PhrasingContent, Root as MdRoot } from "mdast";
import type { Element, ElementContent, Root as HastRoot } from "hast";

/** Conductor does not highlight code longer than this. */
export const MAX_HIGHLIGHT_CHARS = 100_000;

const lowlight = createLowlight({ ...common, nix, dart });
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

const PLAIN_FILE_PATH = /(^|[\s([{"'“‘]|[^\w@./-](?!\/|\.\.?\/))((?:(?:\/|\.\.?\/)[\w@.-]+(?:\/[\w@.-]+)*|[\w@.-]+(?:\/[\w@.-]+)+)(?::\d+(?::\d+)?)?)/g;

function remarkPlainFilePaths() {
  return (tree: MdRoot) => {
    visit(tree, (node, index, parent) => {
      if (node.type === "link" || node.type === "linkReference") return SKIP;
      if (node.type !== "text" || !parent || index === undefined) return;
      const children: PhrasingContent[] = [];
      let offset = 0;
      for (const match of node.value.matchAll(PLAIN_FILE_PATH)) {
        const path = match[2].replace(/\.+$/, "");
        if (!looksLikePath(path)) continue;
        const start = match.index + match[1].length;
        if (start > offset) children.push({ type: "text", value: node.value.slice(offset, start) });
        children.push({
          type: "link", url: "", children: [{ type: "text", value: path }],
          data: { hProperties: { "data-plain-file-path": path } },
        });
        offset = start + path.length;
      }
      if (children.length === 0) return;
      if (offset < node.value.length) children.push({ type: "text", value: node.value.slice(offset) });
      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}

// remark-smartypants: Conductor's `TDs` plugin (curly quotes and apostrophes, en/em dashes, ellipses).
export const remarkPlugins = [remarkGfm, remarkBreaks, remarkSmartypants, remarkInlineCodeUrls, remarkPlainFilePaths];

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

function CopyCode({ text, notify }: { text: string; notify?: MarkdownOptions["notify"] }) {
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
      onClick: () => void navigator.clipboard.writeText(text).then(() => setCopied(true), () => notify?.("error", "Failed to copy", { description: "Please try again." })),
    },
    copied ? "Copied" : "Copy",
  );
}

export function CodeBlock({ language, content, notify }: { language: string | undefined; content: string; notify?: MarkdownOptions["notify"] }) {
  const value = content.replace(/\n$/, "");
  const spans = highlight(language, value);
  return h(
    "div",
    { className: "md-code-block", "data-code-surface": true },
    h("pre", { className: "md-code-scroll" }, h("code", { className: spans ? `hljs${language ? ` language-${language}` : ""}` : undefined }, spans ?? value)),
    h(CopyCode, { text: content.trim(), notify }),
  );
}

function childText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childText).join("");
  return "";
}

export interface MarkdownOptions {
  notify?: (kind: ToastItem["kind"], message: string, options?: Omit<ToastItem, "id" | "kind" | "message">) => void;
  /** Opens a link; the desktop app passes `openUrl` from backend.ts. */
  onOpenLink?: (href: string) => void;
  /** The workspace folder: inline-code paths inside it become file links. */
  workspacePath?: string;
  /** Opens a file link (its absolute path). */
  onOpenFile?: (path: string) => void;
  /** Draws links instead of a plain <a> (the transcript passes LinkMenu.tsx's right-click menu). */
  Link?: ComponentType<{ href?: string; onOpenLink?: (href: string) => void; children?: ReactNode }>;
}

/** Conductor's `_Xs`: whether an inline-code value looks like a file path. */
export function looksLikePath(value: string): boolean {
  if (/\s/.test(value)) return false;
  const path = value.replace(/:\d+(:\d+)?$/, "");
  if (path.includes("://") || path.startsWith("http")) return false;
  if (path.startsWith(".") && !path.startsWith("./") && !path.includes("/")) return false;
  return path.startsWith("/") || path.startsWith("./") || (path.includes("/") && /\.[a-zA-Z0-9]{1,10}$/.test(path));
}

/** A normalized absolute file target strictly below the workspace, or undefined. */
export function resolveWorkspacePath(value: string, workspacePath: string | undefined): string | undefined {
  if (!workspacePath?.startsWith("/") || !looksLikePath(value) || /[\\\u0000]/.test(workspacePath)) return undefined;
  const normalize = (path: string) => {
    const segments: string[] = [];
    for (const segment of path.split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    return `/${segments.join("/")}`;
  };
  const root = normalize(workspacePath);
  const path = value.replace(/:\d+(:\d+)?$/, "");
  const target = normalize(path.startsWith("/") ? path : `${root}/${path}`);
  return target !== root && target.startsWith(root === "/" ? "/" : `${root}/`) ? target : undefined;
}

export function markdownComponents({ onOpenLink, workspacePath, onOpenFile, Link, notify }: MarkdownOptions = {}): Components {
  return {
    // The code component draws its own <pre> for blocks.
    pre: ({ children }) => h("div", { className: "md-pre" }, children),
    code: ({ className, children }) => {
      const text = childText(children);
      const language = languageOf(className);
      if (text.includes("\n")) {
        const code = h(CodeBlock, { language, content: text, notify });
        return language === "mermaid" ? h(MermaidBlock, { content: text, children: code }) : code;
      }
      const spans = highlight(language, text);
      if (spans) return h("code", { className: `md-code hljs${className ? ` ${className}` : ""}` }, spans);
      const code = h("code", { className: className ? `md-code ${className}` : "md-code" }, children);
      const file = className ? undefined : resolveWorkspacePath(text, workspacePath);
      if (file === undefined) return code;
      return h("button", { type: "button", className: "md-file-link", title: `Open ${file}`, onClick: () => onOpenFile?.(file) }, code);
    },
    a: ({ href, children, node }) => {
      const path = node?.properties["data-plain-file-path"];
      if (typeof path === "string") {
        const file = resolveWorkspacePath(path, workspacePath);
        return file === undefined
          ? h(Fragment, null, children)
          : h("button", { type: "button", className: "md-file-link", title: `Open ${file}`, onClick: () => onOpenFile?.(file) }, children);
      }
      return Link
        ? h(Link, { href, onOpenLink, children })
        : h(
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
          );
    },
    table: ({ children }) => h("div", { className: "md-table-scroll" }, h("table", null, children)),
  };
}

export function Markdown({ text, className, onOpenLink, workspacePath, onOpenFile, Link, notify }: { text: string; className?: string } & MarkdownOptions) {
  const frontmatter = splitFrontmatter(text);
  return h(
    "div",
    { className: className ? `md ${className}` : "md" },
    frontmatter && h(
      "section",
      { className: "md-frontmatter-card", "data-markdown-frontmatter": frontmatter.format },
      h("div", { className: "md-frontmatter-header" }, h("span", { className: "md-frontmatter-label" }, "Frontmatter")),
      h("pre", { className: "md-frontmatter-body" }, frontmatter.value),
    ),
    h(ReactMarkdown, { remarkPlugins, components: markdownComponents({ onOpenLink, workspacePath, onOpenFile, Link, notify }) }, frontmatter?.remainder ?? text),
  );
}
