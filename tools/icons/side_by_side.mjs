// Renders parity/side-by-side/icons/*.png: each shared icon as it was before
// this change (main's hand-drawn Icons.tsx), as Conductor draws it (the Lucide
// geometry REA extracted from Conductor v0.87.6: chat icons and repo icons),
// and as the shared set draws it now, in light and dark themes.
//
// Usage: node tools/icons/side_by_side.mjs [old-ref=origin/main]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");
const { chromium } = require("playwright-core");
const oldRef = process.argv[2] ?? "origin/main";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icon-sbs-"));
fs.writeFileSync(path.join(tmp, "OldIcons.tsx"), execFileSync("git", ["show", `${oldRef}:src/components/Icons.tsx`], { cwd: root, encoding: "utf8" }));

// Each row: label, the export in the old and new modules, and the Lucide name Conductor uses.
const rows = [
  ["folder", "FolderIcon", "folder"], ["cloud", "CloudIcon", "cloud"], ["sparkle", "SparkIcon", "sparkle"],
  ["house", "HomeIcon", "house"], ["panel-left", "SidebarIcon", "panel-left"], ["plus", "PlusIcon", "plus"],
  ["chevron-right", "ChevronIcon", "chevron-right"], ["git-branch", "BranchIcon", "git-branch"],
  ["paperclip", "PaperclipIcon", "paperclip"], ["send-horizontal", "SendIcon", "send-horizontal"],
  ["file", "FileIcon", "file"], ["keyboard", "KeyboardIcon", "keyboard"], ["search", "SearchIcon", "search"],
  ["x", "CloseIcon", "x"], ["lock", "LockIcon", "lock"], ["archive", "ArchiveIcon", "archive"],
  ["arrow-left", "ArrowLeftIcon", "arrow-left"], ["arrow-right", "ArrowRightIcon", "arrow-right"],
  ["ellipsis", "MoreIcon", "ellipsis"], ["code-xml", "CodeIcon", "code-xml"], ["chevron-down", "ChevronDownIcon", "chevron-down"],
  ["circle-question-mark", "HelpIcon", "circle-question-mark"], ["settings", "SettingsIcon", "settings"],
  ["book-open", "BookIcon", "book-open"], ["message-square", "MessageIcon", "message-square"],
  ["external-link", "ExternalIcon", "external-link"], ["file-code", "FileCodeIcon", "file-code"],
  ["globe", "GlobeIcon", "globe"], ["folder-plus", "FolderPlusIcon", "folder-plus"], ["cpu", "ChipIcon", "cpu"],
  ["terminal", "TerminalIcon", "terminal"], ["layers", "LayersIcon", "layers"], ["list-tree", "ListTreeIcon", "list-tree"],
  ["copy", "CopyIcon", "copy"], ["check", "CheckIcon", "check"], ["chevron-up", "ChevronUpIcon", "chevron-up"],
  ["user", "UserIcon", "user"],
];
const rowsJson = JSON.stringify(rows.map(([label, exp, lucide]) => ({ label, exp, lucide })));

fs.writeFileSync(path.join(tmp, "entry.tsx"), `
import { renderToStaticMarkup } from "react-dom/server";
import * as Old from "./OldIcons";
import * as New from "${path.join(root, "src/components/Icons").replace(/\\/g, "/")}";
import { LUCIDE } from "${path.join(root, "src/features/chat/toolIconData").replace(/\\/g, "/")}";
import { REPO_ICONS } from "${path.join(root, "src/components/repoIcons.generated").replace(/\\/g, "/")}";
const rows = ${rowsJson};
const conductorGeometry = (name: string) => (LUCIDE as Record<string, any>)[name] ?? (REPO_ICONS as Record<string, any>)[name];
const render = (node: any) => renderToStaticMarkup(node);
const out = rows.map((r: any) => {
  const OldC = (Old as any)[r.exp];
  const NewC = (New as any)[r.exp];
  const geo = conductorGeometry(r.lucide);
  const conductor = geo
    ? render(<svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {geo.map(([tag, attrs]: any, i: number) => { const T = tag as "path"; return <T key={i} {...attrs} />; })}
      </svg>)
    : "";
  return { label: r.label, before: render(<OldC size={24} />), conductor, after: render(<NewC size={24} />), source: geo ? (r.lucide in LUCIDE ? "chat" : "repo") : "none" };
});
console.log(JSON.stringify(out));
`);

const bundle = path.join(tmp, "entry.bundle.cjs");
await esbuild.build({
  entryPoints: [path.join(tmp, "entry.tsx")], bundle: true, format: "cjs", platform: "node", outfile: bundle,
  jsx: "automatic", define: { "process.env.NODE_ENV": "\"production\"" },
  nodePaths: [path.join(root, "node_modules")], logLevel: "error",
});
const data = JSON.parse(execFileSync("node", [bundle], { encoding: "utf8" }));

const missing = data.filter((d) => d.source === "none").map((d) => d.label);
const cell = (svg, extra = "") => `<div class="cell" style="${extra}">${svg}</div>`;
const htmlFor = (theme) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:24px;font:13px -apple-system,system-ui,sans-serif;background:${theme === "dark" ? "#1c1f26" : "#ffffff"};color:${theme === "dark" ? "#e6e8ee" : "#1d2330"}}
  h2{font-size:15px;margin:0 0 12px}
  table{border-collapse:collapse}
  th,td{padding:6px 14px;text-align:left;vertical-align:middle}
  th{font-weight:600;color:${theme === "dark" ? "#9aa3b2" : "#5b6474"};border-bottom:1px solid ${theme === "dark" ? "#333a47" : "#e1e4ea"}}
  td.name{font-family:ui-monospace,Menlo,monospace;color:${theme === "dark" ? "#9aa3b2" : "#5b6474"}}
  .cell{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px}
  .note{margin-top:14px;color:${theme === "dark" ? "#9aa3b2" : "#5b6474"};font-size:12px}
</style></head><body>
<h2>Conductor icons: before (hand-drawn, stroke 1.8) · Conductor (extracted Lucide geometry, stroke 2) · after (shared set, stroke 2) — ${theme}</h2>
<table><thead><tr><th>Icon</th><th>Before</th><th>Conductor</th><th>After</th></tr></thead><tbody>
${data.map((d) => `<tr><td class="name">${d.label}</td><td>${cell(d.before)}</td><td>${d.conductor ? cell(d.conductor) : cell("", "")}</td><td>${cell(d.after)}</td></tr>`).join("\n")}
</tbody></table>
<div class="note">Conductor column: the same Lucide geometry the chat and repo icons come from (tools/icons). ${missing.length ? "No extracted Conductor geometry for: " + missing.join(", ") + "." : ""}</div>
</body></html>`;

const outDir = path.join(root, "parity/side-by-side/icons");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 620, height: 1100 }, deviceScaleFactor: 2 });
for (const theme of ["light", "dark"]) {
  await page.setContent(htmlFor(theme));
  await page.screenshot({ path: path.join(outDir, `shared-icons-${theme}.png`), fullPage: true });
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`icons: ${data.length}; no Conductor geometry: ${missing.length ? missing.join(",") : "none"}`);
