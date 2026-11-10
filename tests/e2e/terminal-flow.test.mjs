import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flows } from "./flows.mjs";

for (const outputFrom of ["worktree", "repo"]) {
  test(`terminal flow ${outputFrom === "worktree" ? "accepts selected worktree" : "rejects repository checkout"} output`, async () => {
    const root = mkdtempSync(join(tmpdir(), "oc-terminal-flow-"));
    try {
      const ctx = { repo: join(root, "repo"), worktree: join(root, "worktree") };
      mkdirSync(ctx.repo);
      mkdirSync(ctx.worktree);
      const wd = {
        async findAll(selector) { return selector === ".terminal-panel" ? [] : ["element"]; },
        async click() {},
        async keys(text) { assert.equal(text, "echo oc-term-$((6*7)); pwd\uE007"); },
        async execute() { return `echo oc-term-$((6*7)); pwd\noc-term-42\n${realpathSync(ctx[outputFrom])}\n`; },
        async waitFor(description, check) {
          const value = await check();
          if (!value) throw new Error(`timed out waiting for ${description}`);
          return value;
        },
      };
      const terminal = flows.find((flow) => flow.name === "terminal");
      assert.ok(terminal);
      if (outputFrom === "worktree") await terminal.run(wd, ctx);
      else await assert.rejects(terminal.run(wd, ctx), /timed out waiting for the shell's output/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
