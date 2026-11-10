# Project selection across palette tabs

Conductor Rebuild compared retained decoded Conductor renderer source with OpenConductor main `aa65f35047db1217862943426d77bc44d142626f`.

## Retained reference source

The existing renderer owner reverified `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This is decoded real-app evidence, not original source or runtime observation. Byte offsets are zero-based UTF8, end exclusive.

- `h_a` at 10888841 and `qZ`/`Y5s` around 2914175/2914850 mount an uncontrolled Command root. They supply no selection value or tab-dependent key.
- `m_a` at [10889115,10920819) keeps query and tab in state. Its tab handler changes the tab, not the query. All and Projects use the same non-Workspaces content branch.
- [10919184,10919934) contains the shared Projects group below. Each item retains its repository key and value on All to Projects and back.
- `P6`/`Xyi` at 2903072 registers items and schedules first-item selection only if the stored value is empty. Removal schedules first-item selection only if the removed item was selected. The enclosing registration expression is retained below.

```js
(m === "all" || m === "projects") && be.length > 0 && p.jsx(ff, {
  heading: m === "all" ? "Projects" : void 0,
  children: be.map(Gn => p.jsxs($o, {
    value: `project-${Gn.id}`,
    keywords: [Gn.name],
    onSelect: _a,
    children: [p.jsx(U9, { repository: Gn }), p.jsx("span", { className: "min-w-0 truncate", children: Gn.name })]
  }, Gn.id))
})
```

```js
item: (ce, ae) => (
  i.current.add(ce),
  ae && (r.current.has(ae) ? r.current.get(ae).add(ce) : r.current.set(ae, new Set([ce]))),
  D(3, () => { U(); F(); n.current.value || H(); P.emit(); }),
  () => {
    o.current.delete(ce);
    i.current.delete(ce);
    n.current.filtered.items.delete(ce);
    let de = G();
    D(4, () => { U(); de?.getAttribute("id") === ce && H(); P.emit(); });
  }
)
```

The source supports retaining a selected project that survives the All/Projects transition. It does not justify retaining an item removed from the results or changing initial Workspaces selection.

## OpenConductor regression

The previous tab effect reset the active index to zero for every non-Workspaces tab. The focused regression extracts that existing behavior into `tabSelectionIndex` before correction. With query `a`, the selected second project `Beta` becomes `Alpha` on All to Projects, or `New workspace` on Projects to All.

Before correction, `node --experimental-strip-types --test src/palette/tabSelection.test.ts` failed those two assertions and passed the other two. After correction, `node --experimental-strip-types --test src/palette/*.test.ts` passed all 63 tests. `git diff --check` passed.

The component uses the same transition helper for clicked tabs and keyboard tab commands. It preserves the selected project by result ID only across All/Projects. Missing projects and other tab transitions keep their prior defaults. Clicking the current tab is a no-op, as before. Typing still resets selection to the first result.

## Verification limits

The failing-before check exercises the extracted selection logic, not a mounted browser component. Visible proof is queued with the existing serialized runtime owner. No browser, native, package, or local build ran for this change at this milestone.

Rapid reopen is outside this correction. Retained `Lk` [511258,512536), `sb` [512536,514970), `XSe` at 515993, and `BXe` around 1905790 indicate that reopening before teardown completes cancels the pending completion and can preserve the subtree. Actual animation timing and native behavior remain unverified.

Unfiltered Projects initial highlighting has only static support from the empty Command value and registration fallback. No new reference runtime claim is made.
