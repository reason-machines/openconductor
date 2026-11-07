import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { attachTab } from "./session";
import { FindBar, useTerminalFind } from "./FindBar";

/** One PTY screen, mounted in either the right panel or a center workspace tab. */
export function TerminalHost({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const find = useTerminalFind(id);
  useEffect(() => (ref.current ? attachTab(id, ref.current) : undefined), [id]);
  // data-terminal tells the shortcut dispatcher that focus is in a terminal;
  // the find bar sits outside it so typing there is ordinary text input.
  return (
    <div className="term-body">
      <FindBar find={find} />
      <div className="term-mount" data-terminal ref={ref} />
    </div>
  );
}
