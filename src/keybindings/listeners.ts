// Window listeners that feed the dispatcher, matching Conductor's adapter
// (renderApp chunk, evidence/keybindings/README.md "Window listeners").
import type { DispatchEvent, Dispatcher, FocusContext, Telemetry } from "./dispatcher.ts";

/** The parts of a DOM element the focus probe reads. */
export interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  dataset?: Record<string, string | undefined>;
  closest?(selector: string): unknown;
  blur?(): void;
}

/** The parts of a keyboard event the listeners read and act on. */
export interface ListenerEvent extends DispatchEvent {
  target: unknown;
  defaultPrevented: boolean;
  composedPath(): readonly unknown[];
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

/** A recorder takes every key while installed (see `captureKeys`). */
export interface KeyCapture {
  onKeyDown(e: ListenerEvent): void;
  onKeyUp(e: ListenerEvent): void;
}

const asElement = (x: unknown): ElementLike | undefined =>
  typeof x === "object" && x !== null && "tagName" in x ? (x as ElementLike) : undefined;

/**
 * Where focus is for this event: the text field in its path (the first INPUT or
 * TEXTAREA, else the outermost contenteditable), whether the target is inside
 * `[data-terminal]`, and whether a recorder button is in the path.
 */
export function probeFocus(e: Pick<ListenerEvent, "target" | "composedPath">): {
  field: ElementLike | undefined;
  inTerminal: boolean;
  recording: boolean;
} {
  const path = e.composedPath().map(asElement).filter((x): x is ElementLike => x !== undefined);
  let field = path.find((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  if (field === undefined) for (const el of path) if (el.isContentEditable === true) field = el;
  const target = asElement(e.target);
  return {
    field,
    inTerminal: Boolean(target?.closest?.("[data-terminal]")),
    recording: path.some((el) => el.dataset?.keybindingRecorderActive === "true"),
  };
}

const isBareEscape = (e: ListenerEvent): boolean =>
  e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;

/** How long text input stays blocked after an Option chord ran a command. */
export const OPTION_INPUT_SUPPRESS_MS = 50;

export interface ListenerOptions {
  dispatcher: Dispatcher;
  /** The open dialog's id, or null. */
  activeDialogId: () => string | null;
  track?: (t: Telemetry) => void;
  now?: () => number;
}

export function createKeyListeners({ dispatcher, activeDialogId, track, now = Date.now }: ListenerOptions) {
  let capture: KeyCapture | undefined;
  let suppressInputUntil = -Infinity;

  /** An Option chord (no Command or Control) would also type a character like †. */
  const noteOptionChord = (e: ListenerEvent): void => {
    if (e.altKey && !e.metaKey && !e.ctrlKey) suppressInputUntil = now() + OPTION_INPUT_SUPPRESS_MS;
  };

  const routeToCapture = (e: ListenerEvent, phase: "down" | "up"): boolean => {
    if (capture === undefined) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (phase === "down") capture.onKeyDown(e);
    else capture.onKeyUp(e);
    return true;
  };

  const dispatch = (e: ListenerEvent): void => {
    const { field, inTerminal, recording } = probeFocus(e);
    const ctx: FocusContext = { activeDialogId: activeDialogId(), typing: field !== undefined, inTerminal, recording };
    const outcome = dispatcher.dispatch(e, ctx);
    if (outcome.kind === "blur") field?.blur?.();
    if (outcome.preventDefault) e.preventDefault();
    if (outcome.kind === "swallow" || outcome.kind === "ran") {
      e.stopImmediatePropagation();
      noteOptionChord(e);
    }
    if (outcome.kind === "ran") track?.(outcome.telemetry);
  };

  return {
    /**
     * Install an exclusive key capture; returns its remover. Removing a capture
     * that was already replaced leaves the newer one in place.
     */
    captureKeys(c: KeyCapture): () => void {
      capture = c;
      return () => {
        if (capture === c) capture = undefined;
      };
    },
    capturing: (): boolean => capture !== undefined,

    /** window keydown, capture phase. A bare Escape waits for the bubble phase. */
    keydownCapture(e: ListenerEvent): void {
      if (routeToCapture(e, "down") || isBareEscape(e)) return;
      dispatch(e);
    },
    /** window keydown, bubble phase: a bare Escape nothing else handled. */
    keydownBubble(e: ListenerEvent): void {
      if (isBareEscape(e) && !e.defaultPrevented) dispatch(e);
    },
    /** window keyup, capture phase. */
    keyupCapture(e: ListenerEvent): void {
      routeToCapture(e, "up");
    },
    /** window beforeinput and compositionstart, capture phase. */
    inputCapture(e: Pick<ListenerEvent, "preventDefault">): void {
      if (capture !== undefined || now() < suppressInputUntil) e.preventDefault();
    },
  };
}

export type KeyListeners = ReturnType<typeof createKeyListeners>;

export interface ListenerTarget {
  addEventListener(type: string, listener: (e: Event) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (e: Event) => void, capture?: boolean): void;
}

/** Attach the listeners to `window` the way Conductor does; returns the remover. */
export function installKeyListeners(target: ListenerTarget, l: KeyListeners): () => void {
  const key = (fn: (e: ListenerEvent) => void) => (e: Event) => fn(e as KeyboardEvent);
  const wiring: [string, (e: Event) => void, boolean][] = [
    ["keydown", key(l.keydownCapture), true],
    ["keydown", key(l.keydownBubble), false],
    ["keyup", key(l.keyupCapture), true],
    ["compositionstart", l.inputCapture, true],
    ["beforeinput", l.inputCapture, true],
  ];
  for (const [type, fn, cap] of wiring) target.addEventListener(type, fn, cap);
  return () => {
    for (const [type, fn, cap] of wiring) target.removeEventListener(type, fn, cap);
  };
}
