"""Verify frozen source and the exact row-only patch. No target JavaScript runs."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    manifest = json.loads((HERE / 'source.json').read_text())
    frozen = (HERE / 'frozen.sha256').read_text().splitlines()
    for line in frozen:
        expected, path = line.split('  ', 1)
        assert sha((ROOT / path).read_bytes()) == expected, path
    baseline = (HERE / 'baseline/GeneralPage.tsx').read_bytes()
    assert sha(baseline) == manifest['baseline_sha256'] == '72eb0193654acce1af05932e1ad104127ca6afd7094fa5fbf2c116baea16a45e'
    original = subprocess.check_output(['git', 'show', manifest['checked_main'] + ':src/settings/GeneralPage.tsx'])
    assert original == baseline
    for span in manifest['reference_spans']:
        value = (HERE / span['path']).read_bytes()
        assert len(value) == span['bytes'] == span['utf8_half_open'][1] - span['utf8_half_open'][0]
        assert sha(value) == span['sha256']
    expected = baseline.decode()
    for old, new in [
        ('      <SendKeyRow settings={settings} save={save} />',
         '      <SendKeyRow settings={settings} save={save} notify={notify} />'),
        ('function SendKeyRow({ settings, save }: Props) {',
         'function SendKeyRow({ settings, save, notify }: Props) {'),
        ('    void chooseSendKey(next, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).catch((err) =>\n      console.warn("Failed to update message send key", err),\n    );',
         '    void chooseSendKey(next, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).then(\n      (ok) => { if (!ok) notify?.("error", "Failed to update message send key"); },\n      () => notify?.("error", "Failed to update message send key"),\n    );'),
    ]:
        assert expected.count(old) == 1
        expected = expected.replace(old, new, 1)
    assert (ROOT / 'src/settings/GeneralPage.tsx').read_text() == expected
    for path, digest in manifest['unchanged_boundaries'].items():
        assert sha((ROOT / path).read_bytes()) == digest, path
    view = (ROOT / 'src/settings/SettingsView.tsx').read_text()
    assert 'return <GeneralPage settings={settings} save={save} notify={notify} />;' in view
    print(json.dumps({'static_integrity': 'PASS', 'frozen_files': len(frozen),
                      'reference_spans': len(manifest['reference_spans']),
                      'checked_main': manifest['checked_main'],
                      'exact_row_only_patch': True, 'behavioral_tests': 'NOT_RUN',
                      'native_parity': 'UNVERIFIED'}))


if __name__ == '__main__':
    main()
