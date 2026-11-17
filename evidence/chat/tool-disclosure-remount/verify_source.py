import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[2]
lineage = json.loads((ROOT / 'source-lineage.json').read_text())
current = json.loads((ROOT / 'requalification.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
archive = pathlib.Path(sys.argv[1])
assert sha(archive.read_bytes()) == current['original_archive_sha256']
with tarfile.open(archive) as tar:
    matches = [m for m in tar.getmembers() if m.isfile() and pathlib.PurePosixPath(m.name).name == 'renderApp-D_fmY7hW.js']
    assert len(matches) == 1
    renderer = tar.extractfile(matches[0]).read()
assert sha(renderer) == lineage['original']['renderer_sha256']
for name, span in lineage['original']['spans'].items():
    a, b = span['utf8_half_open']
    data = (ROOT / 'reference' / pathlib.PurePosixPath(span['path']).name).read_bytes()
    assert sha(data) == span['sha256'], name
    assert renderer[a:b] == data, name
for path, pin in current['source_pins'].items():
    data = subprocess.check_output(['git', 'show', current['main_sha'] + ':' + path], cwd=REPO)
    assert sha(data) == pin['sha256'], path
baseline = (ROOT / 'baseline-Transcript.tsx.txt').read_bytes()
assert sha(baseline) == current['baseline_transcript_sha256']
assert baseline == subprocess.check_output(['git', 'show', current['main_sha'] + ':src/features/chat/Transcript.tsx'], cwd=REPO)
fixture = REPO / 'tests/chat-disclosure'
policy = json.loads((fixture / 'static-import-closure.json').read_text())
assert policy['main'] == current['main_sha']
assert not policy['unresolved'] and not policy['unclassified_tsx']
for path, expected in policy['sources'].items():
    data = subprocess.check_output(['git', 'show', current['main_sha'] + ':' + path], cwd=REPO)
    assert sha(data) == expected, path
freeze = json.loads((fixture / 'fixture-freeze.json').read_text())
assert freeze['baseline_main'] == current['main_sha']
for path, expected in freeze['files'].items():
    assert sha((fixture / path).read_bytes()) == expected, path
print(json.dumps({'result': 'PASS', 'main_sha': current['main_sha'], 'exact_reference_spans': len(lineage['original']['spans']), 'source_pins': len(current['source_pins']), 'loader_graph_pins': len(policy['sources']), 'frozen_fixture_files': len(freeze['files']), 'baseline_transcript_pin': 'PASS', 'behavior': 'NOT_RUN'}))
