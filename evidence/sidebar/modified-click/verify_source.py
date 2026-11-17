from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--original-dir', type=Path)
args = parser.parse_args()
here = Path(__file__).resolve().parent
repo = here.parents[2]
source = json.loads((here / 'source.json').read_text())
sha = lambda value: hashlib.sha256(value).hexdigest()
baseline = (here / 'baseline-SidebarWorkspaceRow.tsx.txt').read_bytes()
assert sha(baseline) == source['baseline']['sha256']
assert subprocess.check_output(['git', 'show', source['qualifiedMain'] + ':' + source['baseline']['path']], cwd=repo) == baseline
for line in (here / 'frozen.sha256').read_text().splitlines():
    expected, path = line.split(maxsplit=1)
    assert sha((repo / path).read_bytes()) == expected, path
for span in source['spans']:
    assert sha(span['excerpt'].encode()) == span['sha256'], span['name']
if args.original_dir:
    for name, expected in source['artifacts'].items():
        assert sha((args.original_dir / name).read_bytes()) == expected, name
    renderer = (args.original_dir / 'renderApp-D_fmY7hW.js').read_bytes()
    for span in source['spans']:
        data = span['excerpt'].encode()
        offset = span['utf8Offset']
        assert renderer[offset:offset + len(data)] == data, span['name']
    print('PASS original artifact hashes and six complete retained caller spans')
spans = {span['name']: span['excerpt'] for span in source['spans']}
assert 'onNavigate:it' in spans['SFi'] and 'const it=He' in spans['SFi']
assert '_n.defaultPrevented||_n.button!==0||_n.metaKey||_n.altKey||_n.ctrlKey||_n.shiftKey' in spans['SFi']
assert 'onNavigate:P' in spans['wFi'] and 'onClick:P' in spans['wFi']
assert 'p.jsxs("a",' in spans['wFi']
assert 'u=NCi(n)' in spans['lJn'] and 'p.jsx(SFi,' in spans['lJn']
expected = baseline.decode().replace('  onSelect: () => void;', '  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;').replace(
    '    onSelect: () => {',
    '    onSelect: (event: MouseEvent<HTMLButtonElement>) => {\n      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;',
)
assert (repo / source['baseline']['path']).read_text() == expected
contract = json.loads((here / 'expected-cases.json').read_text())
blocked = [case['id'] for case in contract['cases'][:7]]
controls = [case['id'] for case in contract['cases'][7:]]
red = (here / 'red.tap').read_text()
green = (here / 'green.tap').read_text()
assert re.findall(r'^not ok \d+ - Sidebar row activation: (\S+)', red, re.M) == blocked
assert re.findall(r'^ok \d+ - Sidebar row activation: (\S+)', red, re.M) == controls
assert re.findall(r'^ok \d+ - Sidebar row activation: (\S+)', green, re.M) == blocked + controls
assert '# tests 10\n' in green and '# fail 0\n' in green
assert '# tests 32\n' in (here / 'adjacent.tap').read_text()
assert '# fail 0\n' in (here / 'adjacent.tap').read_text()
print('PASS fresh-main baseline, frozen fixtures, original caller joins, exact minimal product diff, and recorded ten-case RED/GREEN results')
