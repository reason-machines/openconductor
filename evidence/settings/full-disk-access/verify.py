"""Static checks only. Never import or execute the application or retained target code."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    checks = []
    provenance = json.loads((HERE / 'provenance.json').read_text())
    reference = json.loads((HERE / 'reference/source.json').read_text())
    assert digest(HERE / 'fixture.json') == '1480a537fd6b946ba99b5e3a0e30a9f7ccee94cd619d78095c4897390f6e68af'
    assert len(json.loads((HERE / 'fixture.json').read_text())) == 7
    checks.append('original seven-case fixture bytes')
    for span in reference['reference_spans']:
        path = HERE / span['path']
        assert digest(path) == span['sha256'], span['path']
        assert len(path.read_bytes()) == span['bytes']
        assert span['utf8_half_open'][1] - span['utf8_half_open'][0] == span['bytes']
        checks.append(span['path'])
    assert digest(HERE / 'baseline/GeneralPage.tsx') == provenance['baseline_file_sha256']
    checks.append('fresh-main baseline snapshot identity')
    for path, expected in provenance['frozen_files'].items():
        assert digest(ROOT / path) == expected, path
        checks.append('unchanged ' + path)
    baseline = (HERE / 'baseline/GeneralPage.tsx').read_text()
    page = (ROOT / 'src/settings/GeneralPage.tsx').read_text()
    backend = (ROOT / 'src/backend.ts').read_text()
    assert 'checkFullDiskAccess' not in baseline and '>Granted<' not in baseline
    assert 'button="Open System Settings"' in baseline
    checks.append('source baseline has missing query/presentation, not a compile failure')
    assert re.search(r'export async function checkFullDiskAccess\(\): Promise<boolean>\s*\{\s*return invoke<boolean>\("check_full_disk_access"\);\s*\}', backend)
    checks.append('native bridge invokes exact command without arguments')
    assert 'fullDiskAccess === true &&' in page and '>Granted<' in page
    assert 'const fullDiskAccess = useFullDiskAccessStatus();' in page
    assert 'next = await checkFullDiskAccess();' in page
    checks.append('reachable strict-true Granted branch')
    assert 'if (next === false) timer = window.setTimeout(() => void refresh(), 5000);' in page
    assert 'window.addEventListener("focus", onFocus);' in page
    assert 'window.removeEventListener("focus", onFocus);' in page
    assert 'window.clearTimeout(timer);' in page
    assert 'if (!active || current !== revision) return;' in page
    checks.append('false-only poll and focus/cleanup source')
    assert 'console.error("check_full_disk_access failed:", error);\n        next = true;' in page
    checks.append('source-backed logged true fallback')
    start, stop = '      <Row label="Agent notifications"', '      <PrefSwitchRow settings={settings} save={save} pref="mention_notifications_enabled"'
    def notification_block(text):
        return text[text.index(start):text.index(stop)]
    assert notification_block(page) == notification_block(baseline)
    checks.append('notification product block unchanged')
    message = "Couldn't open System Settings. Go to Privacy & Security > Full Disk Access to grant it manually."
    assert message in page
    view = (ROOT / 'src/settings/SettingsView.tsx').read_text()
    assert 'return <GeneralPage settings={settings} save={save} notify={notify} />;' in view
    assert 'notify={notify}\n              onOpenReasonSettings=' in view
    checks.append('opener-error message has production notification relay')
    replay = (HERE / 'replay.cjs').read_text()
    assert 'addEventListener(name, callback)' in replay
    assert 'c.id === \'poll-after-not-granted\' ? app.poll() : app.focus()' in replay
    assert 'assert.equal(app.calls.queries, 2' in replay
    assert 'src/settings/GeneralPage.tsx' in replay
    checks.append('new replay supplies browser events/timers and exercises real page')
    print(json.dumps({'static_checks': 'PASS', 'count': len(checks), 'checks': checks,
                      'mounted_local_replay': 'NOT_RUN', 'native_probe': 'NOT_RUN',
                      'visual_parity': 'NOT_RUN'}, indent=2))


if __name__ == '__main__':
    verify()
