"""Verify retained static data and injected Rust fixtures without a native probe."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROBE = ROOT / 'src-tauri/src/full_disk_access/probe.rs'
PACKET_SHA256 = '685ac6011116c6153af97ee8d739c914fc452eac23690165c840ff207d3995fc'


def run(command, cwd=None):
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)


def require_success(result):
    if result.returncode:
        sys.stderr.write(result.stdout + result.stderr)
        raise SystemExit(result.returncode)


def main():
    packet = HERE / 'reference-v4.tar.gz'
    assert hashlib.sha256(packet.read_bytes()).hexdigest() == PACKET_SHA256
    with tempfile.TemporaryDirectory(prefix='settings49-fda-pure-') as scratch:
        scratch = pathlib.Path(scratch)
        reference = scratch / 'reference'
        with tarfile.open(packet, 'r:gz') as archive:
            for member in archive.getmembers():
                path = pathlib.PurePosixPath(member.name)
                assert not path.is_absolute() and '..' not in path.parts
                assert member.isfile() or member.isdir()
                destination = reference / path
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(archive.extractfile(member).read())
        static = run([sys.executable, str(reference / 'verify.py')])
        require_success(static)
        static_report = json.loads(static.stdout)
        assert static_report['static_checks_passed'] == 15

        binary = scratch / 'fixtures'
        compiled = run(['rustc', '--edition', '2021', '--test', '-D', 'warnings',
                        str(PROBE), '-o', str(binary)])
        require_success(compiled)
        tested = run([str(binary)])
        require_success(tested)
        assert 'test result: ok. 5 passed;' in tested.stdout
        print(tested.stdout, end='')

        source = PROBE.read_text()
        fixture_path = str(HERE / 'fixtures.rs')
        original_path = '../../../evidence/settings/full-disk-access-native/fixtures.rs'
        assert source.count(original_path) == 1
        source = source.replace(original_path, fixture_path)
        mutants = {
            'wrong-error-kind': ('io::ErrorKind::PermissionDenied', 'io::ErrorKind::NotFound'),
            'two-byte-read': ('[0_u8; 1]', '[0_u8; 2]'),
            'probe-without-home': (
                'let Some(home) = home() else {\n        return true;\n    };',
                'let home = home().unwrap_or_default();'),
            'zero-byte-is-false': (
                '!matches!(result, Err(error) if error.kind() == io::ErrorKind::PermissionDenied)',
                'matches!(result, Ok(1))'),
        }
        discriminated = []
        for name, (old, new) in mutants.items():
            assert source.count(old) == 1
            mutant = scratch / (name + '.rs')
            mutant.write_text(source.replace(old, new))
            mutant_binary = scratch / name
            compiled = run(['rustc', '--edition', '2021', '--test', '-D', 'warnings',
                            str(mutant), '-o', str(mutant_binary)])
            require_success(compiled)
            tested_mutant = run([str(mutant_binary)])
            assert tested_mutant.returncode != 0, name + ' was not rejected'
            assert 'test result: FAILED' in tested_mutant.stdout, tested_mutant.stderr
            discriminated.append(name)

        print(json.dumps({
            'static_checks_passed': static_report['static_checks_passed'],
            'pure_fixture_tests_passed': 5,
            'compiled_mutants_rejected': discriminated,
            'mutant_scope': 'Fixture discrimination only, not actual pre-fix behavior',
            'production_probe_invoked': False,
            'native_or_ui_verification': 'not run',
        }))


if __name__ == '__main__':
    main()
