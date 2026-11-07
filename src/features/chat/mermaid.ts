import { createElement as h, useEffect, useState, type ReactNode } from "react";

/** Keep the source visible until a current, safe diagram is ready (including SSR). */
export function MermaidBlock({ content, children }: { content: string; children: ReactNode }) {
  const [result, setResult] = useState<{ content: string; svg: string } | null>(null);
  useEffect(() => {
    let current = true;
    void import("./mermaidRenderer").then(({ renderMermaid }) => renderMermaid(content)).then(
      (svg) => { if (current) setResult(svg ? { content, svg } : null); },
      () => { if (current) setResult(null); },
    );
    return () => { current = false; };
  }, [content]);
  if (!result || result.content !== content) return children;
  return h("div", { className: "md-mermaid" },
    h("div", { className: "md-mermaid-diagram", role: "img", "aria-label": "Mermaid diagram", dangerouslySetInnerHTML: { __html: result.svg } }),
    h("details", null, h("summary", null, "Diagram source"), children),
  );
}
