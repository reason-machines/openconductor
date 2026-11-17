#!/usr/bin/env python3
"""Freeze the bounded current-only RED and verify unchanged sources/old controls.

Run from repository root, after exporting the pinned main's src and package.json
and copying the new test into that snapshot (README). Never executes vendor JS.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess

MAIN = 'e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269'
ROOT = Path.cwd()
OUT = ROOT / 'evidence/sidebar-project-filter-numbering/current'
SNAPSHOT = ROOT / '.oc-tmp/sidebar-project-filter-numbering/main'
FIXTURE = Path('src/sidebar/sidebarProjectFilterNumbering.test.ts')
UPLOADS = ROOT.parent / '.ara-run-chat-attachments/session'
REFERENCE = UPLOADS / 'sidebar-project-filter-numbering-reference-de6.json'
VERIFIER = UPLOADS / 'sidebar-project-filter-numbering-verify-reference-de6.py'
REFERENCE_SHA = '5e704cf8e4df1f325992613f051bf7f21de164057eb38cb9846e2b324a52c627'
VERIFIER_SHA = '08408455c80d52c7745cd3b549d71a1dbf12cd62f5b69a30f1468f478076b6cc'
OLD_FIXTURE_SHA = 'bbea95554e60381830e80fe5980fa63583a7f39db2aa90dcd66d211c6a2e286e'

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git(*args: str) -> bytes:
    return subprocess.check_output(['git', *args])

# Verify the one handed packet only. Do not reacquire/re-extract the renderer.
assert sha(REFERENCE.read_bytes()) == REFERENCE_SHA
assert sha(VERIFIER.read_bytes()) == VERIFIER_SHA
spec = importlib.util.spec_from_file_location('held_reference_verifier', VERIFIER)
assert spec and spec.loader
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
reference_result = verifier.verify(json.loads(REFERENCE.read_text()), None)
assert reference_result['status'] == 'PASS'

before_fixture = (ROOT / FIXTURE).read_bytes()
assert (SNAPSHOT / FIXTURE).read_bytes() == before_fixture
# The six original selector tests are unchanged byte for byte; only import
# declarations and the supplemental mounted replay were added.
selector_prefix = before_fixture.decode().split('// Consumer replay:')[0].rstrip() + '\n'
for added in [
    'import { readFileSync } from "node:fs";\n',
    'import { createRequire } from "node:module";\n',
    'import { dirname, resolve } from "node:path";\n',
    'import { fileURLToPath } from "node:url";\n',
    'import { runInNewContext } from "node:vm";\n',
    'import type { Action } from "../state/store.ts";\n',
]:
    assert selector_prefix.count(added) == 1
    selector_prefix = selector_prefix.replace(added, '')
assert sha(selector_prefix.encode()) == OLD_FIXTURE_SHA

# Verify every exported production source, not just the root selector.
source_hashes = {}
for name in git('ls-tree', '-r', '--name-only', MAIN, 'src').decode().splitlines():
    assert (SNAPSHOT / name).read_bytes() == git('show', f'{MAIN}:{name}'), name
    source_hashes[name] = sha((SNAPSHOT / name).read_bytes())
tracked_before = git('diff', '--binary', 'HEAD')
assert tracked_before == b'', 'unexpected tracked edits before replay'
command = ['node', '--experimental-strip-types', '--test', str(SNAPSHOT / FIXTURE)]
run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
log = run.stdout
assert run.returncode == 1
assert re.search(rb'^# tests 12$', log, re.M)
assert re.search(rb'^# pass 5$', log, re.M)
assert re.search(rb'^# fail 7$', log, re.M)
assert len(re.findall(rb"^  code: 'ERR_ASSERTION'$", log, re.M)) == 7
assert len(re.findall(rb'^ok (?:1|6|7|8|12) - ', log, re.M)) == 5
assert b"code: 'ERR_TEST_FAILURE'" not in log
assert b'TypeError' not in log and b'ReferenceError' not in log
assert (ROOT / FIXTURE).read_bytes() == before_fixture
assert (SNAPSHOT / FIXTURE).read_bytes() == before_fixture
for name, digest in source_hashes.items():
    assert sha((SNAPSHOT / name).read_bytes()) == digest, name
assert git('diff', '--binary', 'HEAD') == tracked_before
(OUT / 'consumer-red.tap').write_bytes(log)
pins = [
    'src/components/home/ProjectFilterSubmenu.tsx', 'src/home/useRepoFilter.ts',
    'src/settings/appPrefs.ts', 'src/state/store.ts', 'src/components/Sidebar.tsx',
    'src/components/SidebarWorkspaceRow.tsx', 'src/state/sidebarOrder.ts',
    'src/state/shortcutHint.ts', 'src/home/repoFilter.ts', 'src/state/repoOrder.ts',
    'src/palette/fromAppState.ts', 'src/palette/PaletteHost.tsx',
    'src/keybindings/bind.ts', 'src/keybindings/dispatcher.ts',
    'src/keybindings/resolve.ts', 'src/keybindings/overrides.ts',
    'src/keybindings/registry.ts', 'src/components/sidebarLabel.ts',
]
result = {
    'unit': 'SIDEBAR-PROJECT-FILTER-NUMBERING',
    'verdict': 'QUALIFIED_BOUNDED_PRODUCER_RENDER_AND_DISPATCH_RED',
    'author': 'Conductor Rebuild', 'machine': 'Reason Cloud Linux',
    'checked_main': MAIN,
    'fresh_main_resolution': 'repos_compare_commits(main, e6f9dfcb) returned identical this turn',
    'fixture': {'path': str(FIXTURE), 'sha256': sha(before_fixture), 'unchanged_during_run': True},
    'original_six_selector_tests': {'sha256': OLD_FIXTURE_SHA, 'assertions_byte_unchanged': True},
    'log': {'path': 'consumer-red.tap', 'sha256': sha(log)},
    'run': {'command': 'node --experimental-strip-types --test .oc-tmp/sidebar-project-filter-numbering/main/' + str(FIXTURE),
            'exit_code': run.returncode, 'tests': 12, 'passing_controls': 5, 'assertion_failures': 7,
            'selector_assertion_failures': 4, 'mounted_consumer_assertion_failures': 3,
            'harness_errors': 0, 'skipped': 0, 'cancelled': 0},
    'actual_normal_producer': ['ProjectFilterSubmenu Beta radio click', 'useRepoFilter setFilter',
        'setAppPref browser-fallback path', 'useAppPrefs subscription', 'useAppStore viewState',
        'Sidebar repository filter/render', 'useWorkspaceRows rowProps', 'SidebarWorkspaceRow visible hint'],
    'actual_numbered_dispatch': ['real registry/bindCommands/createDispatcher Command-1/2',
        'actual PaletteHost registered workspace.switchToN handler', 'actual shortcutOrder/sidebarEntries',
        'select action', 'actual store reducer'],
    'witness': {'normal_project_filter': 'beta', 'grouping': 'repo', 'selection_before_key': 'home',
        'repos': ['alpha', 'beta'], 'loaded_and_expanded': True, 'ordinary_rows_per_repo': 1,
        'sections': [], 'pins': [], 'shared_rows': []},
    'expected': {'rendered_row_labels': ['Beta row'], 'visible_hint': {'text': '1', 'aria_label': 'Switch with Command-1'},
        'command_1_selection': {'repoId': 'beta', 'workspaceId': 'beta-row'}, 'command_2_action': None},
    'actual': {'rendered_row_labels': ['Beta row'], 'visible_hint': {'text': '2', 'aria_label': 'Switch with Command-2'},
        'command_1_selection': {'repoId': 'alpha', 'workspaceId': 'alpha-row'},
        'command_2_selection': {'repoId': 'beta', 'workspaceId': 'beta-row'}},
    'controls_passed': [
        'normal repository-group filter selects only Beta', 'selectors do not mutate loaded rows',
        'mounted unfiltered labels, hints and both dispatched targets',
        'actual Beta radio preference and app-store propagation; full repositories unchanged',
        'actual All projects radio restores labels/hints/targets; full repositories unchanged; zero native invokes'],
    'source_pins': {name: source_hashes[name] for name in pins},
    'unchanged': {'all_exported_source_files': len(source_hashes), 'all_exported_source_hashes': source_hashes,
        'tracked_diff_empty_before_and_after': True, 'reference_packet_sha256': REFERENCE_SHA,
        'reference_verifier_sha256': VERIFIER_SHA},
    'reference_check': reference_result,
    'mocks_and_limits': [
        'React test renderer, not launched application; DOM geometry/portals and time are in-memory adapters.',
        'Preference path uses actual appPrefs browser fallback with fixture storage; native DB IPC is forbidden.',
        'useKeybindings React glue is adapted to real bindCommands/dispatcher; OS/window event delivery is not exercised.',
        'Drag/drop, external scripts/PR/chat/provider effects, decorations and unrelated feature dependencies are inert.',
        'The held reference is a source-backed bounded translation, not an original-app runtime replay.',
        'No blanket visible-row contiguity, #757 inference, section/pin/shared/status/cloud or multi-row-order acceptance.'],
    'not_run': ['GREEN/fix', 'full typecheck/build/integration', 'browser/native/provider/package checks',
        'fresh REA acquisition', 'runtime/installation/delete', 'watcher/release dispatch'],
    'production_edits': False, 'commit_or_pr': None,
}
(OUT / 'consumer-qualification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['verdict', 'checked_main', 'fixture', 'original_six_selector_tests', 'log', 'run']}, indent=2))
print(f'PASS: {len(source_hashes)} main source files unchanged; no tracked changes; original packet unchanged.')
