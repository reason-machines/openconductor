import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RenameChatDialog } from "../../../src/components/RenameChatDialog";
import { KeybindingsProvider, useKeybindingOverrides } from "../../../src/keybindings/KeybindingsProvider";
import "../../../src/fonts.css";
import "../../../src/theme/tokens.css";
import "../../../src/styles.css";
import "../../../src/components/motion/motion.css";
import "../../../src/components/motion/screens.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = "dark";

function Fixture() {
  const [open, setOpen] = useState(false);
  const [renamed, setRenamed] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const { overridesLoaded } = useKeybindingOverrides();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Rename fixture chat</button>
      <button type="button">Background action</button>
      <output data-testid="renamed" data-overrides-ready={overridesLoaded}>{JSON.stringify(renamed)}</output>
      <output data-testid="errors">{JSON.stringify(errors)}</output>
      {open && <RenameChatDialog
        currentTitle="Fixture chat"
        onRename={async (title) => {
          setRenamed((old) => [...old, title]);
          if (params.has("hold")) await new Promise<void>(() => {});
        }}
        onClose={() => setOpen(false)}
        onError={(error) => setErrors((old) => [...old, error])}
      />}
    </>
  );
}

const loadOverrides = params.has("customShortcut")
  ? async () => JSON.stringify({ version: 1, overrides: { "dialog.primaryAction": [{ key: { kind: "logical", value: "k" }, modifiers: ["alt"] }] } })
  : undefined;
const root = document.getElementById("root");
if (root) createRoot(root).render(<KeybindingsProvider loadOverrides={loadOverrides}><Fixture /></KeybindingsProvider>);
