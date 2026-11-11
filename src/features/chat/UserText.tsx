import type { ReactNode } from "react";
import { openUrl } from "../../backend.ts";
import { LinkWithMenu } from "./LinkMenu.tsx";

function trimUserUrl(candidate: string): string {
  let end = candidate.length;
  while (end > 0) {
    const last = candidate.charAt(end - 1);
    const opening = last === ")" ? "(" : last === "]" ? "[" : last === "}" ? "{" : undefined;
    if (opening) {
      let balance = 0;
      for (const char of candidate.slice(0, end)) {
        if (char === opening) balance++;
        else if (char === last) balance--;
      }
      if (balance < 0) {
        end--;
        continue;
      }
    }
    if (".,!?;:\"'".includes(last)) {
      end--;
      continue;
    }
    break;
  }
  return candidate.slice(0, end);
}

function isOrdinaryUserUrl(href: string): boolean {
  const hasPreviewText = /(?:wikipedia|wiktionary)\.org/.test(href);
  if (hasPreviewText) return false;
  try {
    const url = new URL(href);
    const workspaceOrigin = url.origin === "https://app.conductor.build"
      || url.origin === "https://stage-app.conductor.build"
      || url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return !(workspaceOrigin && /^\/workspace\/[^/]+$/.test(url.pathname));
  } catch {
    return true;
  }
}

export function UserText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
    const href = trimUserUrl(match[0]);
    parts.push(text.slice(cursor, match.index));
    parts.push(isOrdinaryUserUrl(href)
      ? <LinkWithMenu key={match.index} href={href} onOpenLink={(href) => void openUrl(href)}>{href}</LinkWithMenu>
      : href);
    cursor = match.index + href.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
