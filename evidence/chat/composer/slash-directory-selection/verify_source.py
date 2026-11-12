#!/usr/bin/env python3
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--main', required=True)
parser.add_argument('--renderer', required=True)
parser.add_argument('--index', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
checks = []


def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
    if not value:
        raise AssertionError(name)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_file(path):
    return subprocess.check_output(['git', '-c', 'gc.auto=0', 'show', f'{args.main}:{path}'])


manifest_path = 'evidence/frontend/tauri-assets-manifest.json'
manifest = json.loads(git_file(manifest_path))['entries']
assets = {}
for name, path in (('renderApp-D_fmY7hW.js', args.renderer), ('index-BGEQ8YjU.js', args.index)):
    data = Path(path).read_bytes()
    entry = next(item for item in manifest if item['key'] == '/assets/' + name)
    check(name + ' full hash', digest(data) == entry['sha256'])
    check(name + ' full size', len(data) == entry['bytes'])
    assets[name] = data

ranges = [
    ('builtins-and-immediate-effects', 'renderApp-D_fmY7hW.js', 7894479, 7896575),
    ('suggestion-renderer', 'renderApp-D_fmY7hW.js', 8388129, 8390402),
    ('editor', 'renderApp-D_fmY7hW.js', 8418728, 8426168),
    ('registered-on-select', 'renderApp-D_fmY7hW.js', 8421276, 8421705),
    ('composer', 'renderApp-D_fmY7hW.js', 8655325, 8691330),
    ('slash-menu-join', 'renderApp-D_fmY7hW.js', 8679149, 8681315),
    ('slash-selection', 'renderApp-D_fmY7hW.js', 8680979, 8681314),
    ('command-handler', 'renderApp-D_fmY7hW.js', 8667418, 8668977),
    ('directory-command-arm', 'renderApp-D_fmY7hW.js', 8667807, 8667937),
    ('renderer-dialog-alias', 'renderApp-D_fmY7hW.js', 59623, 59632),
    ('index-dialog-export', 'index-BGEQ8YjU.js', 3486019, 3486028),
    ('dialog-identifiers', 'index-BGEQ8YjU.js', 3261227, 3262348),
]
spans = []
for name, asset, start, end in ranges:
    raw = assets[asset][start:end]
    source = raw.decode('utf-8')
    check(name + ' nonempty UTF-8', len(raw) > 0)
    spans.append({'name': name, 'asset': asset, 'utf8_bytes': [start, end], 'sha256': digest(raw), 'source': source})
by_name = {span['name']: span['source'] for span in spans}
builtins = by_name['builtins-and-immediate-effects']
check('complete immediate-effects declaration', builtins.startswith('const hmo=new Set(["pick_linked_directory","pick_personality","show_mcp_status","open_terminal"])'))
check('add-dir name and effect', 'uUt="add-dir"' in builtins and 'name:uUt,description:"Link a directory or workspace",argumentHint:"",effect:"pick_linked_directory"' in builtins)
check('selection deletes only supplied range and invokes existing effect', 'if(Oa&&hmo.has(Oa.effect)){ln.chain().focus().deleteRange($r).run(),ua(Oa);return}' in by_name['slash-selection'])
check('other commands retain bounded insertion', 'insertContentAt($r,`/${Vf} `)' in by_name['slash-selection'])
check('directory selection opens ICt', 'nr.openDialog(ICt)' in by_name['directory-command-arm'])
check('dialog import alias', by_name['renderer-dialog-alias'] == 'jV as ICt')
check('dialog export alias', by_name['index-dialog-export'] == 'ZVt as jV')
check('dialog identifier', 'ZVt="pick-linked-directories-dialog"' in by_name['dialog-identifiers'])

product_paths = ['src/features/chat/Composer.tsx', 'src/features/chat/ComposerEditor.tsx', 'src/features/chat/SlashMenu.tsx', 'src/features/chat/slashCommands.ts', 'src/components/WorkspaceView.tsx']
product = {}
for path in product_paths:
    raw = git_file(path)
    product[path] = {'sha256': digest(raw), 'bytes': len(raw)}
composer = git_file(product_paths[0]).decode()
start = composer.index('  function pickCommand(')
end = composer.index('\n  function submit(', start)
pick = composer[start:end]
check('current picker uses bounded text replacement', 'box.replaceRange(range,' in pick)
check('current picker does not invoke command or link handler', 'onCommand' not in pick and 'onLinkWorkspaces' not in pick)
workspace = git_file(product_paths[-1]).decode()
check('existing workspace directory trigger', 'c.effect === "pick_linked_directory")) { void openLinks(); return true; }' in workspace)
check('existing link callback', 'onLinkWorkspaces={() => void openLinks()}' in workspace)
check('existing provider-name collision guard', '(c.effect === "agent" || c.effect === "skill")' in workspace)
packet = {
    'key': 'composer-local-add-dir-immediate-selection',
    'stage': 'SOURCE_QUALIFIED_REGRESSION_PREPARATION_ONLY',
    'owner': '13576d11-76fb-4842-aa9b-c398f9ca26f3',
    'main_sha_checked': args.main,
    'assets': {name: {'bytes': len(raw), 'sha256': digest(raw)} for name, raw in assets.items()},
    'rea': {'record': 'evidence/frontend/rea-analyze-javascript-application.json.gz', 'evidence_id': 'ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367', 'parse_status': 'skipped after JavaScript-worker heap exhaustion; inert compiled-source inspection, not a generated call graph'},
    'coordinate_units': 'zero-based half-open UTF-8 bytes, not editor positions',
    'spans': spans,
    'product_files': product,
    'checks': checks,
    'proposed_contract': 'Only local built-in add-dir without an agent/skill-name collision. Enter, Tab or mouse selection deletes only the live suggestion range and invokes the existing link-workspaces capability once, with no submit, prompt or attachment clearing.',
    'controls': ['agent/skill add-dir collisions remain text/skill selections', 'plan and fast remain draft insertion on selection', 'suffix text and file nodes survive', 'stale or nonempty selection and composition do not invoke action', 'missing link capability remains a text completion'],
    'limits': ['No test execution or observed RED', 'No product edits', 'No browser/native/provider action or dispatch', 'No LinkDialog UI, startup/profile edits or other immediate built-ins', 'No native acceptance credit; original REA provenance is retained rather than newly acquired'],
}
Path(args.output).write_text(json.dumps(packet, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'checks_passed': len(checks), 'main': args.main, 'packet_sha256': digest(Path(args.output).read_bytes()), 'stage': packet['stage']}))
