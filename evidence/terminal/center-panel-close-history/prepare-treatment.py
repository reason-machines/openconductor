"""Prepare an UNAPPLIED three-file candidate; never write product source or execute tests."""
from pathlib import Path
import difflib
import hashlib
import json

ROOT = Path.cwd()
STATE = ROOT / '.oc-tmp/center-close-history-1f'
sha = lambda data: hashlib.sha256(data).hexdigest()


def replace(source, old, new):
    assert source.count(old) == 1, 'ambiguous source join'
    return source.replace(old, new)


def main():
    model_path = 'src/features/workspace/centerPanelLayout.ts'
    hook_path = 'src/features/workspace/CenterPanelGroups.tsx'
    view_path = 'src/components/WorkspaceView.tsx'
    originals = {path: (STATE / 'baseline' / path).read_text() for path in (model_path, hook_path, view_path)}
    for path, original in originals.items():
        assert (ROOT / path).read_text() == original, 'product already changed: ' + path
    model = replace(originals[model_path], 'const EMPTY: CenterLayout = { root: null, activeGroupId: null };', '''const EMPTY: CenterLayout = { root: null, activeGroupId: null };
// Live navigation history is workspace-local, never part of the persisted layout.
const viewedCenterTabs = new Map<string, string[]>();''')
    model = replace(model, '/** Reference Tcs: split the active group horizontally; the existing active tab moves second. */', '''/** Reference yYo.Q: active closes prefer surviving view history across groups. */
export function closeCenterTab(layout: CenterLayout, tab: string, history: readonly string[]): CenterLayout {
  const tabs = centerGroups(layout.root).flatMap((group) => group.tabs);
  if (!tabs.includes(tab)) return layout;
  const remaining = tabs.filter((key) => key !== tab);
  const next = reconcileCenterLayout(layout, remaining);
  if (activeCenterTab(layout) !== tab) return next;
  const survivor = history.find((key) => remaining.includes(key));
  return survivor ? selectCenterTab(next, survivor) : next;
}

/** Reference Tcs: split the active group horizontally; the existing active tab moves second. */''')
    model = replace(model, '  const listeners = new Set<() => void>();', '''  const listeners = new Set<() => void>();
  const remember = (tab: string | undefined) => {
    const available = new Set(centerGroups(layout.root).flatMap((group) => group.tabs));
    if (tab && available.has(tab)) {
      viewedCenterTabs.set(workspaceId, [tab, ...(viewedCenterTabs.get(workspaceId) ?? []).filter((key) => key !== tab && available.has(key))]);
    }
  };''')
    model = replace(model, '''    selectTab(tab: string) { if (enabled) commit(selectCenterTab(layout, tab)); },
    activateGroup(id: string) {
      const group = centerGroups(layout.root).find((entry) => entry.id === id);
      if (enabled && group) commit(selectCenterTab(layout, group.activeTab));
    },''', '''    selectTab(tab: string) {
      if (!enabled) return;
      commit(selectCenterTab(layout, tab));
      remember(tab);
    },
    activateGroup(id: string) {
      const group = centerGroups(layout.root).find((entry) => entry.id === id);
      if (enabled && group) {
        commit(selectCenterTab(layout, group.activeTab));
        remember(group.activeTab);
      }
    },
    closeTab(tab: string) {
      if (!enabled) return;
      const history = (viewedCenterTabs.get(workspaceId) ?? []).filter((key) => key !== tab);
      viewedCenterTabs.set(workspaceId, history);
      const active = activeCenterTab(layout) === tab;
      commit(closeCenterTab(layout, tab, history));
      if (active) remember(activeCenterTab(layout));
    },''')
    hook = replace(originals[hook_path], '''    split: controller.split,
    select(groupId: string, tab: string) {''', '''    split: controller.split,
    closeTab(tab: string) {
      if (!enabled) return;
      controller.closeTab(tab);
      const active = activeCenterTab(controller.snapshot());
      if (active && active !== selectedTab) onSelect(active);
    },
    select(groupId: string, tab: string) {''')
    view = replace(originals[view_path], 'onCloseTerminal={(id) => closeTab(workspace.id, id)}', 'onCloseTerminal={(id) => { centerPanel.closeTab(`terminal:${id}`); closeTab(workspace.id, id); }}')
    proposed = {model_path: model, hook_path: hook, view_path: view}
    patch = ''.join(''.join(difflib.unified_diff(originals[path].splitlines(keepends=True), source.splitlines(keepends=True), fromfile='a/' + path, tofile='b/' + path, n=3)) for path, source in proposed.items())
    target = STATE / 'treatment.UNAPPLIED.patch'
    assert not target.exists(), 'do not overwrite an existing treatment'
    target.write_text(patch)
    receipt = {'author': 'Conductor Rebuild', 'state': 'UNAPPLIED_NOT_RUN', 'patch': {'path': str(target.relative_to(ROOT)), 'bytes': len(target.read_bytes()), 'sha256': sha(target.read_bytes())}, 'sources': {path: {'before_sha256': sha(originals[path].encode()), 'proposed_sha256': sha(source.encode()), 'proposed_bytes': len(source.encode())} for path, source in proposed.items()}, 'owned_boundaries': ['centerPanelLayout.ts model/controller + nonpersisted workspace history', 'CenterPanelGroups.tsx grouped hook close transition', 'WorkspaceView.tsx only MainTabs.onCloseTerminal callback; no imports'], 'runtime': False, 'product_changed': False}
    (STATE / 'treatment-source-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    for path, original in originals.items():
        assert (ROOT / path).read_text() == original
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
