// parity:diff.comments-github:ui
// Comment bodies rendered as markdown the way Conductor's comment card does
// (renderApp, read with a bundle string search on sven m5 max; evidence/diff/comments-to-chat.md).
// It reuses the chat's markdown (features/chat/markdown.ts: react-markdown,
// remark-gfm, remark-breaks, highlighted code blocks, links through openUrl)
// and adds what Conductor adds for comments only: rehype-raw, then
// rehype-sanitize on the default schema plus sub, sup, details and summary.
// So raw HTML in a GitHub comment (images, <details>) renders, and scripts,
// event handlers and javascript: links are stripped. Chat text keeps escaping
// raw HTML. Written without JSX so node's test runner can render it.
import { createElement as h, useMemo, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { markdownComponents, remarkPlugins, type MarkdownOptions } from "../chat/markdown.ts";

export const commentSanitizeSchema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames ?? []), "sub", "sup", "details", "summary"] };

const rehypePlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]> = [rehypeRaw, [rehypeSanitize, commentSanitizeSchema]];

/** `onOpenLink`: the app passes backend.ts's `openUrl`, as the chat does. */
export function CommentMarkdown({ text, onOpenLink }: { text: string } & MarkdownOptions): ReactElement {
  const components = useMemo(() => markdownComponents({ onOpenLink }), [onOpenLink]);
  return h("div", { className: "md oc-md" }, h(ReactMarkdown, { remarkPlugins, rehypePlugins, components }, text));
}
