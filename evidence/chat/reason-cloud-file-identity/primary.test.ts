// A default Read names the primary location even when a child diff reports
// the same raw path from another cloud Session. This is not a provider event.
import assert from "node:assert/strict";
import { test } from "node:test";
import { conductorTools } from "../../../src/features/chat/conductorTools.ts";
import type { ReasonPath } from "../../../src/features/chat/reason.ts";

test("default Read preserves its primary location instead of a same-path child diff", () => {
  const primary: ReasonPath = { raw: "/checkout/same.txt", relative: "same.txt", place: "cloud", sessionId: "parent" };
  const child: ReasonPath = { ...primary, sessionId: "child" };
  const rows = conductorTools("Read", { kind: "read", paths: [primary], diffs: [{ path: child, newText: "child content" }] });
  assert.strictEqual(rows[0]!.fileTarget, primary);
});
