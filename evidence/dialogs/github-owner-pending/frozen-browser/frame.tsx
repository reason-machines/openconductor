import React from "react";
import { DialogFrame as ActualFrame } from "../../../../src/components/DialogFrame";
import { loadOwners, settle } from "./io";
// Identical fixture-only controls inside the actual modal so inertness is not
// bypassed. Actual DialogFrame/provider/portal/motion remain unchanged.
export function DialogFrame(props: React.ComponentProps<typeof ActualFrame>) {
  return <ActualFrame {...props}>
    <aside className="owner-fixture-controls" aria-label="Synthetic backend controls">
      <span>Inert backend · {document.documentElement.dataset.build}</span>
      <button id="fixture-load" type="button" onClick={loadOwners}>Load owners</button>
      <button id="fixture-reject" type="button" onClick={() => settle("reject")}>Reject creation</button>
      <button id="fixture-resolve" type="button" onClick={() => settle("resolve")}>Resolve creation</button>
    </aside>
    {props.children}
  </ActualFrame>;
}
