import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_DONE_STEP, firstRunView, nextSlideId, parseFirstRunStep, showsFirstRun, SLIDES } from "./firstRun.ts";

test("an unset step reads as 1 and junk as NaN, like parseInt(v ?? \"1\")", () => {
  assert.equal(parseFirstRunStep(null), 1);
  assert.equal(parseFirstRunStep(undefined), 1);
  assert.equal(parseFirstRunStep("999"), FIRST_RUN_DONE_STEP);
  assert.equal(parseFirstRunStep("0"), 0);
  assert.ok(Number.isNaN(parseFirstRunStep("")));
});

test("onboarding shows only with no repositories and a step of at most 1", () => {
  assert.equal(showsFirstRun(1, 0), true);
  assert.equal(showsFirstRun(0, 0), true);
  assert.equal(showsFirstRun(1, undefined), true, "repositories not known counts as none (Pya: !t)");
  assert.equal(showsFirstRun(2, 0), false);
  assert.equal(showsFirstRun(FIRST_RUN_DONE_STEP, 0), false);
  assert.equal(showsFirstRun(1, 3), false, "any repository skips it, even unfinished");
  assert.equal(showsFirstRun(NaN, 0), false);
});

test("the view: loader first, gate before the preview route", () => {
  const base = { loaded: true, step: 1, repoCount: 0, path: "/" };
  assert.equal(firstRunView({ ...base, loaded: false }), "loading");
  assert.equal(firstRunView(base), "onboarding");
  assert.equal(firstRunView({ ...base, path: "/first-run-onboarding" }), "onboarding", "the guard wins over the route");
  assert.equal(firstRunView({ ...base, step: 999 }), "app");
  assert.equal(firstRunView({ ...base, step: 999, path: "/first-run-onboarding" }), "onboarding-route");
  assert.equal(firstRunView({ ...base, repoCount: 2, path: "/first-run-onboarding" }), "onboarding-route");
});

test("slides keep the reference copy and order, and next wraps", () => {
  assert.deepEqual(SLIDES.map((s) => s.title), [
    "Get coding agents working in parallel",
    "See at a glance what each agent is working on",
    "Review changes and create PRs",
  ]);
  assert.equal(SLIDES[0].description, "Each agent you spin up gets an isolated workspace.");
  assert.equal(SLIDES[1].description, "See who's working, what needs attention, and what's planned.");
  assert.equal(nextSlideId("repo"), "agents");
  assert.equal(nextSlideId("agents"), "conduct");
  assert.equal(nextSlideId("conduct"), "repo");
});
