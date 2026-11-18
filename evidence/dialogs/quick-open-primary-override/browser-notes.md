# Bounded browser receipt — 17 November 2026

Conductor Rebuild / QUICKOPEN-INERT-SAME6013 / ready PR #1467.

Ledger grant: message `6c403845-5d93-4ca0-a902-e78666b8b57a`, sole 15-minute inert proof. Actual start `18:08:30.076Z`; deadline `18:23:30.076Z`; explicit release `18:16:04.504162Z`. Server `6ee12688-422c-44e0-938f-bc446dabac86`, port 48733, one managed tab `1440146777` throughout. No build, full app, native/provider runtime, real backend, real files or original Conductor JavaScript was executed.

## Inputs and readbacks

The same eight controls were run against prebuilt `baseline.html` and `treatment.html` from the immutable browser packet. Input used scoped CDP `Input.dispatchKeyEvent` with `type: keyDown`, the recorded key/code/virtual-key values and exact modifier bits (Alt=1, Ctrl=2, Meta=4, Shift=8); all captured DOM keydowns had `isTrusted: true`. Keydown-only controlled modifiers are not a claim of native macOS physical-chord or keyup coverage.

1. `scenario=default`: Meta+Enter / Enter / virtual 13 / modifiers 4.
2. `scenario=custom`: Meta+D / KeyD / virtual 68 / modifiers 4.
3. `scenario=custom&case=removed-default`: Meta+Enter / virtual 13 / modifiers 4.
4. `scenario=custom&case=plain-enter`: Enter / virtual 13 / modifiers 0.
5. `scenario=additional`: Ctrl+Shift+Y / KeyY / virtual 89 / modifiers 10.
6. `scenario=physical`: Alt+KeyD, logical key `∂`, virtual 68 / modifiers 1.
7. `scenario=custom&case=navigation-click`: ArrowUp / virtual 38 / modifiers 0, then pointer selection as below.
8. `scenario=empty`: Meta+D, no available file.

`browser-readbacks.ndjson` preserves each observed witness. Baseline: 3 controls passed / 5 intended failures. Treatment: 8/8 passed. The initial empty baseline readback was identical to its later post-dispatch corroboration; that latter readback plus settled observer is the canonical empty record. All witnesses had ready true and errors empty.

## Pointer receipt

After trusted ArrowUp, both builds reported first row `aria-selected=false` and second row `aria-selected=true`. The actual second option rectangle was `{x:30,y:226.625,width:648,height:38.296875}`; the first was `{x:30,y:188.328125,width:648,height:38.296875}`.

Scoped `Input.dispatchMouseEvent` sent `mousePressed` then `mouseReleased`, `button: left`, `clickCount: 1`, at `{x:150,y:245}` inside the observed selected second row. Each build captured one opening `{path:"src/second.ts",mode:"file"}` and closed once. The component acts on mousedown and unmounts before click, so its frozen click-only trace contains the preceding trusted ArrowUp but **not a click event**. Do not describe this as a captured trusted-click record; it is an actual CDP pointer press/release and observed selected-row result.

## Final event-consumption observer

The frozen document-capture microtask's event snapshots were all `defaultPrevented:false`; for treatment this was not the final flag. Those values are retained verbatim and not used to claim final consumption. The following identical additive **read-only** observer was attached to each build's empty page before its corroborating keydown:

```javascript
window.__settledKeys = [];
document.addEventListener('keydown', e => setTimeout(() =>
  window.__settledKeys.push({
    key: e.key,
    code: e.code,
    trusted: e.isTrusted,
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
  }), 0), { capture: true });
```

The final read returned trusted/cancelable `d` / `KeyD`, default-prevented false on baseline and true on treatment, with no openings or closes on either. This observer never calls preventDefault/stopPropagation, never changes the component, frozen fixture, app/provider storage or backend state, and never dispatches a fabricated DOM event. No additional bundle, server, browser tab or runtime restart was used.

## Visual evidence

Both PNGs were captured using scoped `Page.captureScreenshot` and inspected before publication:
- `browser-baseline-custom.png`: custom Meta+D leaves the dialog open; observed opens empty / closed zero.
- `browser-treatment-custom.png`: the same shortcut closes once after opening the first diff.

`media.json` contains the durable published Markdown and URLs. These are Linux Chrome actual-component fixtures, not native screenshots or full-App styling/parity acceptance.

## Cleanup

`finalize_tabs({keep:[]})` completed; a fresh managed-tab read returned `[]`. `preview_stop({})` confirmed the named server stopped and its process group ended; `preview_status` returned state stopped / listening null. Own matching server processes were empty. An independent command-namespace bind to 0.0.0.0:48733 passed and is labelled separately (it does not prove the preview namespace stopped). `browser-cleanup.json` contains the exact receipts. Explicit release was delivered to ledger and root before the deadline.
