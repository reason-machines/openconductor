// parity:diff.comments-github:ui parity:diff.comments-inline:ui
// A review comment's body as markdown, the way Conductor's comment card draws
// it (renderApp 0.87.6 `MMi`, read with REA bundle slices; see
// evidence/diff/comments-github.md):
//
// - the chat's remark plugins (GitHub-flavoured markdown, hard line breaks)
//   and components (links through `openUrl`, highlighted code blocks);
// - raw HTML in the body (GitHub bots post <details>, <sub>, ...) is parsed
//   and then sanitized with hast-util-sanitize's default schema plus
//   sub / sup / details / summary, as the reference does; scripts, styles,
//   event handlers and javascript: links are dropped;
// - a ```suggestion fence is drawn as a "Suggested change" (base code removed,
//   suggestion added) when the code it replaces is known, else as a code block.
//
// No JSX so commentMarkdown.test.ts can render it with react-dom/server.

import { createElement as h, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import { languageOf, markdownComponents, remarkPlugins, type MarkdownOptions } from "../chat/markdown.ts";
import { suggestionRows } from "./comments.ts";

/** The reference's sanitize schema: the default plus a few tags GitHub comments use. */
export const commentSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sub", "sup", "details", "summary"],
};

const rehypePlugins = [rehypeRaw, [rehypeSanitize, commentSanitizeSchema]] as const;

function text(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(text).join("");
  return "";
}

/** A ```suggestion block on GitHub, shown as the change it proposes. */
export function SuggestedChange({ base, code }: { base: string; code: string }) {
  return h(
    "div",
    { className: "oc-suggestion" },
    h("div", { className: "oc-suggestion-head" }, "Suggested change"),
    ...suggestionRows(base, code).map((r, i) => h("div", { key: i, className: `oc-suggestion-row ${r.kind}` }, h("span", { className: "sign" }, r.kind === "del" ? "-" : "+"), r.text)),
  );
}

export interface CommentMarkdownProps extends MarkdownOptions {
  body: string;
  /** Code a GitHub suggestion replaces; null when unknown (suggestions then show as code). */
  suggestionBaseCode: string | null;
}

export function CommentMarkdown({ body, suggestionBaseCode, onOpenLink }: CommentMarkdownProps) {
  if (!body) return null;
  const base = markdownComponents({ onOpenLink });
  const components: Components = {
    ...base,
    code: (props) => {
      if (suggestionBaseCode !== null && languageOf(props.className) === "suggestion") {
        return h(SuggestedChange, { base: suggestionBaseCode, code: text(props.children).replace(/\n$/, "") });
      }
      const Code = base.code as (p: typeof props) => ReactNode;
      return Code(props);
    },
  };
  return h(
    "div",
    { className: "md oc-comment-body" },
    // rehype-sanitize's Options type and unified's PluggableList disagree on readonly tuples.
    h(ReactMarkdown, { remarkPlugins, rehypePlugins: rehypePlugins as never, components }, body),
  );
}
