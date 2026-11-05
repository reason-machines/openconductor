import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentScrollbackRows,
  onScrollbackRows,
  scrollbackBytesFromMegabytes,
  scrollbackLimitBytes,
  scrollbackLimitMegabytes,
  scrollbackRows,
  setScrollbackRows,
} from "./scrollback.ts";

test("a stored limit defaults to 10 MB and stays within 1 MB to 1 GB", () => {
  for (const missing of [undefined, null, "", "  ", "abc", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(scrollbackLimitBytes(missing), 10_000_000, String(missing));
  }
  assert.equal(scrollbackLimitBytes(25_000_000), 25_000_000);
  assert.equal(scrollbackLimitBytes(" 25000000 "), 25_000_000);
  assert.equal(scrollbackLimitBytes(1_500_000.4), 1_500_000);
  assert.equal(scrollbackLimitBytes(10), 1_000_000);
  assert.equal(scrollbackLimitBytes(-5), 1_000_000);
  assert.equal(scrollbackLimitBytes(5e9), 1_000_000_000);
});

test("the field shows whole MB, at least 1", () => {
  assert.equal(scrollbackLimitMegabytes(undefined), 10);
  assert.equal(scrollbackLimitMegabytes(25_000_000), 25);
  assert.equal(scrollbackLimitMegabytes(1_400_000), 1);
  assert.equal(scrollbackLimitMegabytes(2_600_000), 3);
  assert.equal(scrollbackLimitMegabytes(5e9), 1000);
});

test("typed MB become bytes the way Conductor parses its field", () => {
  assert.equal(scrollbackBytesFromMegabytes("25"), 25_000_000);
  assert.equal(scrollbackBytesFromMegabytes(" 2.6 "), 3_000_000);
  assert.equal(scrollbackBytesFromMegabytes("0"), 1_000_000);
  assert.equal(scrollbackBytesFromMegabytes("-4"), 1_000_000);
  assert.equal(scrollbackBytesFromMegabytes("5000"), 1_000_000_000);
  assert.equal(scrollbackBytesFromMegabytes(""), 10_000_000);
  assert.equal(scrollbackBytesFromMegabytes("lots"), 10_000_000);
});

test("xterm keeps one row per 160 bytes", () => {
  assert.equal(scrollbackRows(undefined), 62_500);
  assert.equal(scrollbackRows(1_000_000), 6_250);
  assert.equal(scrollbackRows(25_000_000), 156_250);
  assert.equal(scrollbackRows(1_000_159), 6_250);
});

test("live terminals hear only real changes", () => {
  const heard: number[] = [];
  const off = onScrollbackRows((r) => heard.push(r));
  const start = currentScrollbackRows();
  setScrollbackRows(start);
  setScrollbackRows(6_250);
  setScrollbackRows(6_250);
  setScrollbackRows(start);
  off();
  setScrollbackRows(6_250);
  assert.deepEqual(heard, [6_250, start]);
  assert.equal(currentScrollbackRows(), 6_250);
  setScrollbackRows(start);
});
