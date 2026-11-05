// Controls shared by the settings pages, shaped like Conductor's settings
// primitives (renderApp-D_fmY7hW.js): `Zb` (a row with a switch), `Z5e` (a row
// with a select, `triggerClassName` sets its width), `tUt` (a row with an
// outline button). Rows themselves are `Row` in GeneralPage.tsx.
import type { ReactNode } from "react";
import { Row } from "./GeneralPage";
import { boolPref, withBoolPref, type BoolPrefKey } from "./prefs";
import type { Settings } from "./types";

export function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

export interface Option<V extends string> {
  value: V;
  label: string;
}

/** A select trigger `width` px wide (Conductor's `w-[140px]` and friends). */
export function Select<V extends string>({
  label,
  value,
  options,
  width = 140,
  disabled,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly Option<V>[];
  width?: number;
  disabled?: boolean;
  onChange: (v: V) => void;
}) {
  return (
    <select className="settings-select" aria-label={label} style={{ width }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as V)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A switch row for a table-backed pref (prefs.ts). */
export function PrefSwitchRow({
  settings,
  save,
  pref,
  label,
  help,
  disabled,
}: {
  settings: Settings;
  save: (next: Settings) => void;
  pref: BoolPrefKey;
  label: string;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Row label={label} help={help}>
      <Toggle label={label} checked={boolPref(settings, pref)} disabled={disabled} onChange={(on) => save(withBoolPref(settings, pref, on))} />
    </Row>
  );
}

/** Conductor's `tUt`: a row whose control is one outline button. */
export function ButtonRow({ label, help, button, icon, onClick, disabled }: { label: string; help?: ReactNode; button: string; icon?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Row label={label} help={help}>
      <button type="button" className="btn settings-outline" disabled={disabled} onClick={onClick}>
        {icon}
        {button}
      </button>
    </Row>
  );
}

/** A keyboard shortcut drawn as Conductor's `Ss` key glyphs. */
export function Keys({ glyphs }: { glyphs: string }) {
  return <kbd className="settings-kbd">{glyphs}</kbd>;
}
