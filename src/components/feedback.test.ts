import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { FEEDBACK_COPY, feedbackDraftUrl, openFeedbackDraft } from "./feedback.ts";

function draft(message: string) {
  const url = feedbackDraftUrl({ message, appVersion: "0.1.0", platform: "macos" });
  assert.ok(url);
  return new URL(url);
}

test("empty feedback never becomes an issue draft", async () => {
  for (const message of ["", "  \n\t "]) {
    assert.equal(feedbackDraftUrl({ message }), null);
    assert.deepEqual(await openFeedbackDraft({ message, openUrl: async () => assert.fail("must not open") }), { kind: "empty" });
  }
});

test("the GitHub draft contains only trimmed feedback and known version/platform metadata", () => {
  const url = draft("  Missing button\nDetails & repro #1  ");
  assert.equal(url.origin + url.pathname, "https://github.com/reason-machines/openconductor/issues/new");
  assert.deepEqual([...url.searchParams.keys()], ["title", "body"]);
  assert.equal(url.searchParams.get("title"), "Feedback: Missing button");
  assert.equal(url.searchParams.get("body"), "Missing button\nDetails & repro #1\n\n----\nApp Version: 0.1.0\nOS: macos");
  assert.match(FEEDBACK_COPY.privacy, /public GitHub issue draft/);
  assert.match(FEEDBACK_COPY.submit, /GitHub/);
});

test("draft titles shorten the first line and URL encoding preserves Unicode and query characters", () => {
  const long = draft(`${"a".repeat(100)}\nsecond line`);
  assert.equal(long.searchParams.get("title"), `Feedback: ${"a".repeat(71)}…`);
  const unicode = draft("Bergen æøå & ?#\r\nSecond line");
  assert.equal(unicode.searchParams.get("title"), "Feedback: Bergen æøå & ?#");
  assert.match(unicode.searchParams.get("body") ?? "", /^Bergen æøå & \?#\r\nSecond line/);
  const unknown = feedbackDraftUrl({ message: "Report" });
  assert.ok(unknown);
  assert.match(new URL(unknown).searchParams.get("body") ?? "", /App Version: unknown\nOS: unknown$/);
});

const component = readFileSync(new URL("./FeedbackDialog.tsx", import.meta.url), "utf8");
const start = component.indexOf("  const submit = ");
const end = component.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start);
const submitSource = stripTypeScriptTypes(component.slice(start, end + "\n  };".length));

function bindSubmit(message: string, openUrl: (url: string) => Promise<unknown>) {
  const events: string[] = [];
  const inFlight = { current: false };
  let error: string | undefined;
  const submit: () => Promise<void> = new Function(
    "message", "appVersion", "platform", "inFlight", "setSubmission", "openFeedbackDraft", "openUrl", "onClose",
    `${submitSource}\nreturn submit;`,
  )(
    message, "0.1.0", "macos", inFlight,
    (state: { kind: string; message?: string }) => { events.push(state.kind); error = state.message; },
    openFeedbackDraft, openUrl, () => events.push("closed"),
  );
  return { submit, events, inFlight, error: () => error };
}

test("the actual dialog submit callback ignores whitespace without closing or opening", async () => {
  const dialog = bindSubmit(" \n ", async () => assert.fail("must not open"));
  await dialog.submit();
  assert.deepEqual(dialog.events, []);
});

test("the actual submit callback waits for the handoff and ignores duplicate submissions", async () => {
  let resolve: () => void = () => assert.fail("opener not called");
  const opened: string[] = [];
  const dialog = bindSubmit("Report", (url) => {
    opened.push(url);
    return new Promise<void>((done) => { resolve = done; });
  });
  const first = dialog.submit();
  assert.deepEqual(dialog.events, ["opening"]);
  assert.equal(dialog.inFlight.current, true);
  await dialog.submit();
  assert.equal(opened.length, 1);
  assert.equal(new URL(opened[0]).hostname, "github.com");
  resolve();
  await first;
  assert.deepEqual(dialog.events, ["opening", "closed"]);
  assert.equal(dialog.inFlight.current, false);
});

test("a failed handoff leaves the dialog open, reports an error and lets the same draft retry", async () => {
  let attempts = 0;
  const urls: string[] = [];
  const dialog = bindSubmit("Keep my report", async (url) => {
    urls.push(url);
    if (++attempts === 1) throw new Error("transport failed");
  });
  await dialog.submit();
  assert.deepEqual(dialog.events, ["opening", "error"]);
  assert.equal(dialog.error(), FEEDBACK_COPY.openError);
  assert.equal(dialog.inFlight.current, false);
  await dialog.submit();
  assert.deepEqual(dialog.events, ["opening", "error", "opening", "closed"]);
  assert.equal(urls[0], urls[1]);
});

test("source contract connects the form and scoped primary action to the guarded callback", () => {
  assert.match(component, /onSubmit=\{\(event\) => \{ void submit\(event\); \}\}/);
  assert.match(component, /"dialog.primaryAction": \(\) => \{ void submit\(\); \}/);
  assert.match(component, /enableOnDialogIds: \[FEEDBACK_DIALOG_ID\], enableOnInputFocus: true/);
  assert.match(component, /rows=\{5\} required autoFocus disabled=\{opening\}/);
  assert.match(component, /disabled=\{!message.trim\(\) \|\| opening\}/);
  assert.match(component, /role="alert"/);
});
