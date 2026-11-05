import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMENT_SCROLL_OFFSET, commentWindow, type MeasuredComment } from "./nav.ts";

const at = (top: number, target = `c${top}`, height = 20): MeasuredComment<string> => ({ target, top, height });

test("commentWindow is empty without comments", () => {
  assert.deepEqual(commentWindow([], 0, 500), { previousCount: 0, nextCount: 0 });
});

test("comments on screen count in neither direction", () => {
  // Viewport 1000..1500, reading line at 1056.
  const w = commentWindow([at(100), at(1100), at(1300), at(2000), at(3000)], 1000, 500);
  assert.deepEqual(w, { previous: "c100", next: "c2000", previousCount: 1, nextCount: 2 });
});

test("a comment above the reading line is previous even while still partly on screen", () => {
  // Spans 1000..1040, entirely above the reading line at 1056.
  const w = commentWindow([at(1000, "a", 40), at(1200, "b")], 1000, 500);
  assert.deepEqual(w, { previous: "a", next: undefined, previousCount: 1, nextCount: 0 });
  // Reaching past the reading line makes it visible instead.
  const v = commentWindow([at(1000, "a", 80), at(1200, "b")], 1000, 500);
  assert.deepEqual(v, { previous: undefined, next: undefined, previousCount: 0, nextCount: 0 });
});

test("with nothing on screen, comments at or above the reading line are previous", () => {
  const w = commentWindow([at(3000, "late"), at(100, "early"), at(1000 + COMMENT_SCROLL_OFFSET, "edge", 0)], 1000, 500);
  assert.deepEqual(w, { previous: "edge", next: "late", previousCount: 2, nextCount: 1 });
});

test("all comments below the viewport are next", () => {
  assert.deepEqual(commentWindow([at(900), at(700)], 0, 500), { previous: undefined, next: "c700", previousCount: 0, nextCount: 2 });
});

test("measureComments places anchors by side in the item and dedupes them", async () => {
  const { measureComments } = await import("./nav.ts");
  const calls: Array<[number, string | undefined]> = [];
  const view = {
    getTopForItem: (id: string) => (id === "f" ? 1000 : undefined),
    getRenderedItems: () => [
      {
        id: "f",
        type: "diff" as const,
        instance: {
          getLinePosition: (line: number, side?: "deletions" | "additions") => {
            calls.push([line, side]);
            return line === 99 ? undefined : { top: line * 20, height: 20 };
          },
        },
      },
    ],
    getContainerElement: () => ({ scrollTop: 1000, clientHeight: 300 }),
  };
  const anchors = [
    { side: "new" as const, line: 1 }, // 1020..1040: above the reading line (1056)
    { side: "new" as const, line: 1 },
    { side: "old" as const, line: 5 }, // 1100: on screen
    { side: "new" as const, line: 40 }, // 1800: below
    { side: "new" as const, line: 99 }, // not laid out: ignored
  ];
  const w = measureComments(view, "f", anchors);
  assert.deepEqual(w, { previous: anchors[0], next: anchors[3], previousCount: 1, nextCount: 1 });
  assert.deepEqual(calls, [[1, "additions"], [5, "deletions"], [40, "additions"], [99, "additions"]]);
  assert.deepEqual(measureComments(view, "other", anchors), { previousCount: 0, nextCount: 0 });
});
