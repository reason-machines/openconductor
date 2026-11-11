export interface BrowserPage {
  workspaceId: string;
  url: string;
  reload: number;
}

export interface BrowserAddress {
  locked: string;
  hostname: string;
  rest: string;
}

export function previewUrl(value: string, applicationOrigin?: string): URL | null {
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.origin === applicationOrigin) return null;
    return url;
  } catch {
    return null;
  }
}

export function browserAddress(value: string): BrowserAddress {
  const url = new URL(value);
  return { locked: `${url.protocol}//${url.hostname}`, hostname: url.hostname, rest: `${url.port ? `:${url.port}` : ""}${url.pathname}${url.search}${url.hash}` };
}

export function editedPreviewUrl(current: string, edit: string): string | null {
  const address = browserAddress(current);
  let rest = edit.trim();
  if (rest && !rest.startsWith(":") && !rest.startsWith("/")) rest = /^\d/.test(rest) ? `:${rest}` : `/${rest}`;
  const url = previewUrl(`${address.locked}${rest}`);
  return url?.hostname === address.hostname ? url.href : null;
}
