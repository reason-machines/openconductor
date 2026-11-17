import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openUrl } from "../backend";
import "@xterm/xterm/css/xterm.css";
import { currentTerminalFont, onTerminalFont, TERMINAL_LINE_HEIGHT } from "../features/terminal/font";
import { currentScrollbackRows, onScrollbackRows } from "../features/terminal/scrollback";
import { outputUpdate } from "../scripts/output";
import { FindBar, useBufferFind } from "../features/terminal/FindBar";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { PRIORITY } from "../keybindings/dispatcher";
import "../theme/scriptTerminal.css";
import "./scriptOutput.css";

export function ScriptOutput({ output, onInput, onResize, showCursor = false, sessionId, onAddToChat }: { output: string; onInput?: (data: string) => Promise<void>; onResize?: (cols: number, rows: number) => Promise<void>; showCursor?: boolean; sessionId?: string; onAddToChat?: (text: string) => boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const written = useRef("");
  const [selectedText, setSelectedText] = useState("");
  const resizeCallback = useRef(onResize);
  resizeCallback.current = onResize;
  const fitTerminal = useRef<(() => void) | null>(null);
  const getTerminal = useCallback(() => terminal.current, []);
  const find = useBufferFind(getTerminal);
  useKeybindings({
    "terminal.search": () => {
      if (!container.current?.contains(document.activeElement)) return false;
      find.open();
    },
  }, PRIORITY.TERMINAL);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const font = currentTerminalFont();
    const term = new Terminal({
      allowProposedApi: true,
      disableStdin: true,
      cursorBlink: showCursor,
      convertEol: true,
      linkHandler: {
        allowNonHttpProtocols: false,
        activate: (event, url) => {
          if (!event.metaKey) return;
          let protocol: string;
          try { protocol = new URL(url).protocol; } catch { return; }
          if (protocol !== "http:" && protocol !== "https:") return;
          void confirm(`Open this terminal link?\n\n${url}`, {
            cancelLabel: "Cancel", kind: "warning", okLabel: "Open", title: "Open link?",
          }).then((allowed) => {
            if (allowed) return openUrl(url);
          }).catch((error: unknown) => { console.error("Failed to open terminal link", error); });
        },
      },
      fontFamily: font.family,
      fontSize: font.size,
      lineHeight: TERMINAL_LINE_HEIGHT,
      scrollback: currentScrollbackRows(),
    });
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const copy = (event: ClipboardEvent) => {
      const selection = term.getSelection();
      if (!selection) return;
      event.preventDefault();
      event.clipboardData?.setData("text/plain", selection.split("\n").map((line) => line.replace(/[ \t]+$/u, "")).join("\n"));
    };
    const terminalElement = term.element;
    terminalElement?.addEventListener("copy", copy);
    terminal.current = term;
    written.current = "";
    const refreshTheme = () => {
      const css = getComputedStyle(element);
      const color = (name: string) => css.getPropertyValue(name).trim();
      term.options.theme = {
        background: color("--bg"), foreground: color("--text"), cursor: color(showCursor ? "--text" : "--terminal-transparent"), cursorAccent: color("--bg"),
        selectionBackground: color("--accent"), selectionForeground: color("--accent-text"),
        black: color("--terminal-black"), red: color("--terminal-red"), green: color("--terminal-green"),
        yellow: color("--terminal-yellow"), blue: color("--terminal-blue"), magenta: color("--terminal-magenta"),
        cyan: color("--terminal-cyan"), white: color("--terminal-white"), brightBlack: color("--terminal-bright-black"),
        brightRed: color("--terminal-bright-red"), brightGreen: color("--terminal-bright-green"), brightYellow: color("--terminal-bright-yellow"),
        brightBlue: color("--terminal-bright-blue"), brightMagenta: color("--terminal-bright-magenta"),
        brightCyan: color("--terminal-bright-cyan"), brightWhite: color("--terminal-bright-white"),
      };
    };
    let reported: { callback: NonNullable<typeof onResize>; cols: number; rows: number } | undefined;
    const resize = () => {
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      fit.fit();
      const callback = resizeCallback.current;
      if (!callback) { reported = undefined; return; }
      if (!Number.isInteger(term.cols) || term.cols <= 0 || term.cols > 65535 || !Number.isInteger(term.rows) || term.rows <= 0 || term.rows > 65535) return;
      if (reported?.callback === callback && reported.cols === term.cols && reported.rows === term.rows) return;
      reported = { callback, cols: term.cols, rows: term.rows };
      void callback(term.cols, term.rows);
    };
    fitTerminal.current = resize;
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
      fitTerminal.current = null;
      terminalElement?.removeEventListener("copy", copy);
      term.dispose();
    };
  }, []);

  useEffect(() => { fitTerminal.current?.(); }, [onResize]);

  useEffect(() => {
    const term = terminal.current;
    if (!term || !onAddToChat) return;
    const selection = term.onSelectionChange(() => setSelectedText(term.getSelection()));
    return () => selection.dispose();
  }, [onAddToChat]);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.disableStdin = !onInput;
    if (!onInput) return;
    let active = true;
    let pending = Promise.resolve();
    const input = term.onData((data) => {
      pending = pending.then(async () => {
        if (active) await onInput(data);
      });
    });
    return () => { active = false; input.dispose(); };
  }, [onInput]);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    const update = outputUpdate(written.current, output);
    written.current = output;
    if (update.reset || update.data) term.write(`${update.reset ? "\x1bc" : ""}${update.data}`);
  }, [output]);

  const selection = selectedText
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").trim();

  return (
    <div className="script-output" role="region" aria-label="Script output" data-terminal ref={container} onClick={() => terminal.current?.focus()}>
      <FindBar find={find} />
      {selection && sessionId && onAddToChat && (
        <div style={{ position: "absolute", inset: "0 0 auto", zIndex: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--panel)", fontSize: 12 }}>
          <span title={selection} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selection.replace(/\s+/g, " ")}</span>
          <button type="button" className="btn btn-small" onClick={(event) => {
            event.stopPropagation();
            if (onAddToChat(selection)) setSelectedText("");
          }}>Add to chat</button>
        </div>
      )}
      <div className="script-output-mount" ref={host} />
    </div>
  );
}
