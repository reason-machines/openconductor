// Key-bindings page (/settings/user/key-bindings): search with "Type shortcut",
// rows grouped by category, a recorder per configurable command, Reset for
// customized ones. Behaviour follows evidence/keybindings/README.md
// ("Key-bindings page"); the logic lives in src/keybindings/editor.ts.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keys } from "../components/KeyboardShortcutsDialog";
import { LockIcon, SearchIcon } from "../components/Icons";
import { Toaster, useToasts } from "../components/Toast";
import { conflictMessage } from "../keybindings/conflicts.ts";
import {
  EDITOR_SEARCH_PLACEHOLDER,
  FIXED_SHORTCUT,
  SAVE_FAILED,
  TYPE_SHORTCUT,
  editorRows,
  filterRows,
  heldGlyphs,
  readRecorderKey,
  recordKey,
  recorderLabel,
  startsTypeMode,
  typedQuery,
  type EditorRow,
} from "../keybindings/editor.ts";
import { groupRows } from "../keybindings/help.ts";
import { useKeyCapture, useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import type { KeyCapture } from "../keybindings/listeners.ts";
import type { OverrideUpdate, Overrides } from "../keybindings/overrides.ts";
import { heldModifiers, type KeyEventLike } from "../keybindings/shortcut.ts";
import type { Modifier, Shortcut } from "../keybindings/types.ts";
import { useSettingsOverrideStore } from "./useSettingsOverrideStore.ts";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => Promise<boolean>;
}

const snapshot = (e: KeyEventLike): KeyEventLike => ({
  key: e.key,
  code: e.code,
  metaKey: e.metaKey,
  ctrlKey: e.ctrlKey,
  altKey: e.altKey,
  shiftKey: e.shiftKey,
});

/** One capture at a time; stopping is idempotent and also runs on unmount. */
function useCapture(onStop: () => void) {
  const captureKeys = useKeyCapture();
  const release = useRef<(() => void) | null>(null);
  const stop = () => {
    release.current?.();
    release.current = null;
    onStop();
  };
  useEffect(() => () => release.current?.(), []);
  const start = (c: KeyCapture) => {
    release.current?.();
    release.current = captureKeys(c);
  };
  return { start, stop };
}

export function KeyBindingsPage({ settings, save }: Props) {
  const { overrides, overridesLoaded } = useKeybindingOverrides();
  const { toasts, show, dismiss } = useToasts();
  const store = useSettingsOverrideStore(settings, save);
  const update = (u: OverrideUpdate) => {
    void store.update(u).then((ok) => ok || show("error", SAVE_FAILED));
  };

  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState<KeyEventLike | undefined>();
  const [typeHeld, setTypeHeld] = useState<Modifier[] | null>(null);
  const typeCapture = useCapture(() => setTypeHeld(null));
  const searchRef = useRef<HTMLInputElement>(null);
  useKeybindings({ "settings.search": () => searchRef.current?.focus() });

  const rows = useMemo(() => editorRows(overrides), [overrides]);
  const groups = useMemo(() => groupRows(filterRows(rows, query, typed)), [rows, query, typed]);

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (typeHeld !== null || !startsTypeMode(query, typed, e.key)) return;
    setTypeHeld(heldModifiers(e));
    typeCapture.start({
      onKeyDown: (ev) => {
        const k = readRecorderKey(ev);
        if (k.kind === "ignore") return;
        if (k.kind === "cancel") return typeCapture.stop();
        if (k.kind !== "shortcut") return setTypeHeld(k.held);
        setTyped(snapshot(ev));
        setQuery(typedQuery(k.shortcut));
        typeCapture.stop();
      },
      onKeyUp: (ev) => setTypeHeld(heldModifiers(ev)),
    });
  };

  return (
    <div className="kb-page">
      <div className="ks-search kb-search">
        <SearchIcon size={16} />
        <input
          ref={searchRef}
          aria-label={EDITOR_SEARCH_PLACEHOLDER}
          placeholder={typeHeld !== null ? TYPE_SHORTCUT : EDITOR_SEARCH_PLACEHOLDER}
          value={typeHeld !== null ? heldGlyphs(typeHeld) : query}
          onKeyDown={onSearchKeyDown}
          onChange={(e) => {
            setTyped(undefined);
            setQuery(e.target.value);
          }}
          onBlur={() => typeCapture.stop()}
        />
      </div>
      {groups.map((g) => (
        <section key={g.category} className="kb-group">
          <h3>{g.category}</h3>
          <div className="settings-rows">
            {g.rows.map((r) => (
              <BindingRow key={r.id} row={r} overrides={overrides} disabled={!overridesLoaded} onChange={update} />
            ))}
          </div>
        </section>
      ))}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function ShortcutList({ shortcuts }: { shortcuts: readonly Shortcut[] }) {
  return (
    <span className="ks-shortcuts">
      {shortcuts.map((s, i) => (
        <span key={i} className="ks-alt">
          {i > 0 && <span className="ks-or">or</span>}
          <Keys shortcut={s} />
        </span>
      ))}
    </span>
  );
}

interface RowProps {
  row: EditorRow;
  overrides: Overrides;
  disabled: boolean;
  onChange: (u: OverrideUpdate) => void;
}

function BindingRow({ row, overrides, disabled, onChange }: RowProps) {
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<Modifier[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const capture = useCapture(() => {
    setRecording(false);
    setHeld([]);
  });
  const conflictId = `keybinding-conflict-${row.id}`;
  const label = recorderLabel(row.title, row.shortcuts, recording, held);

  const start = () => {
    setConflict(null);
    setRecording(true);
    capture.start({
      onKeyDown: (e) => {
        const o = recordKey(row.id, e, overridesRef.current);
        switch (o.kind) {
          case "ignore":
            return;
          case "cancel":
            setConflict(null);
            return capture.stop();
          case "save":
            capture.stop();
            return onChange({ commandId: row.id, shortcuts: [o.shortcut] });
          case "conflict":
            setHeld(o.held);
            return setConflict(conflictMessage({ title: o.title }));
          case "modifier":
            setConflict(null);
            return setHeld(o.held);
          case "held":
            return setHeld(o.held);
        }
      },
      onKeyUp: (e) => setHeld(heldModifiers(e)),
    });
  };

  return (
    <div className="settings-row kb-row" data-command-id={row.id}>
      <div>
        <div className="settings-row-label">{row.title}</div>
        {conflict && (
          <div id={conflictId} className="error small" role="alert">
            {conflict}
          </div>
        )}
      </div>
      <div className="settings-row-control">
        {row.recordable ? (
          <>
            {row.customized && (
              <button className="btn btn-small" disabled={disabled} onClick={() => onChange({ commandId: row.id, shortcuts: undefined })}>
                Reset
              </button>
            )}
            <button
              className={`kb-recorder ${recording ? "recording" : ""}`}
              aria-label={label}
              aria-describedby={conflict ? conflictId : undefined}
              data-keybinding-recorder-active={recording ? "true" : undefined}
              disabled={disabled}
              onClick={() => !recording && start()}
              onBlur={() => capture.stop()}
            >
              {recording ? <span>{held.length > 0 ? heldGlyphs(held) : TYPE_SHORTCUT}</span> : <ShortcutList shortcuts={row.shortcuts} />}
            </button>
            <span className="sr-only" aria-live="polite">
              {recording ? label : ""}
            </span>
          </>
        ) : (
          <span className="kb-fixed">
            <ShortcutList shortcuts={row.shortcuts} />
            <LockIcon size={14} />
            <span className="sr-only">{FIXED_SHORTCUT}</span>
          </span>
        )}
      </div>
    </div>
  );
}
