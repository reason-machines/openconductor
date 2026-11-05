import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeDialogIdFromDom, bindCommands, type CommandHandlers } from "./bind.ts";
import { createDispatcher, type Dispatcher, type Telemetry } from "./dispatcher.ts";
import { createKeyListeners, installKeyListeners } from "./listeners.ts";
import type { Overrides } from "./overrides.ts";

interface KeybindingsContext {
  dispatcher: Dispatcher;
  overrides: Overrides;
}

const Context = createContext<KeybindingsContext | null>(null);

interface Props {
  overrides?: Overrides;
  /** Receives `keyboard_shortcut_used` for every command a key press runs. */
  track?: (t: Telemetry) => void;
  children: ReactNode;
}

/** One dispatcher for the app, fed by window key listeners installed once. */
export function KeybindingsProvider({ overrides = {}, track, children }: Props) {
  const trackRef = useRef(track);
  trackRef.current = track;
  const [dispatcher] = useState(createDispatcher);
  const [listeners] = useState(() =>
    createKeyListeners({
      dispatcher,
      activeDialogId: () => activeDialogIdFromDom(document),
      track: (t) => trackRef.current?.(t),
    }),
  );
  useEffect(() => installKeyListeners(window, listeners), [listeners]);
  const value = useMemo(() => ({ dispatcher, overrides }), [dispatcher, overrides]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useKeybindingsContext(): KeybindingsContext {
  const ctx = useContext(Context);
  if (ctx === null) throw new Error("useKeybindings needs a <KeybindingsProvider> above it");
  return ctx;
}

/**
 * Run each callback when its registry command's shortcut is pressed. The set of
 * command ids decides what is registered; callbacks may change every render.
 */
export function useKeybindings(handlers: CommandHandlers): void {
  const { dispatcher, overrides } = useKeybindingsContext();
  const latest = useRef(handlers);
  latest.current = handlers;
  const ids = Object.keys(handlers)
    .filter((id) => handlers[id] !== undefined)
    .sort()
    .join("\n");
  useEffect(() => {
    const proxies: CommandHandlers = {};
    for (const id of ids ? ids.split("\n") : []) proxies[id] = () => latest.current[id]?.();
    return bindCommands(dispatcher, proxies, { overrides });
  }, [dispatcher, overrides, ids]);
}
