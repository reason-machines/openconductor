export function isMarkdownFile(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

export function markdownPreviewClass(style: string | undefined): string {
  return `markdown-file-preview${style === "tufte" ? " tufte" : ""}`;
}

export function externalMarkdownLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
