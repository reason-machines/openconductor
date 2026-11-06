import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPhase, presenceAttrs, type Phase, type PresenceEvent } from "./presence.ts";

const run = (start: Phase, events: PresenceEvent[]) => events.reduce(nextPhase, start);

test("opening renders one frame with the starting style, then the open style", () => {
  assert.equal(run("closed", ["show"]), "starting");
  assert.deepEqual(presenceAttrs("starting"), { "data-starting-style": "" });
  assert.equal(run("closed", ["show", "frame"]), "open");
  assert.deepEqual(presenceAttrs("open"), {});
});

test("closing keeps the element mounted with the ending style until the exit has run", () => {
  assert.equal(run("open", ["hide"]), "ending");
  assert.deepEqual(presenceAttrs("ending"), { "data-ending-style": "" });
  assert.equal(run("open", ["hide", "frame"]), "ending");
  assert.equal(run("open", ["hide", "exited"]), "closed");
});

test("reopening during the exit returns to open without remounting", () => {
  assert.equal(run("open", ["hide", "show"]), "open");
  assert.equal(run("open", ["hide", "show", "exited"]), "open");
});

test("closing before the first frame still exits", () => {
  assert.equal(run("closed", ["show", "hide", "frame", "exited"]), "closed");
});

test("events that do not apply leave the phase alone", () => {
  assert.equal(run("closed", ["hide", "frame", "exited"]), "closed");
  assert.equal(run("open", ["show", "frame", "exited"]), "open");
});
