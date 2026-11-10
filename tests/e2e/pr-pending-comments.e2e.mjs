// End-to-end check of the PR header's "changes requested" state: with no
// unsent diff comment it is a plain status; a pending comment turns it into
// "Add all comments to chat" (Conductor's `hasPendingComments`), which puts
// the comment into the chat composer and goes back to the status once the
// comment is sent. The PR demo scenario "changes" is a PR with changes
// requested. Run after `npm run build`:
//
//   node --test tests/e2e/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

const ROW = '[data-testid="left-sidebar-workspace-item"]';

test("changes requested offers Add all comments to chat only while a diff comment is unsent", async (t) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("openconductor.pr.demo", "changes"));
  await page.goto(`${base}/?demo=1`);
  await page.locator(ROW).first().waitFor();
  await page.locator(ROW).nth(1).click();

  const header = page.locator("header");
  await header.getByRole("button", { name: "Changes requested" }).waitFor();
  assert.equal(await header.getByRole("button", { name: "Add all comments to chat" }).count(), 0);

  // Comment on line 2 of a changed file.
  await page.locator("button.oc-change", { hasText: "src/server/ready.ts" }).click();
  await page.getByText('return new Response("ready");').waitFor();
  const line = page.getByText('return new Response("ready");');
  const box = await line.boundingBox();
  if (box === null) {
    try {
      const snapshot = await line.evaluateAll((matches) => {
        const describe = (element) => {
          const style = getComputedStyle(element);
          return {
            tag: element.tagName, id: element.id.slice(0, 200), classes: element.getAttribute("class")?.slice(0, 200),
            isConnected: element.isConnected, hidden: element.hasAttribute("hidden"), ariaHidden: element.getAttribute("aria-hidden")?.slice(0, 200),
            display: style.display, visibility: style.visibility, opacity: style.opacity, contentVisibility: style.contentVisibility,
            overflowX: style.overflowX, overflowY: style.overflowY,
            rect: element.getBoundingClientRect().toJSON(),
            clientRects: Array.from(element.getClientRects()).slice(0, 4).map((rect) => rect.toJSON()),
          };
        };
        return {
          matchCount: matches.length,
          matches: matches.slice(0, 4).map((element) => {
            const ancestors = [];
            for (let parent = element.parentElement; parent && ancestors.length < 6; parent = parent.parentElement) ancestors.push(describe(parent));
            return { ...describe(element), ancestors };
          }),
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, scrollX, scrollY, visibilityState: document.visibilityState },
        };
      });
      t.diagnostic(`[pending-comment-geometry] ${JSON.stringify(snapshot)}`);
    } catch (diagnosticError) {
      try { t.diagnostic(`[pending-comment-geometry] ${JSON.stringify({ captureError: String(diagnosticError).slice(0, 2000) })}`); } catch {}
    }
  }
  await page.mouse.click(box.x - 18, box.y + box.height / 2);
  const note = page.getByPlaceholder(/^Leave a comment/);
  await note.fill("Return 204 here, the reviewer asked for no body.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  const add = header.getByRole("button", { name: "Add all comments to chat" });
  await add.waitFor();
  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/pr-pending-comments.png` });
  }
  await add.click();

  // The comment reaches the workspace chat as an attachment carrying its comment id (#378), not composer text.
  const chip = page.locator(".composer-attachment", { hasText: "ready.ts +2" });
  await chip.waitFor();
  assert.match((await chip.getAttribute("title")) ?? "", /File: src\/server\/ready\.ts[\s\S]*Return 204 here/);
  await header.getByRole("button", { name: "Changes requested" }).waitFor();
  assert.equal(await add.count(), 0);
  await page.close();
});

// Comments the browser comment store hands back for every workspace (commentStore.ts keeps them
// under `openconductor.diff.comments.<workspaceId>`; demo workspace ids are random per load).
const seeded = (over) => ({
  workspace_id: "w", file_path: "src/server/ready.ts", line_number: 2, end_line_number: null, body: "", state: "pending",
  location: "modified", file_level: false, created_at: 1, updated_at: null, remote_url: null, author: null, author_avatar_url: null,
  thread_id: null, reply_to_comment_id: null, is_outdated: false, is_resolved: false, suggestion_base_code: null, ...over,
});

test("an empty comment doesn't offer Add all comments to chat; bodies render as markdown; Delete follows the reference", async () => {
  const comments = [
    // A GitHub comment on the PR itself: pending but outdated, so it is not sent, and it is not deletable while pending.
    seeded({ id: "github-general-1", file_path: "", line_number: 0, location: "file", file_level: true, is_outdated: true, body: "**LGTM** overall, see `ready.ts`.", remote_url: "https://github.com/acme/web/pull/42#issuecomment-1", author: "octo" }),
    // A local comment with no text.
    seeded({ id: "empty", body: "" }),
    // A GitHub review comment already added to the chat.
    seeded({ id: "github-T1-7", thread_id: "T1", state: "sent", body: "Return `204` here, **no body**:\n\n- one\n- two", remote_url: "https://github.com/acme/web/pull/42#discussion_r7", author: "octo" }),
  ];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((json) => {
    localStorage.setItem("openconductor.pr.demo", "changes");
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      const v = get.call(this, key);
      return v === null && key.startsWith("openconductor.diff.comments.") ? json : v;
    };
  }, JSON.stringify(comments));
  await page.goto(`${base}/?demo=1`);
  await page.locator(ROW).first().waitFor();
  await page.locator(ROW).nth(1).click();

  const header = page.locator("header");
  await header.getByRole("button", { name: "Changes requested" }).waitFor();
  await page.locator("button.oc-change", { hasText: "src/server/ready.ts" }).click();
  await page.getByText('return new Response("ready");').waitFor();

  // (a) Nothing sendable is pending, so the header stays a status.
  assert.equal(await header.getByRole("button", { name: "Add all comments to chat" }).count(), 0);

  // (b) The review comment's body is markdown.
  const review = page.locator(".oc-comment", { hasText: "no body" });
  await review.waitFor();
  assert.equal(await review.locator(".oc-comment-body code.md-code", { hasText: "204" }).count(), 1);
  assert.equal(await review.locator(".oc-comment-body strong", { hasText: "no body" }).count(), 1);
  assert.equal(await review.locator(".oc-comment-body li").count(), 2);
  assert.doesNotMatch(await review.locator(".oc-comment-body").innerText(), /\*\*/);

  // (c) A sent GitHub comment can be deleted; the pending PR-level one cannot (Conductor's pending card).
  assert.equal(await review.getByRole("button", { name: "Delete" }).count(), 1);
  await page.locator(".oc-pr-comments summary").click();
  const prComment = page.locator(".oc-comment", { hasText: "overall" });
  await prComment.waitFor();
  assert.equal(await prComment.locator(".oc-comment-body strong", { hasText: "LGTM" }).count(), 1);
  assert.equal(await prComment.getByRole("button", { name: "Delete" }).count(), 0);

  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/diff-comment-markdown.png` });
  }
  await page.close();
});
