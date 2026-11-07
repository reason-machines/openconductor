import mermaid from "mermaid";
import DOMPurify from "dompurify";
import "./mermaid.css";

// Mermaid can embed HTML, images, actions and user configuration. None belongs
// in an untrusted transcript. Reject those before Mermaid creates any DOM.
export function isSafeDiagramSource(source: string): boolean {
  return source.length <= 20_000
    && !/^\s*---/.test(source)
    && !/%%\s*\{|<\s*[!/?a-z]|!\s*\[|\b(?:click|link|links|classDef|style|linkStyle)\s|\b(?:img|icon)\s*:|url\s*\(|@import|@font-face/i.test(source);
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  maxTextSize: 20_000,
  maxEdges: 300,
  theme: "base",
  htmlLabels: false,
  flowchart: { htmlLabels: false },
});

/** Only inert SVG geometry/text survives; all paint comes from our own CSS. */
export function sanitizeDiagram(svg: string): string | null {
  const clean = DOMPurify.sanitize(svg, {
    ALLOWED_TAGS: ["svg", "g", "defs", "marker", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc", "clipPath"],
    ALLOWED_ATTR: ["xmlns", "id", "class", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "fill", "stroke", "stroke-width", "stroke-dasharray", "text-anchor", "dominant-baseline", "dx", "dy", "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient", "clip-path", "preserveAspectRatio", "role", "aria-labelledby", "aria-describedby"],
    ALLOW_DATA_ATTR: false,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  const root = template.content.querySelector("svg");
  if (!root) return null;
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(element.attributes)) {
      if (/url\s*\(/i.test(attribute.value) && !/^url\(#[\w-]+\)$/.test(attribute.value)) element.removeAttribute(attribute.name);
    }
  }
  const [, , width, height] = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return null;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return root.outerHTML;
}

let nextId = 0;
export async function renderMermaid(source: string): Promise<string | null> {
  if (!isSafeDiagramSource(source)) return null;
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  document.body.append(container);
  try {
    if (!await mermaid.parse(source, { suppressErrors: true })) return null;
    const { svg } = await mermaid.render(`oc-mermaid-${++nextId}`, source, container);
    return sanitizeDiagram(svg);
  } catch {
    // Partial streaming input and syntax errors remain readable as code.
    return null;
  } finally {
    container.remove();
  }
}
