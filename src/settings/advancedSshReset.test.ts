import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { act, mount, resetLabel, boundaries } = createRequire(import.meta.url)("./advancedSshResetHarness.cjs");

test("saved custom SSH key exposes reset and clears only the SSH override on activation", () => {
  const view = mount("synthetic-custom-key");
  try {
    assert.equal(view.input().props.value, "synthetic-custom-key");
    assert.equal(view.saved.length, 0, "mount must not save");
    assert.equal(view.reset().length, 1, "a saved custom SSH key must expose Reset to auto-generated key");
    const button = view.reset()[0];
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], resetLabel);
    act(() => button.props.onClick());
    assert.equal(view.saved.length, 1);
    assert.deepEqual(view.saved[0], { ...view.initial, ssh_key_path: null });
    assert.equal(view.input().props.value, "");
    assert.equal(view.reset().length, 0);
    act(() => view.input().props.onBlur());
    assert.equal(view.saved.length, 1, "blur after reset must not resave the stale custom path");
  } finally { view.close(); }
});

test("auto-generated SSH key state has no reset action and saves nothing", () => {
  for (const value of [null, ""]) {
    const view = mount(value);
    try {
      assert.equal(view.input().props.value, "");
      assert.equal(view.reset().length, 0);
      assert.equal(view.saved.length, 0);
      act(() => view.input().props.onChange({ target: { value: "synthetic-unsaved-key" } }));
      assert.equal(view.input().props.value, "synthetic-unsaved-key");
      assert.equal(view.reset().length, 0, "an unsaved draft is not a saved SSH override");
      assert.equal(view.saved.length, 0);
    } finally { view.close(); }
  }
});

test("manual SSH path edits keep blur and Enter save cadence", () => {
  const view = mount("synthetic-original-key");
  try {
    act(() => view.input().props.onChange({ target: { value: "  synthetic-edited-key  " } }));
    assert.equal(view.saved.length, 0);
    act(() => view.input().props.onBlur());
    assert.deepEqual(view.saved, [{ ...view.initial, ssh_key_path: "synthetic-edited-key" }]);
    act(() => view.input().props.onChange({ target: { value: "synthetic-enter-key" } }));
    assert.equal(view.saved.length, 1);
    act(() => view.input().props.onKeyDown({ key: "Enter", currentTarget: { blur: () => view.input().props.onBlur() } }));
    assert.deepEqual(view.saved[1], { ...view.initial, ssh_key_path: "synthetic-enter-key" });
    assert.equal(view.saved.length, 2);
  } finally { view.close(); }
});

test("component checks never invoked a backend or native boundary", () => {
  assert.deepEqual(boundaries, []);
});
