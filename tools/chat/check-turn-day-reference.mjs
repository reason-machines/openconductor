// Node type stripping; pass the retained Conductor 0.87.6 renderer path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formatTurnEnd, turnDayClock } from "../../src/features/chat/turnTime.ts";

const path = process.argv[2];
assert.ok(path, "Pass the retained renderApp-D_fmY7hW.js path");
const bytes = readFileSync(path);
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256, "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde");
const source = bytes.toString("utf8");
const functions = ["IKn", "SDo", "EDo", "CDo"].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist in the pinned renderer`);
  const end = source.indexOf("function ", start + 9);
  assert.ok(end > start);
  return source.slice(start, end);
});
assert.ok(source.includes("B9(c,Math.max(a-i,1e3))"));
assert.ok(source.includes("const i=setInterval(()=>{n.current()},e);return()=>{clearInterval(i)}"));
const timezone = process.env.TZ;
process.env.TZ = "America/New_York";
try {
  const cases = [
    { name: "today to weekday", current: new Date(2026, 10, 5, 23, 59, 59).getTime(), ended: new Date(2026, 10, 5, 10, 37).getTime(), hours: 1 / 3600 },
    { name: "weekday to date", current: new Date(2026, 10, 11, 23, 59, 59).getTime(), ended: new Date(2026, 10, 5, 10, 37).getTime(), hours: 1 / 3600 },
    { name: "spring DST", current: new Date(2026, 2, 8).getTime(), ended: new Date(2026, 2, 8, 0, 0).getTime(), hours: 23 },
    { name: "fall DST", current: new Date(2026, 10, 1).getTime(), ended: new Date(2026, 10, 1, 0, 0).getTime(), hours: 25 },
  ];
  for (const c of cases) {
    const setup = `
      let now = ${c.current};
      const NativeDate = Date;
      Date = class extends NativeDate { static now() { return now; } };
      const ne = { c: size => Array(size).fill(Symbol.for("react.memo_cache_sentinel")) };
      let state;
      const $ = { useState: initial => { state ??= initial(); return [state, next => { state = next; }]; } };
      const p = { Fragment: null, jsx: (_type, props) => props.children };
      let callback, delay;
      function B9(fn, ms) { callback = fn; delay = ms; }
      const wDo = 86400000;
      ${functions.join("\n")}
    `;
    const context = vm.createContext({});
    vm.runInContext(setup, context, { timeout: 1000 });
    const before = vm.runInContext(`EDo({ timestamp: ${c.ended} })`, context, { timeout: 1000 });
    assert.equal(vm.runInContext("delay", context), c.hours * 60 * 60 * 1000, c.name);
    const clock = turnDayClock(() => c.current);
    assert.equal(formatTurnEnd(c.ended, clock.getSnapshot()), before, c.name);
    vm.runInContext("now += delay; callback()", context, { timeout: 1000 });
    const after = vm.runInContext(`EDo({ timestamp: ${c.ended} })`, context, { timeout: 1000 });
    const nextClock = turnDayClock(() => c.current + c.hours * 60 * 60 * 1000);
    assert.equal(formatTurnEnd(c.ended, nextClock.getSnapshot()), after, c.name);
    assert.notEqual(after, before, c.name);
  }
  console.log(JSON.stringify({ result: "PASS", cases: cases.length, sha256, endFormatterByteOffset: Buffer.byteLength(source.slice(0, source.indexOf("function SDo("))), dayRefreshByteOffset: Buffer.byteLength(source.slice(0, source.indexOf("function EDo("))), limitation: "Bounded extracted reference functions with a minimal hook shim and pure day snapshots. No app, mounted React tree or provider executed." }, null, 2));
} finally {
  if (timezone === undefined) delete process.env.TZ;
  else process.env.TZ = timezone;
}
