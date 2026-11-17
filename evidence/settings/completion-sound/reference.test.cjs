const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const reference = (name) => fs.readFileSync(path.join(__dirname, "reference", name + ".txt"), "utf8");
const ids = ["disabled", "default", "choo-choo", "odysseus-pluck", "fahhhh", "quack", "sf-muni-inbound-train-chime", "sf-muni-new", "nyc-metro-door-chime", "nyc-subway-door-chime", "nyc-subway", "paris-metro-chime", "paris-metro-pickpockets", "sncf-jingle"];

function fixture(data = undefined) {
  const writes = [];
  const fetches = [];
  const errors = [];
  let contexts = 0;
  let rejectWrite = false;
  class AudioContext {
    state = "running";
    destination = {};
    constructor() { contexts++; }
    async decodeAudioData(data) { return data; }
    createBufferSource() { return { connect() {}, start() {} }; }
    createGain() { return { gain: {}, connect() {} }; }
    async close() {}
  }
  const context = vm.createContext({
    z: { c: (length) => Array(length).fill(Symbol.for("react.memo_cache_sentinel")) },
    Le: (key) => { assert.equal(key, "sound_type"); return { data }; },
    ee: { updateSetting: async (key, value) => { writes.push([key, value]); if (rejectWrite) throw new Error("Fixture storage rejection"); } },
    window: { AudioContext },
    fetch: async (url) => { fetches.push(url); return { arrayBuffer: async () => new ArrayBuffer(0) }; },
    Y: { error: (...args) => errors.push(args) },
  });
  const code = "const " + reference("catalog") + ";\n" + ["p9", "Eue", "E8t", "u5t", "Gzt", "eSt", "Zwt"].map(reference).join("\n") + "\n({ kue, E8t, u5t, Gzt, Zwt })";
  return { api: vm.runInContext(code, context), writes, fetches, errors, contexts: () => contexts, reject: () => { rejectWrite = true; } };
}

test("retained catalog exposes the 14 canonical IDs", () => {
  assert.deepEqual(Array.from(fixture().api.kue, (sound) => sound.id), ids);
});

test("retained catalog groups preserve their order and labels", () => {
  const groups = fixture().api.E8t();
  assert.deepEqual(Array.from(groups, (group) => group.label || ""), ["", "Classic", "Novelty", "SF Muni", "NYC MTA", "Paris Métro", "SNCF"]);
  assert.deepEqual(Array.from(groups, (group) => Array.from(group.sounds, (sound) => sound.id)).flat(), ids);
});

test("retained reader defaults only an absent or empty value", () => {
  assert.equal(fixture().api.u5t().data, "default");
  assert.equal(fixture("").api.u5t().data, "default");
  assert.equal(fixture("disabled").api.u5t().data, "disabled");
  assert.equal(fixture("choo-choo").api.u5t().data, "choo-choo");
  assert.equal(fixture("future-sound").api.u5t().data, "future-sound");
});

test("retained writer persists each exact catalog ID", async () => {
  const view = fixture();
  for (const id of ids) await view.api.Gzt(id);
  assert.deepEqual(view.writes, ids.map((id) => ["sound_type", id]));
});

test("retained writer propagates a storage rejection", async () => {
  const view = fixture();
  view.reject();
  await assert.rejects(view.api.Gzt("quack"), /Fixture storage rejection/);
});

test("retained playback is silent only for disabled", async () => {
  const view = fixture();
  await view.api.Zwt("disabled");
  assert.equal(view.contexts(), 0);
  assert.deepEqual(view.fetches, []);
});

test("retained playback resolves known recordings and defaults unknown IDs", async () => {
  const view = fixture();
  for (const id of ids.slice(1)) await view.api.Zwt(id);
  await view.api.Zwt("future-sound");
  await view.api.Zwt();
  assert.deepEqual(view.fetches, [...Array.from(view.api.kue, (sound) => sound.path).filter(Boolean), "/chime.mp3", "/chime.mp3"]);
  assert.deepEqual(view.errors, []);
});
