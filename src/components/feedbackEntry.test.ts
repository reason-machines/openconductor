import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { FEEDBACK_URL, HELP_ITEMS, type HelpItem } from "./helpMenuItems.ts";

const help = readFileSync(new URL("./HelpMenu.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const feedback = HELP_ITEMS.find((item) => item.commandId === "sendFeedback");

test("Send feedback is an in-app action, not an external link", () => {
  assert.ok(feedback);
  assert.deepEqual(feedback.action, { kind: "feedback" });
});

test("the actual Help selection callback closes Help and opens feedback without opening a URL", () => {
  assert.ok(feedback);
  const start = help.indexOf("  const select = ");
  const end = help.indexOf("\n  };", start);
  assert.ok(start >= 0 && end > start);
  const events: string[] = [];
  const callback = stripTypeScriptTypes(help.slice(start, end + "\n  };".length));
  const select: (item: HelpItem) => void = new Function(
    "setOpen", "openUrl", "onSendFeedback",
    `${callback}\nreturn select;`,
  )(
    (open: boolean) => events.push(`help:${open}`),
    () => events.push("external"),
    () => events.push("feedback"),
  );
  select(feedback);
  assert.deepEqual(events, ["help:false", "feedback"]);
});

const routes = [...app.matchAll(/(?:"sendFeedback"|sendFeedback): (\(\) => [^\n]+),/g)];
for (const [index, label] of ["global shortcut/native command", "palette"].entries()) {
  test(`the actual ${label} callback opens the shared feedback dialog`, () => {
    assert.equal(routes.length, 2);
    const events: string[] = [];
    const callback: () => void = new Function(
      "setFeedbackOpen", "openUrl", "FEEDBACK_URL",
      `return ${routes[index][1]};`,
    )(
      (open: boolean) => events.push(`feedback:${open}`),
      () => events.push("external"),
      FEEDBACK_URL,
    );
    callback();
    assert.deepEqual(events, ["feedback:true"]);
  });
}

test("the app mounts the feedback dialog and passes the same opener through Sidebar", () => {
  assert.match(app, /feedbackOpen && <FeedbackDialog\b/);
  assert.match(app, /onSendFeedback=\{\(\) => setFeedbackOpen\(true\)\}/);
  const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /<HelpMenu\b[^>]*onSendFeedback=\{onSendFeedback\}/);
  assert.match(help, /case "feedback":\s*return onSendFeedback\(\)/);
});
