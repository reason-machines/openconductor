import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BATTERY, session, startHost } from "./support/caffeinateHost.mjs";

let host;
before(async () => { host = await startHost(); });
after(async () => { await host?.close(); });

const starts = snapshot => snapshot.calls.filter(call => call.command === "execute_shell_command_cancellable");
const cancels = snapshot => snapshot.calls.filter(call => call.command === "cancel_shell_command");
const batteryReads = snapshot => snapshot.calls.filter(call => call.command === "execute_shell_command" && call.args.request?.command === "pmset -g batt");

async function withFixture(options, check) {
  const fixture = await host.fixture(options);
  try { await check(fixture); } finally { await fixture.close(); }
}

async function started(fixture, message = "eligible stored session must start one inhibitor") {
  const state = await fixture.snapshot();
  assert.equal(starts(state).length, 1, message);
  assert.equal(starts(state)[0].args.request.command, "exec caffeinate -i");
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].exited, false, "shell invocation must stay pending until its simulated exit");
  return state.runs[0].id;
}

async function stopped(fixture, id) {
  await fixture.page.waitForFunction(id => window.__caffeinateHost.snapshot().calls.some(call => call.command === "cancel_shell_command" && call.args.id === id && call.result === true), id);
  const state = await fixture.snapshot();
  assert.ok(cancels(state).every(call => call.args.id === id), "stop must target the actual pending shell invocation");
  assert.equal(state.runs.find(run => run.id === id)?.exited, false, "successful cancellation is not an execution-completion reply");
  await fixture.exit(id);
}

test("whole-main disabled preference never starts an inhibitor for a stored working session", async () => {
  await withFixture({ rows: [session("busy", "working")] }, async fixture => {
    assert.equal((await fixture.snapshot()).settings.general.caffeinate_while_agents_running, false);
    assert.equal(starts(await fixture.snapshot()).length, 0);
  });
});

test("whole-main General switch commits preference and starts working-session inhibitor", async () => {
  await withFixture({}, async fixture => {
    await fixture.status("busy", "working");
    assert.equal((await fixture.snapshot()).sessions.find(row => row.chatId === "busy")?.status, "working", "eligible stored session row must precede the missing-effect assertion");
    assert.equal(new Map(await fixture.statuses()).get("busy"), "working", "genuine native callback must reach canonical chatRuntime");
    await fixture.setEnabled(true);
    const state = await fixture.snapshot();
    assert.equal(state.settings.general.caffeinate_while_agents_running, true);
    const updates = state.calls.filter(call => call.command === "update_settings");
    assert.equal(updates.length, 1, "actual switch must commit exactly one settings update");
    assert.equal(updates[0].args.settings.general.caffeinate_while_agents_running, true);
    await started(fixture, "CAFFEINATE_MISSING_EFFECT_WORKING: expected inhibitor 1 after committed preference and genuine stored working status");
  });
});

if (process.env.CAFFEINATE_REPLAY_MODE !== "baseline") {
  test("whole-main waiting session independently starts an inhibitor", async () => {
    await withFixture({ rows: [session("waiting", "waiting")] }, async fixture => {
      await fixture.setEnabled(true);
      await started(fixture);
    });
  });

  test("whole-main unrelated needs statuses do not outrank a working session", async () => {
    await withFixture({ rows: [session("busy", "working"), ...["needs_user_input", "needs_user_permission", "needs_plan_response"].map(status => session(status, status))] }, async fixture => {
      await fixture.setEnabled(true);
      await started(fixture);
    });
  });

  test("whole-main needs statuses alone do not hold an inhibitor", async () => {
    await withFixture({ rows: ["needs_user_input", "needs_user_permission", "needs_plan_response"].map(status => session(status, status)) }, async fixture => {
      await fixture.setEnabled(true);
      assert.equal(starts(await fixture.snapshot()).length, 0);
    });
  });

  for (const percent of [9, 10]) {
    test(`whole-main battery ${percent} percent blocks an otherwise working session`, async () => {
      await withFixture({ rows: [session("busy", "working")], battery: BATTERY.ten.replace("10%", `${percent}%`) }, async fixture => {
        await fixture.setEnabled(true);
        assert.ok(batteryReads(await fixture.snapshot()).length > 0, "raw battery result must reach the actual consumer");
        assert.equal(starts(await fixture.snapshot()).length, 0);
      });
    });
  }

  for (const [name, battery] of [["battery 11 percent", BATTERY.eleven], ["AC at 10 percent", BATTERY.acTen], ["unknown battery output", BATTERY.unknown]]) {
    test(`whole-main ${name} allows an otherwise working session`, async () => {
      await withFixture({ rows: [session("busy", "working")], battery }, async fixture => {
        await fixture.setEnabled(true);
        await started(fixture);
      });
    });
  }

  test("whole-main battery polling honors 59999/60000 and stops then restarts across threshold", async () => {
    await withFixture({ rows: [session("busy", "working")] }, async fixture => {
      await fixture.setEnabled(true);
      const id = await started(fixture);
      const before = batteryReads(await fixture.snapshot()).length;
      assert.ok(before > 0, "initial raw battery read must complete");
      await fixture.battery(BATTERY.ten);
      await fixture.advance(59999);
      assert.equal(batteryReads(await fixture.snapshot()).length, before, "no battery poll before 60000 ms");
      assert.equal(cancels(await fixture.snapshot()).length, 0);
      await fixture.advance(1);
      assert.equal(batteryReads(await fixture.snapshot()).length, before + 1, "exactly one battery poll at 60000 ms");
      await stopped(fixture, id);
      await fixture.battery(BATTERY.eleven);
      await fixture.advance(60000);
      assert.equal(batteryReads(await fixture.snapshot()).length, before + 2);
      const state = await fixture.snapshot();
      assert.equal(starts(state).length, 2, "battery recovery must reacquire without another user action");
      assert.notEqual(starts(state)[1].args.id, id);
    });
  });

  test("whole-main disabling preference stops the pending inhibitor", async () => {
    await withFixture({ rows: [session("busy", "working")] }, async fixture => {
      await fixture.setEnabled(true);
      const id = await started(fixture);
      await fixture.setEnabled(false);
      assert.equal((await fixture.snapshot()).settings.general.caffeinate_while_agents_running, false);
      await stopped(fixture, id);
    });
  });

  test("whole-main becoming idle stops the pending inhibitor", async () => {
    await withFixture({ rows: [session("busy", "working")] }, async fixture => {
      await fixture.setEnabled(true);
      const id = await started(fixture);
      await fixture.status("busy", "idle");
      await stopped(fixture, id);
    });
  });

  test("whole-main stop intent survives false cancellation before late native registration", async () => {
    await withFixture({ rows: [session("busy", "working")], delayedRegistration: true }, async fixture => {
      await fixture.setEnabled(true);
      const id = await started(fixture);
      await fixture.setEnabled(false);
      await fixture.page.waitForFunction(id => window.__caffeinateHost.snapshot().calls.some(call => call.command === "cancel_shell_command" && call.args.id === id && call.result === false), id);
      assert.equal((await fixture.snapshot()).runs[0].exited, false, "false cancellation cannot settle the pending invocation");
      await fixture.register(id);
      await stopped(fixture, id);
      assert.equal(starts(await fixture.snapshot()).length, 1, "late registration must not launch a replacement");
    });
  });

  test("whole-main stop intent finishes when pending invocation exits before registration", async () => {
    await withFixture({ rows: [session("busy", "working")], delayedRegistration: true }, async fixture => {
      await fixture.setEnabled(true);
      const id = await started(fixture);
      await fixture.setEnabled(false);
      await fixture.page.waitForFunction(id => window.__caffeinateHost.snapshot().calls.some(call => call.command === "cancel_shell_command" && call.args.id === id && call.result === false), id);
      await fixture.exit(id);
      const before = cancels(await fixture.snapshot()).length;
      await fixture.page.waitForTimeout(300);
      assert.equal(cancels(await fixture.snapshot()).length, before, "settled invocation must end retrying stop intent");
    });
  });

  for (const status of ["working", "waiting"]) {
    test(`whole-main initially hidden ${status} session remains globally eligible`, async () => {
      await withFixture({ rows: [session("hidden", status, { isHidden: true })] }, async fixture => {
        await fixture.setEnabled(true);
        await started(fixture);
        assert.ok((await fixture.snapshot()).calls.some(call => call.command === "session_statuses" && call.args.includeHidden === true), "full raw hydration must opt into hidden session rows");
      });
    });
  }

  test("whole-main null-workspace stored session remains globally eligible", async () => {
    await withFixture({ rows: [session("orphan", "working", { workspaceId: null })] }, async fixture => {
      await fixture.setEnabled(true);
      await started(fixture);
      assert.deepEqual((await fixture.snapshot()).sessions.map(row => row.workspaceId), [null]);
    });
  });

  test("whole-main repeated native status callbacks do not duplicate the inhibitor", async () => {
    await withFixture({}, async fixture => {
      await fixture.setEnabled(true);
      await fixture.status("busy", "working");
      await fixture.status("busy", "working");
      await fixture.status("busy", "waiting");
      await started(fixture);
    });
  });
}
