import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("../../../evidence/settings/agent-tab-keyboard/agentTabsKeyboard.dom.test.mjs", import.meta.url));
const expectedCases = [
  "only the selected reason tab participates in Tab order",
  "only the selected claude tab participates in Tab order",
  "only the selected codex tab participates in Tab order",
  "ArrowRight moves focus and automatically activates claude from reason",
  "ArrowLeft moves focus and automatically activates claude from codex",
  "ArrowRight moves focus and automatically activates reason from codex",
  "ArrowLeft moves focus and automatically activates codex from reason",
  "Home moves focus and automatically activates reason from codex",
  "End moves focus and automatically activates codex from reason",
  "focusing another tab activates its panel and route",
  "clicking another tab still activates its panel and route",
  "shiftKey leaves tab navigation to its existing owner",
  "altKey leaves tab navigation to its existing owner",
  "ctrlKey leaves tab navigation to its existing owner",
  "metaKey leaves tab navigation to its existing owner",
  "ArrowUp is not consumed by the horizontal tab row",
  "ArrowDown is not consumed by the horizontal tab row",
  "Tab is not consumed by the horizontal tab row",
  "Escape still reaches settings.close through the real global dispatcher",
  "Home at the reason boundary preserves focus without consuming the event",
  "End at the codex boundary preserves focus without consuming the event",
  "a route change updates the sole tab stop without stealing focus from elsewhere",
];

test("Agents tabs pass the frozen 22-case assertions with browser URL VM support", { timeout: 120_000 }, (context) => {
  const frozenSource = readFileSync(fixture, "utf8");
  assert.equal(createHash("sha256").update(frozenSource).digest("hex"), "833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51");
  const anchor = "      exports, console, window, document, navigator, HTMLElement, Element, Node, Event, KeyboardEvent,\n";
  assert.equal(frozenSource.split(anchor).length, 2, "K1 browser URL support requires exactly one original VM sandbox anchor");
  const supportedSource = frozenSource.replace(anchor, anchor + "      URL: window.URL, URLSearchParams: window.URLSearchParams,\n");
  assert.equal(createHash("sha256").update(supportedSource).digest("hex"), "ececae31184996182e88a8608bffec216ee055fe83a8c03e38d789a09f18e8fa");
  const domPrefix = process.env.ONBOARDING_DOM_DEPS;
  assert.ok(domPrefix, "K1 requires the existing isolated jsdom@26.1.0 prefix in ONBOARDING_DOM_DEPS; no install, fallback, or skip is permitted");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const directory = mkdtempSync(join(tmpdir(), "openconductor-agent-tabs-"));
  try {
    const executableFixture = join(directory, "agentTabsKeyboard.dom.test.mjs");
    writeFileSync(executableFixture, supportedSource, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", executableFixture], {
      cwd: root,
      env: {
        ...env,
        NODE_ENV: "development",
        NODE_OPTIONS: "--max-old-space-size=768",
        ONBOARDING_DOM_DEPS: domPrefix,
        AGENT_TABS_SOURCE_ROOT: root,
      },
      encoding: "utf8",
      timeout: 115_000,
      killSignal: "SIGKILL",
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stdout + result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const [name, expected] of Object.entries({ tests: 22, pass: 22, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
      const matches = [...result.stdout.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
      assert.equal(matches.length, 1, `Missing or ambiguous TAP summary for ${name}`);
      assert.equal(Number(matches[0][1]), expected);
    }
    assert.match(result.stdout, /^1\.\.22$/m);
    assert.deepEqual([...result.stdout.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1]), expectedCases);
    assert.doesNotMatch(result.stdout, /^not ok /m);
    context.diagnostic("Frozen assertions executed with explicit browser URL VM support; the original fixture is retained unchanged.");
    context.diagnostic(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
