import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.BASE_URL ?? "http://localhost:4549";
const out = process.env.OUT ?? ".rea-work/mermaid-checks";
if (process.argv.includes("--serve")) {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { host: "0.0.0.0", port: Number(new URL(origin).port), strictPort: true } });
  await server.listen();
}
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [], external = [], checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
  return route.continue();
});
await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copiedCode = text; } } }); });
const fence = (source) => `\`\`\`mermaid\n${source}\n\`\`\``;
const sample = "flowchart LR\n  A[Request] --> B[Response]";
try {
  await page.goto(`${origin}/tools/chat/mermaid-fixture.html`);
  const diagram = page.getByRole("img", { name: "Mermaid diagram", exact: true });
  await diagram.locator("svg").waitFor({ timeout: 30000 });
  assert.match(await diagram.innerText(), /Request/);
  assert.match(await diagram.innerText(), /Response/);
  assert.equal(await diagram.locator("path").count() > 0, true);
  assert.equal(await diagram.locator("a,image,foreignObject,script,style,[style],[href],[onload]").count(), 0);
  checks.push("Exact Request -> Response sample renders inert accessible SVG");
  await page.screenshot({ path: path.join(out, "light.png") });
  const light = await diagram.locator("text").first().evaluate((el) => getComputedStyle(el).fill);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  const dark = await diagram.locator("text").first().evaluate((el) => getComputedStyle(el).fill);
  assert.notEqual(light, dark);
  await page.screenshot({ path: path.join(out, "dark.png") });
  checks.push("Existing diagram updates colors on light/dark theme changes");
  await page.getByText("Diagram source", { exact: true }).click();
  await page.locator(".md-code-block").hover();
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedCode), sample);
  checks.push("Rendered diagram preserves source and code-copy payload");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  const unsafe = [
    '%%{init: {"securityLevel":"loose","flowchart":{"htmlLabels":true}}}%%\n' + sample,
    '---\nconfig:\n  securityLevel: loose\n---\n' + sample,
    'flowchart LR\n A["<img src=https://example.invalid/pixel onerror=alert(1)>"]',
    'flowchart LR\n A["![image](https://example.invalid/pixel)"]',
    sample + '\nclick A "https://example.invalid/"',
    'sequenceDiagram\n participant A\n link A: Open @ https://example.invalid/',
    'flowchart LR\n A@{ img: "https://example.invalid/pixel" }',
    sample + '\nclassDef default fill:url(https://example.invalid/paint)',
    sample + '\nstyle A fill:url(https://example.invalid/paint)',
    'flowchart LR\n A[unfinished',
    'not a diagram',
    'flowchart LR\n' + 'x'.repeat(20_001),
  ];
  for (const source of unsafe) {
    await editor.fill(fence(source));
    await page.locator(".md-code-block").waitFor();
    await page.waitForTimeout(150);
    assert.equal(await diagram.count(), 0, source.slice(0, 80));
    assert.equal(await page.locator(".md-code-scroll").innerText(), source);
  }
  checks.push("Directives, frontmatter, HTML, images, actions, malformed/partial and oversized input fall back to readable code");
  for (const source of [sample, 'flowchart LR\n OLD[Old] --> Z[Stale]', 'flowchart LR\n FINAL[Latest] --> Z[Current]']) await editor.fill(fence(source));
  await diagram.locator("svg").waitFor();
  await page.waitForFunction(() => document.querySelector(".md-mermaid-diagram")?.textContent.includes("Latest"));
  assert.doesNotMatch(await diagram.innerText(), /Old|Stale|Request/);
  await editor.fill("```js\nconst safe = 1;\n```");
  await page.locator(".hljs-keyword").waitFor();
  await page.waitForTimeout(200);
  assert.equal(await diagram.count(), 0);
  await page.locator(".md-code-block").hover();
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedCode), "const safe = 1;");
  checks.push("Rapid source changes never publish stale SVG; ordinary highlighted fences and copy still work");
  const sanitized = await page.evaluate(async () => {
    const { sanitizeDiagram } = await import("/src/features/chat/mermaidRenderer.ts");
    return sanitizeDiagram('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>@import "https://example.invalid/css";</style><a href="javascript:alert(1)"><text>safe</text></a><image href="https://example.invalid/x"/><foreignObject>bad</foreignObject><script>alert(1)</script><path onload="alert(1)" style="fill:red" fill="url(https://example.invalid/x)" d="M0 0"/></svg>');
  });
  assert.doesNotMatch(sanitized, /https:|javascript:|<style|<a |<image|foreignObject|<script|onload|style=/);
  checks.push("SVG boundary strips active tags, CSS, handlers and external paint URLs");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  checks.push("Zero page errors and zero external HTTP requests during all parsing/rendering cases");
  await editor.fill(fence(sample));
  await diagram.locator("svg").waitFor();
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png") });
  fs.writeFileSync(path.join(out, "failure.txt"), String(error));
  throw error;
} finally {
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify({ checks, errors, external }, null, 2));
  await browser.close();
}
for (const check of checks) console.log(`PASS ${check}`);
