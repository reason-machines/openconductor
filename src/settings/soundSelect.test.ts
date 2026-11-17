/**
 * Static checks for SoundSelect's data model: group structure and
 * logo rendering logic match Conductor's E8t/iga/sga chain.
 *
 * REA reference: renderApp-D_fmY7hW.js offsets 10659440–10660240 (iga),
 * 10706171–10706767 (rga/sga), E8t (index).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUP_LOGOS, SOUND_OPTIONS } from "./sound.ts";

/** Replicates SoundSelect's buildGroups() / Conductor's E8t(). */
type SoundEntry = { value: string; label: string; group: string };
function buildGroups() {
  const groups: Array<{ label: string; sounds: SoundEntry[] }> = [];
  for (const opt of SOUND_OPTIONS) {
    const last = groups[groups.length - 1];
    if (last && last.label === opt.group) {
      last.sounds.push(opt);
    } else {
      groups.push({ label: opt.group, sounds: [opt] });
    }
  }
  return groups;
}

describe("SoundSelect group structure (E8t parity)", () => {
  const groups = buildGroups();

  it("produces 7 groups (1 ungrouped + Classic + Novelty + 4 transit)", () => {
    // disabled lands in the empty group; Classic, Novelty, SF Muni, NYC MTA,
    // Paris Métro, SNCF = 7 groups total (1 ungrouped + 6 named).
    assert.equal(groups.length, 7);
  });

  it("first group is ungrouped (disabled/No sound)", () => {
    assert.equal(groups[0].label, "");
    assert.equal(groups[0].sounds[0].value, "disabled");
  });

  it("every group with a logo entry in GROUP_LOGOS has logo metadata", () => {
    for (const group of groups) {
      if (!group.label) continue;
      const logo = GROUP_LOGOS[group.label];
      if (logo) {
        assert.ok(logo.path.startsWith("/"), `${group.label} logo path must be public-asset relative`);
        assert.ok(logo.label.length > 0, `${group.label} logo label must be non-empty`);
      }
    }
  });

  it("Classic and Novelty have no logo (renders as plain text, REA iga no-logo branch)", () => {
    for (const group of groups) {
      if (group.label === "Classic" || group.label === "Novelty") {
        assert.equal(GROUP_LOGOS[group.label], undefined,
          `${group.label} must render as plain text — no logo in Conductor's Xwt`);
      }
    }
  });

  it("all 4 transit groups have logos (iga logo branch)", () => {
    const transit = ["SF Muni", "NYC MTA", "Paris Métro", "SNCF"];
    for (const name of transit) {
      assert.ok(GROUP_LOGOS[name], `${name} must have a logo entry`);
    }
  });

  it("every option in SOUND_OPTIONS appears in exactly one group", () => {
    const seen = new Set<string>();
    for (const group of groups) {
      for (const opt of group.sounds) {
        assert.ok(!seen.has(opt.value), `${opt.value} appears in multiple groups`);
        seen.add(opt.value);
      }
    }
    assert.equal(seen.size, SOUND_OPTIONS.length);
  });

  it("logo paths match the SVG assets committed in public/", () => {
    // These paths must match the filenames in public/: muni.svg, mta.svg,
    // metro-de-paris.svg, sncf.svg.
    const expectedPaths = ["/muni.svg", "/mta.svg", "/metro-de-paris.svg", "/sncf.svg"];
    const actualPaths = Object.values(GROUP_LOGOS).map((l) => l.path).sort();
    assert.deepEqual(actualPaths.sort(), expectedPaths.sort());
  });
});
