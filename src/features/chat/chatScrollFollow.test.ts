/**
 * Tests for chat scroll-follow logic.
 * parity:chat.scroll-follow  BE7-17
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIsAtBottom, SCROLL_BOTTOM_THRESHOLD } from "./hooks/useScrollFollow.ts";

// Helpers
const el = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({ scrollTop, scrollHeight, clientHeight });

test("at exact bottom → true", () => {
  // scrollHeight - scrollTop - clientHeight = 0
  assert.equal(computeIsAtBottom(el(900, 1000, 100)), true);
});

test("within threshold (< 50px from bottom) → true", () => {
  // 1000 - 851 - 100 = 49 < 50
  assert.equal(computeIsAtBottom(el(851, 1000, 100)), true);
});

test("exactly at threshold boundary → true", () => {
  // 1000 - 850 - 100 = 50 === SCROLL_BOTTOM_THRESHOLD
  assert.equal(SCROLL_BOTTOM_THRESHOLD, 50);
  assert.equal(computeIsAtBottom(el(850, 1000, 100)), true);
});

test("one pixel beyond threshold → false", () => {
  // 1000 - 849 - 100 = 51 > 50
  assert.equal(computeIsAtBottom(el(849, 1000, 100)), false);
});

test("scrolled to top of a long chat → false", () => {
  assert.equal(computeIsAtBottom(el(0, 2000, 400)), false);
});

test("content fits in container (no overflow) → true", () => {
  // scrollHeight === clientHeight: distance = 0
  assert.equal(computeIsAtBottom(el(0, 400, 400)), true);
});

test("content barely overflows by exactly threshold → true", () => {
  // scrollHeight 450, scrollTop 0, clientHeight 400: distance = 50
  assert.equal(computeIsAtBottom(el(0, 450, 400)), true);
});

test("content overflows by threshold + 1 and user is at top → false", () => {
  // scrollHeight 451, scrollTop 0, clientHeight 400: distance = 51
  assert.equal(computeIsAtBottom(el(0, 451, 400)), false);
});

test("user scrolled to exactly middle of a long chat → false", () => {
  assert.equal(computeIsAtBottom(el(500, 2000, 100)), false);
});
