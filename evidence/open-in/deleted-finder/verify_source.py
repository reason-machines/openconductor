import argparse
import hashlib
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    receipt = json.loads((ROOT / 'source.json').read_text())
    checks = {}
    for name, spec in receipt['spans'].items():
        data = (ROOT / 'reference' / f'{name}.txt').read_bytes()
        checks[f'span:{name}'] = sha(data) == spec['sha256'] and len(data) == spec['bytes']
    for path, expected in receipt['main_sources'].items():
        data = subprocess.check_output(['git', 'show', f'{receipt["main"]}:{path}'], cwd=REPO)
        checks[f'main:{path}'] = sha(data) == expected
        if args.baseline and path != 'src-tauri/src/open_in/mod.rs':
            checks[f'baseline-unchanged:{path}'] = sha((REPO / path).read_bytes()) == expected
    fixture = REPO / 'src-tauri/src/open_in/deleted_finder_ipc.rs'
    checks['fixture-frozen'] = sha(fixture.read_bytes()) == receipt['fixture_sha256']
    checks['fixture-copy'] = fixture.read_bytes() == (ROOT / 'fixture-v1.rs.txt').read_bytes()
    checks['ten-cases-plus-child-entry'] = fixture.read_bytes().count(b'#[test]') == 11
    module = (REPO / 'src-tauri/src/open_in/mod.rs').read_text()
    registration = '#[cfg(all(test, unix))]\nmod deleted_finder_ipc;\n'
    checks['module-registered-on-unix-tests'] = module.count(registration) == 1
    if args.baseline:
        checks['only-registration-changes-module'] = sha(module.replace(registration, '').encode()) == receipt['main_sources']['src-tauri/src/open_in/mod.rs']
    cargo = (REPO / 'src-tauri/Cargo.toml').read_text()
    checks['existing-tauri-test-feature'] = 'tauri = { version = "2", features = ["test"] }' in cargo
    checks['ordinary-ci-cargo-test'] = 'cargo test --locked' in (REPO / '.github/workflows/ci.yml').read_text()
    for path, expected in receipt['preserved_fixtures'].items():
        checks[f'preserved:{path}'] = sha((REPO / path).read_bytes()) == expected
    checks['native-archive'] = sha((ROOT / 'native-source-only.tar.gz').read_bytes()) == receipt['native_archive_sha256']
    with tarfile.open(ROOT / 'native-source-only.tar.gz', 'r:gz') as archive:
        def payload(name):
            member = archive.getmember('native/' + name)
            if not member.isfile():
                raise ValueError(f'Not a regular evidence file: {name}')
            return archive.extractfile(member).read()

        manifest = json.loads(payload('manifest.json'))
        native = json.loads(payload('static-recovery.json'))
        for spec in manifest['files']:
            data = payload(spec['path'])
            checks[f'native-payload:{spec["path"]}'] = len(data) == spec['size'] and sha(data) == spec['sha256']
        checks['native-REA-subject'] = native['rea_macho']['subject']['digest']['sha256'] == manifest['binary_sha256'] == receipt['native_binary_sha256']
        words_total = 0
        for spec in native['functions']:
            start, end = int(spec['address'], 16), int(spec['end_exclusive'], 16)
            words = []
            for line in payload(spec['address'] + '.s').decode().splitlines():
                match = re.match(r'^\s*([0-9a-f]+):\s+([0-9a-f]{8})\s+(.+)$', line)
                if match:
                    words.append((int(match[1], 16), bytes.fromhex(match[2])[::-1]))
            checks[f'native-words:{spec["address"]}'] = [pc for pc, _ in words] == list(range(start, end, 4)) and b''.join(word for _, word in words) == payload(spec['address'] + '.bin')
            words_total += len(words)
        checks['native-instruction-count'] = words_total == 8874
    failed = [name for name, passed in checks.items() if not passed]
    print(json.dumps({'checks': len(checks), 'passed': sum(checks.values()), 'failed': failed, 'main': receipt['main'], 'fixture_execution': 'NOT_RUN', 'native_runtime': 'NOT_RUN'}))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
