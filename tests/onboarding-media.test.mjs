import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const deps = createRequire(resolve(process.env.REACT_EFFECTS_DEPS ?? "node_modules", "package.json"));
const React = deps("react");
const { act, create } = deps("react-test-renderer");
const ts = deps("typescript");
assert.equal(React.version, "18.3.1");
assert.equal(deps("react-test-renderer/package.json").version, "18.3.1");
const sourceRoot = process.env.ONBOARDING_MEDIA_SOURCE_ROOT ?? ".";

async function fixture() {
  const modules = new Map(), intervals = new Map(), continued = [];
  let bindings, root, serial = 0;
  const boundaries = {
    "../keybindings/KeybindingsProvider": { useKeybindings(next) { bindings = next; } },
    "../components/AppMark": { AppMark: () => null },
    "./SignIn": { SignUp: ({ onSkip, busy }) => React.createElement("button", { onClick: onSkip, disabled: busy }, "Continue") },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const javascript = ts.transpileModule(readFileSync(resolve(sourceRoot, path), "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name) => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name.endsWith(".css")) return {};
      if (Object.hasOwn(boundaries, name)) return boundaries[name];
      if (name === "./firstRun") return load("src/onboarding/firstRun.ts");
      throw new Error(`Unexpected source dependency ${name}`);
    };
    runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      window: {
        setInterval(callback) { const id = ++serial; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
      }, console,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { FirstRunOnboarding } = load("src/onboarding/FirstRunOnboarding.tsx");
  const element = (busy = false) => React.createElement(FirstRunOnboarding, {
    onContinue: (agent) => continued.push(agent), busy, onFailed: () => assert.fail("Sign-in is isolated"),
  });
  await act(async () => { root = create(element()); });
  const slides = () => root.root.findAllByProps({ role: "listitem" });
  const video = () => root.root.findByType("video");
  return {
    root, video, continued, intervals,
    selected: () => slides().findIndex((node) => node.props["aria-current"] === "true"),
    progress: () => ({
      value: root.root.findByProps({ role: "progressbar" }).props["aria-valuenow"],
      width: root.root.findByProps({ className: "onb-progress-fill" }).props.style.width,
    }),
    async click(index) { await act(async () => { slides()[index].props.onClick(); }); },
    async load() { await act(async () => { video().props.onLoadedData(); }); },
    async time(currentTime, duration) { await act(async () => { video().props.onTimeUpdate({ currentTarget: { currentTime, duration } }); }); },
    async end() { await act(async () => { video().props.onEnded(); }); },
    async next() { await act(async () => { bindings["onboarding.nextSlide"](); }); },
    async tick() { await act(async () => { for (const callback of intervals.values()) callback(); }); },
    async choose(agent) { await act(async () => { root.root.findByProps({ type: "radio", value: agent }).props.onChange(); }); },
    async continue() { await act(async () => { bindings["onboarding.continue"](); }); },
    async render(busy = false) { await act(async () => { root.update(element(busy)); }); },
    async close() { await act(async () => { root.unmount(); }); assert.equal(intervals.size, 0); },
  };
}

for (const [index, name] of ["repo", "agents", "conduct"].entries()) {
  test(`reselecting ${name} preserves the playing element and media progress`, async () => {
    const f = await fixture();
    try {
      await f.click(index);
      await f.load();
      const video = f.video();
      await f.time(3, 12);
      assert.deepEqual(f.progress(), { value: 25, width: "25%" });
      await f.click(index);
      await f.render();
      assert.equal(f.video(), video, "same slide must not remount or rewind media");
      assert.deepEqual(f.progress(), { value: 25, width: "25%" });
      await f.time(6, 12);
      assert.deepEqual(f.progress(), { value: 50, width: "50%" });
      assert.equal(f.selected(), index);
    } finally { await f.close(); }
  });
}

test("each slide has a bundled silent autoplay inline clip and changes load a new element", async () => {
  const f = await fixture();
  try {
    const paths = ["/onboarding/workspaces.mp4", "/onboarding/agents.mp4", "/onboarding/review.mp4"];
    for (const [index, path] of paths.entries()) {
      const previous = f.video();
      await f.click(index);
      const video = f.video();
      if (index > 0) assert.notEqual(video, previous);
      assert.equal(video.props.src, path);
      assert.equal(video.props.autoPlay, true);
      assert.equal(video.props.muted, true);
      assert.equal(video.props.playsInline, true);
      assert.equal(video.props.preload, "auto");
      assert.equal(video.props.loop, undefined, "ended must advance rather than loop one clip");
      const bytes = readFileSync(`public${path}`);
      assert.equal(bytes.toString("ascii", 4, 8), "ftyp", "packaged media is an MP4, not a placeholder path");
      await f.load();
      assert.deepEqual(f.progress(), { value: 0, width: "0%" });
      await f.time(2, 4);
      assert.deepEqual(f.progress(), { value: 50, width: "50%" });
    }
  } finally { await f.close(); }
});

test("choosing another slide replaces media and waits for loadeddata to reset progress", async () => {
  const f = await fixture();
  try {
    await f.time(9, 12);
    assert.deepEqual(f.progress(), { value: 75, width: "75%" });
    const previous = f.video();
    await f.click(1);
    assert.equal(f.selected(), 1);
    assert.notEqual(f.video(), previous);
    assert.deepEqual(f.progress(), { value: 75, width: "75%" }, "selection alone is not a media load event");
    await f.load();
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.time(2, 10);
    assert.deepEqual(f.progress(), { value: 20, width: "20%" });
    await f.end();
    assert.equal(f.selected(), 2);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
  } finally { await f.close(); }
});

test("waiting, stalled playback and wall-clock ticks never advance a slide", async () => {
  const f = await fixture();
  try {
    assert.equal(f.intervals.size, 0, "no wall-clock substitute for media playback");
    await f.tick();
    assert.equal(f.selected(), 0);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.time(4, 10);
    await f.tick();
    await f.render();
    assert.equal(f.selected(), 0);
    assert.deepEqual(f.progress(), { value: 40, width: "40%" });
    await f.time(10, 10);
    assert.equal(f.selected(), 0, "100 percent alone is not an ended event");
    await f.end();
    assert.equal(f.selected(), 1);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
  } finally { await f.close(); }
});

test("unloaded media does not block manual navigation or continuing setup", async () => {
  const f = await fixture();
  try {
    await f.next();
    assert.equal(f.selected(), 1);
    await f.click(2);
    assert.equal(f.selected(), 2);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.continue();
    assert.deepEqual(f.continued, ["reason"]);
  } finally { await f.close(); }
});

test("media duration owns progress, load resets it and malformed metadata cannot poison the bar", async () => {
  const f = await fixture();
  try {
    await f.time(3, 20);
    assert.deepEqual(f.progress(), { value: 15, width: "15%" });
    for (const [time, duration] of [[0, 0], [3, NaN], [3, Infinity], [NaN, 20], [Infinity, 20], [1, -1]]) {
      await f.time(time, duration);
      assert.deepEqual(f.progress(), { value: 15, width: "15%" });
    }
    await f.time(21, 20);
    assert.deepEqual(f.progress(), { value: 100, width: "100%" });
    await f.time(-1, 20);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.time(3, 12);
    await f.load();
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
  } finally { await f.close(); }
});

test("ended and next-slide keys wrap, preserving default agent and busy continuation guard", async () => {
  const f = await fixture();
  try {
    await f.choose("codex");
    for (const selected of [1, 2, 0]) {
      await f.time(3, 12);
      await f.end();
      assert.equal(f.selected(), selected);
      assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    }
    for (const selected of [1, 2, 0]) {
      await f.time(3, 12);
      await f.next();
      assert.equal(f.selected(), selected);
      assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    }
    assert.equal(f.root.root.findByProps({ type: "radio", value: "codex" }).props.checked, true);
    await f.render(true);
    await f.continue();
    assert.deepEqual(f.continued, []);
    await f.render(false);
    await f.continue();
    assert.deepEqual(f.continued, ["codex"]);
  } finally { await f.close(); }
});
