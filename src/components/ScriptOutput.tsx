import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { currentTerminalFont, onTerminalFont, TERMINAL_LINE_HEIGHT } from "../features/terminal/font";
import { currentScrollbackRows, onScrollbackRows } from "../features/terminal/scrollback";
import { outputUpdate } from "../scripts/output";
import "../theme/scriptTerminal.css";
import "./scriptOutput.css";

export function ScriptOutput({ output }: { output: string }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const written = useRef("");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const font = currentTerminalFont();
    const term = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      convertEol: true,
      fontFamily: font.family,
      fontSize: font.size,
      lineHeight: TERMINAL_LINE_HEIGHT,
      scrollback: currentScrollbackRows(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    terminal.current = term;
    written.current = "";
    const refreshTheme = () => {
      const css = getComputedStyle(element);
      const color = (name: string) => css.getPropertyValue(name).trim();
      term.options.theme = {
        background: color("--bg"), foreground: color("--text"), cursor: color("--terminal-transparent"),
        selectionBackground: color("--accent"), selectionForeground: color("--accent-text"),
        black: color("--terminal-black"), red: color("--terminal-red"), green: color("--terminal-green"),
        yellow: color("--terminal-yellow"), blue: color("--terminal-blue"), magenta: color("--terminal-magenta"),
        cyan: color("--terminal-cyan"), white: color("--terminal-white"), brightBlack: color("--terminal-bright-black"),
        brightRed: color("--terminal-bright-red"), brightGreen: color("--terminal-bright-green"), brightYellow: color("--terminal-bright-yellow"),
        brightBlue: color("--terminal-bright-blue"), brightMagenta: color("--terminal-bright-magenta"),
        brightCyan: color("--terminal-bright-cyan"), brightWhite: color("--terminal-bright-white"),
      };
    };
    const resize = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
    };
    refreshTheme();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const theme = new MutationObserver(refreshTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-palette", "data-low-contrast"] });
    const offFont = onTerminalFont((next) => {
      term.options.fontFamily = next.family;
      term.options.fontSize = next.size;
      resize();
    });
    const offScrollback = onScrollbackRows((rows) => { term.options.scrollback = rows; });
    return () => {
      observer.disconnect();
      theme.disconnect();
      offFont();
      offScrollback();
      terminal.current = null;
      term.dispose();
    };
  }, []);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    const update = outputUpdate(written.current, output);
    written.current = output;
    if (update.reset) term.reset();
    if (update.data) term.write(update.data);
  }, [output]);

  return <div className="script-output" role="region" aria-label="Script output" ref={host} />;
}
