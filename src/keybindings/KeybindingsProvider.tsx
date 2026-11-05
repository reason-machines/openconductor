import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeDialogIdFromDom, bindCommands, type CommandHandlers } from "./bind.ts";
import { createDispatcher, type Dispatcher, type Telemetry } from "./dispatcher.ts";
import { createKeyListeners, installKeyListeners, type KeyCapture } from "./listeners.ts";
import { parseOverrides, type Overrides } from "./overrides.ts";

interface KeybindingsContext {
  dispatcher: Dispatcher;
  overrides: Overrides;
  /** False until the stored overrides have been read (or failed to read). */
  overridesLoaded: boolean;
  /** Apply overrides just written to storage. */
  setOverrides: (o: Overrides) => void;
  /** Exclusive key capture for a shortcut recorder; returns its remover. */
  captureKeys: (c: KeyCapture) => () => void;
}

const Context = createContext<KeybindingsContext | null>(null);

interface Props {
  /** Reads the stored overrides once at startup (`keybinding_overrides_v1`). */
  loadOverrides?: () => Promise<string | undefined>;
  /** Receives `keyboard_shortcut_used` for every command a key press runs. */
  track?: (t: Telemetry) => void;
  children: ReactNode;
}

/** One dispatcher for the app, fed by window key listeners installed once. */
export function KeybindingsProvider({ loadOverrides, track, children }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [overridesLoaded, setOverridesLoaded] = useState(loadOverrides === undefined);
  const loadRef = useRef(loadOverrides);
  useEffect(() => {
    const load = loadRef.current;
    if (load === undefined) return;
    let live = true;
    load()
      .then((raw) => live && setOverrides(parseOverrides(raw)))
      .catch(() => undefined)
      .finally(() => live && setOverridesLoaded(true));
    return () => {
      live = false;
    };
  }, []);
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
  const value = useMemo(
    () => ({ dispatcher, overrides, overridesLoaded, setOverrides, captureKeys: listeners.captureKeys }),
    [dispatcher, overrides, overridesLoaded, listeners],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function useKeybindingsContext(): KeybindingsContext {
  const ctx = useContext(Context);
  if (ctx === null) throw new Error("useKeybindings needs a <KeybindingsProvider> above it");
  return ctx;
}

/** The live overrides, whether they have loaded, and how to replace them. */
export function useKeybindingOverrides() {
  const { overrides, overridesLoaded, setOverrides } = useKeybindingsContext();
  return { overrides, overridesLoaded, setOverrides };
}

/** Install an exclusive key capture (a shortcut recorder); returns its remover. */
export const useKeyCapture = (): ((c: KeyCapture) => () => void) => useKeybindingsContext().captureKeys;

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
