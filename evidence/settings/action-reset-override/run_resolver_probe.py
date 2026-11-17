#!/usr/bin/env python3
"""Run unchanged effective-test bodies against frozen/current real config modules.

Offline dependency-equivalent fallback: the crate's tempfile dependency is absent.
Only its temporary-directory host is replaced with std::fs RAII; all resolver,
TOML writer, serializer and assertions are actual production/test source. This is
not the ordinary crate test harness or Tauri/native transport verification.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
PROBE = ROOT / '.oc-tmp/settings-action-reset/resolver-probe'
PROBE.mkdir(parents=True, exist_ok=True)
(PROBE / 'src').mkdir(exist_ok=True)
config = ROOT / 'crates/scripts/src/config'
baseline = PROBE / 'baseline-config'
shutil.copytree(config, baseline, dirs_exist_ok=True)
shutil.copyfile(EVIDENCE / 'frozen/effective.rs.txt', baseline / 'effective.rs')
source = (config / 'effective_tests.rs').read_text()
names = re.findall(r'#\[test\]\nfn (\w+)\(', source)
assert len(names) >= 20
# Removal of the test-registration attributes is the only test-file transform.
# Every function, helper and assertion byte remains unchanged.
body = source.replace('#[test]\n', '')
assert body.replace('use super::*;', '', 1).count('use super::*;') == 0
expected = {'prompts_blank_override_retains_source_and_reset_reveals_inherited',
            'prompts_blank_managed_value_keeps_precedence_and_source'}
assert expected.issubset(names)
shim = r'''
mod tempfile {
    use std::{io, path::{Path, PathBuf}, sync::atomic::{AtomicUsize, Ordering}};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    pub struct TempDir(PathBuf);
    impl TempDir { pub fn path(&self) -> &Path { &self.0 } }
    impl Drop for TempDir { fn drop(&mut self) { std::fs::remove_dir_all(&self.0).unwrap(); } }
    pub fn tempdir() -> io::Result<TempDir> {
        let dir = std::env::temp_dir().join(format!("oc-actions-reset-probe-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir(&dir)?;
        Ok(TempDir(dir))
    }
}
'''
parts = [shim]
for label, path in [('baseline', baseline / 'mod.rs'), ('treatment', config / 'mod.rs')]:
    parts.append(f'#[path = {json.dumps(str(path))}] mod {label};\n')
    calls = []
    for name in names:
        expect = label == 'baseline' and name in expected
        calls.append(f'''let failed = std::panic::catch_unwind({name}).is_err();
            assert_eq!(failed, {str(expect).lower()}, "{label}: {name}");
            println!("{label}: {name}: {'EXPECTED ASSERTION FAILURE' if expect else 'PASS'}");''')
    parts.append(f'''mod proof_{label} {{
        pub use crate::{label}::*;
        use toml::{{Table, Value}};
        mod cases {{
            use crate::tempfile;
            {body}
            pub fn run() {{ {''.join(calls)} }}
        }}
        pub fn run() {{ cases::run(); }}
    }}\n''')
parts.append('fn main() { proof_baseline::run(); proof_treatment::run(); }\n')
(PROBE / 'src/main.rs').write_text(''.join(parts))
(PROBE / 'Cargo.toml').write_text('''[package]
name = "oc-actions-reset-resolver-proof"
version = "0.0.0"
edition = "2021"
publish = false
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
toml = { version = "0.8", features = ["preserve_order"] }
[workspace]
''')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
identities = {
    'real_config_sources': {str(p.relative_to(ROOT)): sha(p) for p in sorted(config.glob('*.rs')) if not p.name.endswith('tests.rs')},
    'frozen_effective_sha256': sha(baseline / 'effective.rs'),
    'production_tests_sha256': sha(config / 'effective_tests.rs'),
    'all_test_bodies_preserved': True,
    'registration_only_transform': '#[test] attributes removed to call exact functions from binary',
    'host_substitution': 'std::fs RAII TempDir, no tempfile crate; all synthetic directories removed on Drop',
    'cases_per_variant': len(names),
    'baseline_intended_assertion_failures': sorted(expected),
    'probe_main_sha256': sha(PROBE / 'src/main.rs'),
    'limits': 'Offline real config-module proof, not normal crate harness, Tauri or native persistence acceptance.',
}
(EVIDENCE / 'resolver-probe-identities.json').write_text(json.dumps(identities, indent=2) + '\n')
command = ['cargo', 'run', '--offline', '-j1', '--quiet', '--manifest-path', str(PROBE / 'Cargo.toml')]
print('COMMAND:', ' '.join(command), flush=True)
result = subprocess.run(command, cwd=ROOT, env={**os.environ, 'RUSTFLAGS': '-Awarnings'}, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(EVIDENCE / 'rust-resolver-probe.log').write_text(result.stdout)
print(result.stdout[-14000:])
if result.returncode:
    raise SystemExit(result.returncode)
assert result.stdout.count('EXPECTED ASSERTION FAILURE') == len(expected)
assert result.stdout.count(': PASS') == 2 * len(names) - len(expected)
print(f'PASS: frozen resolver {len(names)-len(expected)} pass / {len(expected)} intended assertion failures; treatment {len(names)}/{len(names)} pass')
