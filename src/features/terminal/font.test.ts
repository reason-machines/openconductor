import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentTerminalFont,
  onTerminalFont,
  setTerminalFont,
  TERMINAL_FALLBACK_FONTS,
  terminalFontFamily,
  terminalFontFrom,
  terminalFontSize,
  type TerminalFont,
} from "./font.ts";

test("a chosen family goes in front of Conductor's stack; empty keeps the stack", () => {
  assert.equal(TERMINAL_FALLBACK_FONTS, "Menlo, Monaco, 'Courier New', 'Symbols Nerd Font Mono', monospace");
  assert.equal(terminalFontFamily("FiraCode Nerd Font"), `FiraCode Nerd Font, ${TERMINAL_FALLBACK_FONTS}`);
  assert.equal(terminalFontFamily("  JetBrains Mono  "), `JetBrains Mono, ${TERMINAL_FALLBACK_FONTS}`);
  for (const empty of [null, undefined, "", "   "]) assert.equal(terminalFontFamily(empty), TERMINAL_FALLBACK_FONTS);
});

test("size defaults to 12 and stays in the slider's 10-20 px", () => {
  assert.equal(terminalFontSize(undefined), 12);
  assert.equal(terminalFontSize(null), 12);
  assert.equal(terminalFontSize(Number.NaN), 12);
  assert.equal(terminalFontSize(15), 15);
  assert.equal(terminalFontSize(14.6), 15);
  assert.equal(terminalFontSize(4), 10);
  assert.equal(terminalFontSize(40), 20);
  assert.deepEqual(terminalFontFrom({ terminal_font_size: 16 }), { family: TERMINAL_FALLBACK_FONTS, size: 16 });
});

test("listeners hear each real change once, and nothing after unsubscribing", () => {
  const heard: TerminalFont[] = [];
  const off = onTerminalFont((f) => heard.push(f));
  const start = currentTerminalFont();
  setTerminalFont(start);
  assert.equal(heard.length, 0);
  const bigger = { family: start.family, size: 18 };
  setTerminalFont(bigger);
  setTerminalFont({ ...bigger });
  assert.deepEqual(heard, [bigger]);
  assert.deepEqual(currentTerminalFont(), bigger);
  off();
  setTerminalFont(start);
  assert.equal(heard.length, 1);
});
