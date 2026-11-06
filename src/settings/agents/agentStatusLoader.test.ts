import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentStatusLoader, type AgentStatusState } from "./agentStatusLoader.ts";
import type { ProviderStatus } from "../types.ts";
import type { CliLoginStatus } from "./api.ts";

type Answer = [ProviderStatus, CliLoginStatus];

/** A loader whose fetches the test answers by hand, in any order, and the state its patches add up to. */
function harness() {
  const pending: { resolve: (a: Answer) => void; reject: (e: unknown) => void }[] = [];
  const state: AgentStatusState = { provider: null, login: null, loading: true, error: undefined };
  const loader = createAgentStatusLoader(
    () => new Promise<Answer>((resolve, reject) => pending.push({ resolve, reject })),
    (patch) => Object.assign(state, patch),
  );
  return { loader, state, pending };
}

const provider = (present: boolean): ProviderStatus =>
  ({ agent: "codex", secrets: [{ key: "OPENAI_API_KEY", present, hint: present ? "mode" : null }] }) as unknown as ProviderStatus;
const login = (authenticated: boolean): CliLoginStatus => ({ installed: true, authenticated });
const settle = () => new Promise((r) => setTimeout(r, 0));

test("a refresh still out when a key is saved does not overwrite the saved key (issue 646)", async () => {
  const { loader, state, pending } = harness();
  loader.refresh();
  loader.setProvider(provider(true));
  pending[0]!.resolve([provider(false), login(true)]);
  await settle();
  assert.equal(state.provider?.secrets[0]?.present, true, "the saved key stays");
  assert.deepEqual(state.login, login(true), "the refresh's CLI login still lands");
  assert.equal(state.loading, false);
});

test("an older refresh answering after a newer one is dropped", async () => {
  const { loader, state, pending } = harness();
  loader.refresh();
  loader.refresh();
  pending[1]!.resolve([provider(true), login(true)]);
  await settle();
  assert.equal(state.loading, false);
  pending[0]!.resolve([provider(false), login(false)]);
  await settle();
  assert.equal(state.provider?.secrets[0]?.present, true);
  assert.deepEqual(state.login, login(true));
  pending.length = 0;
  loader.refresh();
  loader.refresh();
  pending[1]!.resolve([provider(true), login(true)]);
  pending[0]!.reject(new Error("stale"));
  await settle();
  assert.equal(state.error, undefined, "a stale failure is dropped too");
});

test("loading stays on until the newest refresh answers, and its failure shows", async () => {
  const { loader, state, pending } = harness();
  loader.refresh();
  loader.refresh();
  pending[0]!.resolve([provider(false), login(false)]);
  await settle();
  assert.equal(state.loading, true);
  pending[1]!.reject(new Error("boom"));
  await settle();
  assert.equal(state.loading, false);
  assert.equal((state.error as Error).message, "boom");
});

test("a refresh started after a save shows what it reads", async () => {
  const { loader, state, pending } = harness();
  loader.setProvider(provider(true));
  loader.refresh();
  pending[0]!.resolve([provider(false), login(false)]);
  await settle();
  assert.equal(state.provider?.secrets[0]?.present, false, "the key was deleted since; the newer read wins");
});
