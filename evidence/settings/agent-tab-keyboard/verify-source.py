"""Verify the inactive K1 source checkpoint without executing application code."""
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def git(*args):
    return subprocess.check_output(
        ['git', '-c', 'gc.auto=0', *args], cwd=ROOT, timeout=15
    )


def main():
    manifest = json.loads((HERE / 'checkpoint.json').read_text())
    for entry in manifest['files']:
        raw = (HERE / entry['path']).read_bytes()
        assert digest(raw) == entry['sha256'], entry['path']
        assert len(raw) == entry['bytes'], entry['path']

    prior = json.loads((HERE / 'historical/source-receipt-v1.json').read_text())
    assert digest((HERE / 'agentTabsKeyboard.dom.test.mjs').read_bytes()) == prior['fixture']['sha256']
    product_bytes = gzip.decompress((HERE / 'product.patch.gz').read_bytes())
    assert digest(product_bytes) == prior['patch']['sha256']
    for entry in manifest['source_pins']:
        raw = git('show', f"{manifest['checked_main']}:{entry['path']}")
        assert digest(raw) == entry['sha256'], entry['path']
        assert (ROOT / entry['path']).read_bytes() == raw, entry['path']

    census = json.loads((HERE / 'reference/census.json').read_text())
    for entry in census['reference']['spans']:
        raw = (HERE / 'reference' / entry['file']).read_bytes()
        assert digest(raw) == entry['sha256'], entry['file']
        assert len(raw) == entry['bytes'], entry['file']
    for entry in prior['additional_reference_spans']:
        raw = (HERE / entry['path']).read_bytes()
        assert digest(raw) == entry['sha256'], entry['path']
        assert len(raw) == entry['bytes'], entry['path']

    product = product_bytes.decode()
    assert [line for line in product.splitlines() if line.startswith('+++ ')] == [
        '+++ b/src/settings/agents/kit.tsx'
    ]
    publication = (HERE / 'publication.patch').read_text()
    assert [line for line in publication.splitlines() if line.startswith('+++ ')] == [
        '+++ b/.github/workflows/ci.yml',
        '+++ b/src/settings/agents/agentTabKeyboard.test.ts',
        '+++ b/evidence/settings/agent-tab-keyboard/agentTabsKeyboard.dom.test.mjs',
    ]
    assert not (ROOT / 'src/settings/agents/agentTabKeyboard.test.ts').exists()
    wrapper = (HERE / 'agentTabKeyboard.test.ts.txt').read_text()
    assert wrapper.count('  "') == 22
    assert 'context.skip' not in wrapper
    assert 'test.skip' not in wrapper
    assert '833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51' in wrapper
    shell_count = 0
    lines = publication.splitlines()
    for index, line in enumerate(lines):
        if line.startswith('+          npm install '):
            command = []
            while index < len(lines) and lines[index].startswith('+          '):
                command.append(lines[index][11:])
                index += 1
            subprocess.run(['bash', '-n'], input='\n'.join(command) + '\n',
                           text=True, check=True, timeout=5)
            shell_count += 1
    assert shell_count == 2
    assert git('diff', '--name-only', manifest['checked_main'], '--',
               'src', '.github', 'package.json', 'package-lock.json') == b''
    print(json.dumps({
        'checked_main': manifest['checked_main'],
        'retained_files': len(manifest['files']),
        'source_pins': len(manifest['source_pins']),
        'checkpoint_source_checks': 'PASS',
        'production_and_discovery': 'UNCHANGED',
        'runtime_tests': 'NOT_RUN',
        'reference_execution': 'NOT_RUN',
    }, indent=2))


if __name__ == '__main__':
    main()
