import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT_NAME,
  STEP,
  TEMPLATES,
  canCreate,
  createButtonLabel,
  createFailedMessage,
  existsMessage,
  nameHint,
  nextFailureMessage,
  pipelineSteps,
  targetPath,
  templateScripts,
  validateCreate,
} from "./createProject.ts";

test("name hint shows the slug, an error for a name without letters or numbers, or nothing", () => {
  assert.deepEqual(nameHint(DEFAULT_PROJECT_NAME), { kind: "creates", slug: "openconductor-playground" });
  assert.deepEqual(nameHint("  My Cool App! "), { kind: "creates", slug: "my-cool-app" });
  assert.deepEqual(nameHint("!!!"), { kind: "invalid" });
  assert.equal(nameHint("   "), null);
});

test("templates are Empty then Next.js; gstack waits for a decision", () => {
  assert.deepEqual(
    TEMPLATES.map((t) => [t.id, t.label, t.description]),
    [
      ["empty", "Empty", "Blank Git repo"],
      ["nextjs", "Next.js", "TypeScript, Tailwind, App Router"],
    ],
  );
});

test("validation checks the name, then the parent folder", () => {
  assert.equal(validateCreate("", ""), "Enter a project name");
  assert.equal(validateCreate("app", " "), "Select a directory");
  assert.equal(validateCreate("app", "/tmp"), null);
  assert.equal(canCreate("app", "/tmp", false), true);
  assert.equal(canCreate("app", "/tmp", true), false);
  assert.equal(canCreate("", "/tmp", false), false);
  assert.equal(createButtonLabel(false), "Create");
  assert.equal(createButtonLabel(true), "Creating...");
});

test("pipeline steps per template", () => {
  assert.deepEqual(pipelineSteps("empty"), [STEP.createDirectory, STEP.gitInit, STEP.githubRepo, STEP.addProject, STEP.createWorkspace]);
  assert.deepEqual(pipelineSteps("nextjs").slice(0, 2), ["Creating Next.js project...", "Setting up environment..."]);
});

test("only Next.js sets scripts", () => {
  assert.equal(templateScripts("empty"), null);
  assert.deepEqual(templateScripts("nextjs"), {
    setup: "ln -sf $CONDUCTOR_ROOT_PATH/.env.local .env.local && pnpm install",
    run: "pnpm run dev",
    runMode: "concurrent",
  });
});

test("paths and messages", () => {
  assert.equal(targetPath("/Users/me/repos/", "app"), "/Users/me/repos/app");
  assert.equal(existsMessage("app", "/r"), 'Directory "app" already exists in /r');
  assert.equal(nextFailureMessage(["a\n", "  ", "ERR! boom \n", "\n"]), "ERR! boom");
  assert.equal(nextFailureMessage([]), "Failed to create Next.js project");
  assert.equal(createFailedMessage(new Error("x")), "Couldn't create project: x");
  assert.equal(createFailedMessage("y"), "Couldn't create project: y");
});
