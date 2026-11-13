import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Static data only: this checker never imports or evaluates the retained renderer.
const artifactPath = process.argv[2];
assert.ok(artifactPath, "Usage: node evidence/chat/frontmatter/check-reference.mjs <retained-renderer>");
const baseline = "3f6435a2bacf5c6fe0507b59eee2d898575947e0";
const expected = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(artifactPath);
assert.equal(bytes.length, 11600457);
assert.equal(hash(bytes), expected);
const manifest = JSON.parse(readFileSync("evidence/frontend/tauri-assets-manifest.json", "utf8"));
assert.equal(manifest.entries.find((entry) => entry.key === "/assets/renderApp-D_fmY7hW.js").sha256, expected);
const spans = [
  ["frontmatter-parser", 3520481, 3523906, 3508814, 3512239, "1c685df92c11c3fc849aecf1697493da223b0d45af5c1d2a22cbe207460fa3e4"],
  ["frontmatter-transform", 6116516, 6117631, 6073706, 6074821, "15aab9d7fc514bcd9f2175e2a8a0d9eb16777b5fcbb7d17f6016dba00fad65e5"],
  ["mdast-hast-override", 3257126, 3257745, 3256662, 3257281, "61aa67e8d0e10694f4023874b7562321a8e940ad472cfab8d713a41bd3717166"],
  ["markdown-pipeline", 3271344, 3271599, 3270880, 3271135, "7afcb510571f834e23233e6f17d0d3eb93c4049aa25beafbe69d4cef3341d5bc"],
  ["sanitizer-schema", 6118732, 6119499, 6075918, 6076685, "7f6d01020825febbb9c095e421cb65ba35823e10bcf34ea77814004ffcc5b705"],
  ["plugin-registration", 6545714, 6545913, 6502900, 6503099, "6ba7e78ee8244b5dbeff9fcec98a9b1837e3a0604af51dd3c571157acec1152b"],
  ["markdown-renderer", 6548274, 6548567, 6505460, 6505753, "86a76ce15009f4a3a4dd16419d083462484430dbbf2ba8f8c54ccdfa4615d534"],
  ["workspace-markdown-host", 6548725, 6550420, 6505911, 6507606, "efae9424849d941421c66cf6e9b644ef73ecb1a797ef638be08b3046358ede15"],
  ["message-dispatch", 8903984, 8906202, 8858488, 8860706, "9c0b7815917bcb53af03a450b2502b63e826529c220814b9139e65b8c78ae701"],
  ["assistant-parts", 8895884, 8896973, 8850389, 8851478, "4ccc42483a6dcf792da1f6bfd7a9495387221c975cd7f13f325d9d3f59d99f47"],
  ["assistant-text", 8870027, 8872955, 8824534, 8827462, "dd7922d301c44028dba2f8262034c8cd14db53c37d6a145edb108b987cfdf168"],
  ["standard-markdown-wrapper", 6550618, 6551722, 6507804, 6508908, "a07330f389b4cd51067832834b6418949256690d604ae6a6fea3902e7b9ac8e1"],
  ["tufte-markdown-wrapper", 7522646, 7522995, 7479572, 7479921, "236ff0045d1b7f303ffd3acdbc5d7fc8438eb308b728b681acee010694173754"],
  ["markdown-style-selector", 7522995, 7523518, 7479921, 7480444, "3adcf1f5071286305372b6a379038db3362dcff2f65ce9dd72af938792942fc0"],
  ["fence-line-ending", 3185713, 3185750, 3185255, 3185292, "06ad611ddfb5957ae00893ae59c9fda2e871a58f09ee0cf2bf0fbc8670b293d8"],
  ["fence-whitespace", 3185796, 3185841, 3185338, 3185383, "0904f7947c68d5747cb6c52675fb6fe02bf524b19b56429db719a51ea12525f8"],
  ["assistant-prefix-filter", 8865604, 8865874, 8820113, 8820381, "b38f44ef1ab8475baff228f7545c000308425bcc4d3d296d11fd4f3b00c92c7b"],
];
const content = new Map();
for (const [name, start, end, utf16Start, utf16End, sha256] of spans) {
  const slice = bytes.subarray(start, end);
  assert.equal(hash(slice), sha256, name);
  assert.equal(bytes.subarray(0, start).toString("utf8").length, utf16Start, name);
  assert.equal(bytes.subarray(0, end).toString("utf8").length, utf16End, name);
  content.set(name, slice.toString("utf8"));
}
const contains = (name, text) => assert.ok(content.get(name).includes(text), `${name}: ${text}`);
contains("message-dispatch", 'case"assistant"');
contains("message-dispatch", "p.jsx(GOo,");
contains("assistant-parts", "p.jsx(ROo,");
contains("assistant-text", 'i.type==="text"');
contains("assistant-text", "p.jsx(xS,{text:D");
contains("standard-markdown-wrapper", "p.jsx(pEi,{text:a");
contains("tufte-markdown-wrapper", "p.jsx(pEi,{text:i");
contains("markdown-style-selector", "u=c?Yuo:xS");
contains("workspace-markdown-host", "p.jsx(dHn,");
contains("markdown-renderer", "remarkPlugins:BXs");
contains("plugin-registration", "jXs=[FOs,Szs],FXs=Tzs,BXs=[jXs,FXs,");
contains("frontmatter-transform", 'const Szs=["yaml","toml"]');
contains("frontmatter-parser", "L.column===1&&(L.line===1||e)");
contains("frontmatter-parser", 'dUn(t.marker,e).repeat(3)');
contains("frontmatter-parser", 'n.value=e.replace(/^(\\r?\\n|\\r)|(\\r?\\n|\\r)$/g,"")');
contains("frontmatter-transform", 'hName:"section"');
contains("frontmatter-transform", '"data-markdown-frontmatter":e');
contains("frontmatter-transform", 'tagName:"pre"');
contains("frontmatter-transform", 'value:"Frontmatter"');
contains("frontmatter-transform", 'HSi=["not-prose","my-4","overflow-hidden","rounded-md","border","border-border","bg-card","text-card-foreground","shadow-xs"]');
contains("frontmatter-transform", 'VSi=["flex","items-center","border-b","border-border","bg-muted","px-3","py-2","text-xs"]');
contains("frontmatter-transform", 'WSi=["font-medium","text-muted-foreground"]');
contains("frontmatter-transform", 'GSi=["m-0","max-h-80","overflow-auto","whitespace-pre-wrap","break-words","bg-background","p-3","font-mono","text-xs","leading-relaxed","text-foreground"]');
contains("sanitizer-schema", "dataMarkdownFrontmatter");
contains("mdast-hast-override", "t.data.hChildren");
assert.equal(content.get("fence-line-ending"), "function _l(t){return t!==null&&t<-2}");
assert.equal(content.get("fence-whitespace"), "function Xu(t){return t===-2||t===-1||t===32}");
const source = execFileSync("git", ["show", `${baseline}:src/features/chat/markdown.ts`]);
assert.equal(hash(source), "3aff073f04f6aa6e7a8d5703471394c1e2dda6fceef4097c5a28b9e7c382af15");
assert.ok(!source.toString().toLowerCase().includes("frontmatter"));
assert.ok(source.includes(Buffer.from("h(ReactMarkdown, { remarkPlugins, components:")));
const fixture = readFileSync("src/features/chat/markdownFrontmatter.test.ts");
const fixtureSha256 = "b9363adc37a82d28587e6db5027a3d03c6b8d21128650f7c2d84348fa48f9f7e";
assert.equal(fixture.length, 7356);
assert.equal(hash(fixture), fixtureSha256, "hosted RED fixture must remain unchanged");
const cssImport = "@import './markdownFrontmatter.css';\n";
const cssBaseline = execFileSync("git", ["show", `${baseline}:src/features/chat/chat.css`], { encoding: "utf8" });
assert.equal(readFileSync("src/features/chat/chat.css", "utf8"), cssImport + cssBaseline);
const markdown = readFileSync("src/features/chat/markdown.ts", "utf8");
const bodyStart = "export function Markdown(";
assert.equal(
  markdown.split(bodyStart)[0].replace('import { splitFrontmatter } from "./markdownFrontmatter.ts";\n', ""),
  source.toString("utf8").split(bodyStart)[0],
  "existing components, callbacks and plugins must stay byte-identical",
);
assert.ok(!/import[^\n]+\.css/.test(markdown), "Node SSR must not import CSS");
console.log(JSON.stringify({
  kind: "retained-decoded-static-source-chain-not-execution",
  artifact: { bytes: bytes.length, sha256: expected },
  baseline, sourceSha256: hash(source),
  sourceBlob: execFileSync("git", ["rev-parse", `${baseline}:src/features/chat/markdown.ts`], { encoding: "utf8" }).trim(),
  reaReceipt: "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
  verifiedSpans: spans.length,
  fixture: { bytes: fixture.length, sha256: fixtureSha256 },
  scopeChecks: ["chat.css is only one top import", "Markdown pre-body source is unchanged except private-helper import"],
  spans: spans.map(([name, start, end, utf16Start, utf16End, sha256]) => ({ name, utf8: [start, end], utf16: [utf16Start, utf16End], sha256 })),
  limits: ["REA semantic renderer analysis skipped under heap exhaustion", "Ordinary visible text/direct Markdown only; transcript visibility gating not proven", "No vendor execution, reference render, browser, native or provider acceptance"],
}, null, 2));
