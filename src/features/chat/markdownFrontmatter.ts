type Frontmatter = {
  format: "yaml" | "toml";
  value: string;
  remainder: string;
};

export function splitFrontmatter(text: string): Frontmatter | undefined {
  const opening = /^(---|\+\+\+)[ \t]*(?:\r\n|\r|\n)/.exec(text);
  if (!opening) return undefined;

  const marker = opening[1];
  const bodyStart = opening[0].length;
  const lineEnding = /\r\n|\r|\n/g;
  let lineStart = bodyStart;
  while (lineStart <= text.length) {
    lineEnding.lastIndex = lineStart;
    const boundary = lineEnding.exec(text);
    const lineEnd = boundary?.index ?? text.length;
    const line = text.slice(lineStart, lineEnd);
    if (line.startsWith(marker) && /^[ \t]*$/.test(line.slice(marker.length))) {
      return {
        format: marker === "---" ? "yaml" : "toml",
        value: text.slice(bodyStart, lineStart).replace(/(?:\r\n|\r|\n)$/, ""),
        remainder: text.slice(boundary ? lineEnding.lastIndex : lineEnd),
      };
    }
    if (!boundary) return undefined;
    lineStart = lineEnding.lastIndex;
  }
  return undefined;
}
