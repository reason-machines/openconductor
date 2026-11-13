import type { ITheme } from "@xterm/xterm";

export const palette = [
  ["black", "--terminal-black", "#201e1c"],
  ["red", "--terminal-red", "#da2424"],
  ["green", "--terminal-green", "#119745"],
  ["yellow", "--terminal-yellow", "#f3d127"],
  ["blue", "--terminal-blue", "#1b5fe0"],
  ["magenta", "--terminal-magenta", "#be09dd"],
  ["cyan", "--terminal-cyan", "#0b879f"],
  ["white", "--terminal-white", "#dedcda"],
  ["brightBlack", "--terminal-bright-black", "#746b66"],
  ["brightRed", "--terminal-bright-red", "#ee3b3b"],
  ["brightGreen", "--terminal-bright-green", "#1bbe56"],
  ["brightYellow", "--terminal-bright-yellow", "#f9e05a"],
  ["brightBlue", "--terminal-bright-blue", "#5487ed"],
  ["brightMagenta", "--terminal-bright-magenta", "#d94df2"],
  ["brightCyan", "--terminal-bright-cyan", "#31bcd7"],
  ["brightWhite", "--terminal-bright-white", "#f6f4f2"],
] as const satisfies ReadonlyArray<readonly [keyof ITheme, string, string]>;

export const fixtureColors = {
  "background": "#121314",
  "foreground": "#efefef",
  "accent": "#3582dc",
  "selectionBackground": "#3582dc66",
  "selectionInactiveBackground": "#3582dc4d",
  "replacement": "#aabbcc"
} as const;
