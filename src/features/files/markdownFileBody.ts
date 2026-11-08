import { createElement as h, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { externalMarkdownLink, markdownPreviewClass } from "./fileView.ts";

export function MarkdownFileBody({ text, style, onOpenLink }: { text: string; style?: string; onOpenLink?: (href: string) => void }) {
  return h("div", { className: markdownPreviewClass(style) },
    h(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      skipHtml: true,
      components: {
        a: ({ href, children }) => {
          const safe = href ? externalMarkdownLink(href) : undefined;
          return safe ? h("a", { href: safe, onClick: (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onOpenLink?.(safe); } }, children) : h("span", null, children);
        },
        img: ({ alt }) => h("span", { className: "markdown-file-image" }, alt ?? "Image"),
      },
      children: text,
    }),
  );
}
