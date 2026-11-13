import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUP_LOGOS, SOUND_OPTIONS } from "./sound.ts";

/**
 * Verifies GROUP_LOGOS against the REA-extracted Conductor reference catalog.
 * Reference: evidence/settings/completion-sound/reference/catalog.txt
 * Conductor Xwt = {"SF Muni":{label:"Muni",path:"/muni.svg"},
 *                   "NYC MTA":{label:"MTA",path:"/mta.svg"},
 *                   "Paris Métro":{label:"Métro de Paris",path:"/metro-de-paris.svg"},
 *                   SNCF:{label:"SNCF",path:"/sncf.svg"}}
 */

describe("GROUP_LOGOS", () => {
  it("contains exactly the four groups that have Conductor logos", () => {
    const keys = Object.keys(GROUP_LOGOS).sort();
    assert.deepEqual(keys, ["NYC MTA", "Paris Métro", "SF Muni", "SNCF"]);
  });

  it("matches the Conductor reference label and path for SF Muni", () => {
    assert.deepEqual(GROUP_LOGOS["SF Muni"], { label: "Muni", path: "/muni.svg" });
  });

  it("matches the Conductor reference label and path for NYC MTA", () => {
    assert.deepEqual(GROUP_LOGOS["NYC MTA"], { label: "MTA", path: "/mta.svg" });
  });

  it("matches the Conductor reference label and path for Paris Métro", () => {
    assert.deepEqual(GROUP_LOGOS["Paris Métro"], { label: "Métro de Paris", path: "/metro-de-paris.svg" });
  });

  it("matches the Conductor reference label and path for SNCF", () => {
    assert.deepEqual(GROUP_LOGOS["SNCF"], { label: "SNCF", path: "/sncf.svg" });
  });

  it("every logo path refers to a group that appears in SOUND_OPTIONS", () => {
    const soundGroups: Set<string> = new Set(SOUND_OPTIONS.map((o) => o.group).filter(Boolean));
    for (const group of Object.keys(GROUP_LOGOS)) {
      assert.ok(soundGroups.has(group), `${group} is in GROUP_LOGOS but not in SOUND_OPTIONS`);
    }
  });

  it("groups without logos are not in GROUP_LOGOS", () => {
    assert.equal(GROUP_LOGOS["Classic"], undefined);
    assert.equal(GROUP_LOGOS["Novelty"], undefined);
    assert.equal(GROUP_LOGOS[""], undefined);
  });
});
