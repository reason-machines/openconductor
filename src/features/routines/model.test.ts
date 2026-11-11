import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SORT,
  SUGGESTIONS,
  createBody,
  cronError,
  describeCron,
  draftOf,
  draftProblems,
  formatDistance,
  inScope,
  lastRunLabel,
  nextRunLabel,
  parseSchedule,
  routineFromLoop,
  scheduleCron,
  sortRoutines,
  splitPrompt,
  toggleSort,
  updateBodies,
  webhookCommand,
  type Routine,
  type RoutineDraft,
} from "./model.ts";

/** A `ReasonLoop` as `getReasonLoop` returns it (reason 0.2.673 schema), ids made up. */
const LOOP = {
  id: "loop-1",
  reason_id: "reason-1",
  name: "Weekly report",
  prompt: "Repository: acme/tide-web\n\nRecap the week.",
  enabled: true,
  status: "active",
  paused_reason: null,
  trigger_description: "Every Friday at 17:00",
  wakes_on: [
    { kind: "schedule", description: "0 17 * * 5" },
    { kind: "webhook", description: "webhook" },
    { kind: "github", description: "pr_closed on acme/tide-web" },
    { kind: "slack", description: "messages in #ops" },
  ],
  schedule: { kind: "cron", expression: "0 17 * * 5", every_seconds: null, timezone: "Europe/Oslo", next_run_at: "2026-11-07T16:00:00Z" },
  event_trigger: { kind: "webhook", url: "https://api.example.test/hooks/loop-1" },
  slack: null,
  execution_mode: "new_session",
  session_id: null,
  latest_session_id: "s-9",
  device_id: null,
  repository: null,
  model: "byok:anthropic:claude-opus-5-5",
  notification_policy: "important_updates",
  until: null,
  max_runs: null,
  run_count: 3,
  last_run: { status: "completed", at: "2026-11-06T10:00:00Z", session_id: "s-9" },
  created_by_user_id: "u1",
  viewer_access: { edit: true, stop: true },
};

test("a Loop reads as a routine: repository line, triggers, last run, access", () => {
  const r = routineFromLoop(LOOP);
  assert.equal(r.prompt, "Recap the week.");
  assert.equal(r.repository, "acme/tide-web");
  assert.equal(r.model, "byok:anthropic:claude-opus-5-5");
  assert.equal(r.timezone, "Europe/Oslo");
  assert.deepEqual(
    r.triggers.map((t) => t.type),
    ["cron", "webhook", "github", "other"],
  );
  assert.deepEqual(r.triggers[0], { id: "loop-1-0", type: "cron", cronExpression: "0 17 * * 5" });
  assert.equal(r.triggers[1].type === "webhook" && r.triggers[1].webhookUrl, "https://api.example.test/hooks/loop-1");
  assert.equal(r.triggers[2].type === "github" && r.triggers[2].githubEvent, "pull_request_merged");
  assert.deepEqual(r.lastRun, { status: "completed", at: "2026-11-06T10:00:00Z", sessionId: "s-9" });
  assert.equal(r.runCount, 3);
  assert.equal(r.canEdit, true);
  // `auto` and a missing model both run Auto; a read-only Loop says so.
  const ro = routineFromLoop({ ...LOOP, model: "auto", viewer_access: { edit: false, stop: false }, prompt: "Plain." });
  assert.equal(ro.model, undefined);
  assert.equal(ro.canEdit, false);
  assert.equal(ro.repository, undefined);
});

test("the repository line round-trips through the prompt", () => {
  assert.deepEqual(splitPrompt("Repository: a/b\n\nDo it."), { prompt: "Do it.", repository: "a/b" });
  assert.deepEqual(splitPrompt("Repository: nope\n\nDo it."), { prompt: "Repository: nope\n\nDo it." });
});

const draft = (over: Partial<RoutineDraft> = {}): RoutineDraft => ({
  name: "Weekly report",
  prompt: "Recap the week.",
  repository: "acme/tide-web",
  enabled: true,
  triggers: [{ id: "t1", type: "cron", cronExpression: "0 17 * * 5" }],
  ...over,
});

test("create body: wake_on per trigger, repository in the prompt, time zone", () => {
  const body = createBody(
    draft({
      model: "byok:anthropic:claude-opus-5-5",
      triggers: [
        { id: "t1", type: "cron", cronExpression: " 0 17 * * 5 " },
        { id: "t2", type: "webhook" },
        { id: "t3", type: "github", githubEvent: "pull_request_merged", filters: [{ field: "author", value: "ada" }, { field: "label", value: "ship" }] },
      ],
    }),
    "Europe/Oslo",
  );
  assert.deepEqual(body, {
    name: "Weekly report",
    prompt: "Repository: acme/tide-web\n\nRecap the week.",
    enabled: true,
    timezone: "Europe/Oslo",
    execution_mode: "new_session",
    model: "byok:anthropic:claude-opus-5-5",
    wake_on: [
      { schedule: "0 17 * * 5" },
      { webhook: {} },
      { github: { repo: "acme/tide-web", event: "pr_closed", filters: { label: "ship", author: ["ada"] } } },
    ],
  });
  assert.equal(createBody(draft({ name: "  " }), "UTC").name, "Untitled routine");
});

test("update bodies: changed fields, then enabled on its own; nothing when unchanged", () => {
  const saved = routineFromLoop({ ...LOOP, wakes_on: [LOOP.wakes_on[0]] });
  assert.deepEqual(updateBodies(saved, draftOf(saved)), []);
  assert.deepEqual(updateBodies(saved, { ...draftOf(saved), name: "Friday recap" }), [{ name: "Friday recap" }]);
  assert.deepEqual(updateBodies(saved, { ...draftOf(saved), enabled: false }), [{ enabled: false }]);
  const both = updateBodies(saved, { ...draftOf(saved), enabled: false, model: undefined, triggers: [{ id: "x", type: "cron", cronExpression: "0 9 * * *" }] });
  assert.deepEqual(both, [{ model: null, wake_on: [{ schedule: "0 9 * * *" }] }, { enabled: false }]);
});

test("problems block saving in Conductor's words", () => {
  assert.deepEqual(draftProblems(draft()), []);
  assert.deepEqual(draftProblems(draft({ prompt: " ", triggers: [] })), ["add a prompt", "add a trigger"]);
  assert.deepEqual(
    draftProblems(
      draft({
        repository: undefined,
        triggers: [
          { id: "a", type: "cron", cronExpression: "61 * * * *" },
          { id: "b", type: "cron", cronExpression: "0 9 * * *" },
          { id: "c", type: "github", githubEvent: "pull_request_opened", filters: [{ field: "author", value: "" }] },
        ],
      }),
    ),
    ["enter a valid cron expression", "Reason runs one schedule per routine", "select a repository for the GitHub trigger", "GitHub trigger author filter has no value"],
  );
});

test("schedules: presets parse, print and describe like Conductor's itt and M8a", () => {
  assert.deepEqual(parseSchedule("0 * * * *"), { kind: "hourly" });
  assert.deepEqual(parseSchedule("30 9 * * *"), { kind: "daily", time: "09:30" });
  assert.deepEqual(parseSchedule("0 17 * * 5"), { kind: "weekly", weekday: 5, time: "17:00" });
  assert.deepEqual(parseSchedule("0 9 * * 1-5"), { kind: "weekdays", time: "09:00" });
  assert.deepEqual(parseSchedule("*/5 * * * *"), { kind: "custom" });
  assert.equal(scheduleCron({ kind: "weekly", weekday: 1, time: "08:30" }), "30 8 * * 1");
  assert.equal(describeCron("0 17 * * 5"), "Every Friday at 5:00 PM");
  assert.equal(describeCron("0 9 * * *"), "Every day at 9:00 AM");
  assert.equal(describeCron("0 9 * * 1-5"), "Every weekday at 9:00 AM");
  assert.equal(describeCron("0 * * * *"), "Every hour");
  assert.equal(describeCron("*/5 * * * *"), "*/5 * * * *");
  assert.equal(cronError(""), "Enter a cron expression.");
  assert.equal(cronError("0 25 * * *"), "Enter a valid cron expression.");
  assert.equal(cronError("*/15 9-17 * * 1-5"), undefined);
  // Conductor's suggestions keep their schedules.
  assert.deepEqual(
    SUGGESTIONS.map((s) => describeCron(s.cronExpression)),
    ["Every Friday at 5:00 PM", "Every day at 9:00 AM", "Every day at 9:00 AM"],
  );
});

test("table columns: last run, next run, sort, scope", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const r = routineFromLoop(LOOP);
  assert.equal(lastRunLabel(r, now), "about 2 hours ago");
  assert.equal(lastRunLabel({ ...r, lastRun: undefined }, now), "Never");
  assert.equal(lastRunLabel({ ...r, lastRun: { ...r.lastRun!, at: "2026-11-06T11:59:30Z" } }, now), "Just now");
  assert.equal(nextRunLabel(r, now), "In 1 day");
  assert.equal(nextRunLabel({ ...r, enabled: false }, now), "Disabled");
  const events: Routine = { ...r, nextRunAt: undefined, triggers: [{ id: "w", type: "webhook" }] };
  assert.equal(nextRunLabel(events, now), "Event");
  assert.equal(nextRunLabel({ ...r, triggers: [] }, now), "None");
  assert.equal(formatDistance(now + 30 * 60_000, now), "in 30 minutes");

  const a = { ...r, id: "a", name: "Alpha", runCount: 1, ownerUserId: "u1", lastRun: undefined };
  const b = { ...r, id: "b", name: "beta", runCount: 5, ownerUserId: "u2" };
  const owners = new Map([
    ["u1", "zed@example.com"],
    ["u2", "amy@example.com"],
  ]);
  assert.deepEqual(sortRoutines([a, b], DEFAULT_SORT, owners).map((x) => x.id), ["b", "a"], "never-run rows last");
  assert.deepEqual(sortRoutines([b, a], { key: "name", direction: "asc" }, owners).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(sortRoutines([a, b], { key: "owner", direction: "asc" }, owners).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(toggleSort(DEFAULT_SORT, "name"), { key: "name", direction: "asc" });
  assert.deepEqual(toggleSort({ key: "name", direction: "asc" }, "name"), { key: "name", direction: "desc" });
  assert.deepEqual(inScope([a, b], "mine", "u1").map((x) => x.id), ["a"]);
  assert.equal(inScope([a, b], "team", "u1").length, 2);
});

test("webhook command carries the key once known, else a placeholder", () => {
  assert.equal(
    webhookCommand("https://h/x", "k1"),
    "curl --request POST \\\n  --header 'Authorization: Bearer k1' \\\n  --header 'Content-Type: application/json' \\\n  --data '{}' \\\n  'https://h/x'",
  );
  assert.match(webhookCommand("https://h/x"), /Bearer \$REASON_LOOP_KEY/);
});
