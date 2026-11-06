import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDUCTOR_ICONS } from "./conductorIcons.generated.ts";
import { LUCIDE } from "../features/chat/toolIconData.ts";

test("every shared icon has drawable geometry", () => {
  const names = Object.keys(CONDUCTOR_ICONS);
  assert.ok(names.length >= 37);
  for (const name of names) {
    const nodes = CONDUCTOR_ICONS[name as keyof typeof CONDUCTOR_ICONS];
    assert.ok(nodes.length > 0, `${name} has no shapes`);
  }
});

test("shared icons match the Conductor chat geometry they share a name with", () => {
  const shared = Object.keys(LUCIDE).filter((name) => name in CONDUCTOR_ICONS);
  assert.ok(shared.length >= 8, `expected overlap with chat icons, got ${shared.join(",")}`);
  for (const name of shared) {
    const conductor = LUCIDE[name as keyof typeof LUCIDE].map(([tag, attrs]) => [tag, attrs]);
    const ours = CONDUCTOR_ICONS[name as keyof typeof CONDUCTOR_ICONS];
    assert.deepEqual(ours, conductor, `${name} differs from Conductor`);
  }
});
