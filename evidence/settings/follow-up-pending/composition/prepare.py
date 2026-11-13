"""Retain mutation settlement and compose a candidate without changing product files."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PARENT = HERE.parent


def sha(value):
    return hashlib.sha256(value).hexdigest()


def git_blob(ref, path):
    return subprocess.check_output(['git', 'show', ref + ':' + path], cwd=ROOT)


def replace_once(value, old, new):
    assert value.count(old) == 1, old
    return value.replace(old, new, 1)


def follow_up(value):
    for old, new in [
        ('  const [syncOpen, setSyncOpen] = useState(false);',
         '  const [syncOpen, setSyncOpen] = useState(false);\n  const [followUpPending, setFollowUpPending] = useState(false);'),
        ('          label="Follow-up behavior"\n          value={followUp}',
         '          label="Follow-up behavior"\n          disabled={followUpPending}\n          value={followUp}'),
        ('          onChange={(v) =>\n            // Open chats re-read Follow-up behavior on SETTINGS_CHANGED (useFollowUpMode).\n            void Promise.resolve(save(withEnumPref(settings, "default_message_send_mode", v))).then((ok) => {\n              if (ok !== false) window.dispatchEvent(new Event(SETTINGS_CHANGED));\n            })\n          }',
         '          onChange={async (v) => {\n            setFollowUpPending(true);\n            try {\n              const ok = await save(withEnumPref(settings, "default_message_send_mode", v));\n              if (ok !== false) window.dispatchEvent(new Event(SETTINGS_CHANGED));\n            } finally {\n              setFollowUpPending(false);\n            }\n          }}'),
    ]:
        value = replace_once(value, old, new)
    return value


def send_key(value):
    for old, new in [
        ('      <SendKeyRow settings={settings} save={save} />',
         '      <SendKeyRow settings={settings} save={save} notify={notify} />'),
        ('function SendKeyRow({ settings, save }: Props) {',
         'function SendKeyRow({ settings, save, notify }: Props) {'),
        ('    void chooseSendKey(next, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).catch((err) =>\n      console.warn("Failed to update message send key", err),\n    );',
         '    void chooseSendKey(next, store.updateMany, (m) => setAppPref({ key: "message_send_key", value: m })).then(\n      (ok) => { if (!ok) notify?.("error", "Failed to update message send key"); },\n      () => notify?.("error", "Failed to update message send key"),\n    );'),
    ]:
        value = replace_once(value, old, new)
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--closure', type=Path, required=True)
    args = parser.parse_args()
    original = json.loads((PARENT / 'source.json').read_text())
    assert sha(args.closure.read_bytes()) == 'f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084'
    with tarfile.open(args.closure) as archive:
        index = archive.extractfile('.rea-work/retained-reference/index-BGEQ8YjU.js').read()
    assert len(index) == 3493297
    assert sha(index) == 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'
    spans = []

    def retain(name, start, end):
        a = index.index(start)
        b = index.index(end, a + len(start))
        raw = index[a:b]
        path = Path('reference') / (name + '.txt')
        (HERE / path).parent.mkdir(parents=True, exist_ok=True)
        (HERE / path).write_bytes(raw)
        spans.append({'path': str(path), 'asset': 'index', 'utf8_half_open': [a, b], 'bytes': len(raw), 'sha256': sha(raw)})

    for name, start, end in [
        ('observer', b'Zqe=class extends mh', b',tP={exports:{}}'),
        ('mutation', b'jqe=class extends Bte', b'function Ute('),
        ('initial-state', b'function Ute(', b'var Hte='),
        ('mutation-cache', b'Hte=class extends mh', b'function lS('),
        ('retryer', b'function $te(', b'var Uqe='),
        ('promise', b'function CO(', b'function Wqe('),
        ('retry-environment', b'function Wqe(', b'var Nte='),
        ('cancellation', b'var Nte=', b'function $te('),
        ('delay', b'function Dqe(', b'function IO('),
        ('writer', b'function gee(', b'function Szt('),
        ('client-configuration', b'const Y7e=new Hte(', b',Ma='),
        ('query-client', b'Vqe=class', b',f$=class'),
        ('update-setting', b'async updateSetting(e,s,n,r)', b'async deleteSetting('),
    ]:
        retain(name, start, end)
    binding_end = index.index(b'Ie=t,ee=t}') + len(b'Ie=t,ee=t}')
    binding_start = index.rindex(b'function ', 0, binding_end)
    binding_raw = index[binding_start:binding_end]
    binding_path = Path('reference/service-binding.txt')
    (HERE / binding_path).write_bytes(binding_raw)
    spans.append({'path': str(binding_path), 'asset': 'index', 'utf8_half_open': [binding_start, binding_end], 'bytes': len(binding_raw), 'sha256': sha(binding_raw)})

    path = 'src/settings/GeneralPage.tsx'
    main_sha = subprocess.check_output(['git', 'rev-parse', 'origin/main'], cwd=ROOT, text=True).strip()
    baseline = git_blob(main_sha, path)
    assert baseline == (PARENT / 'baseline/GeneralPage.tsx.txt').read_bytes()
    before = git_blob('a0bde8e4', path)
    assert before == git_blob('07f2494f', path) == send_key(baseline.decode()).encode()
    assert (ROOT / path).read_bytes() == before
    candidate = follow_up(before.decode())
    independent = follow_up(baseline.decode())
    assert candidate == send_key(independent)
    # Exact changed intervals, rather than diff context, must not overlap.
    def intervals(after):
        return [(a, b) for tag, a, b, _, _ in difflib.SequenceMatcher(None, baseline.decode().splitlines(), after.splitlines()).get_opcodes() if tag != 'equal']
    follow_intervals = intervals(independent)
    send_intervals = intervals(before.decode())
    for a, b in follow_intervals:
        for c, d in send_intervals:
            assert not (max(a, c) < min(b, d) or a == b and c <= a < d or c == d and a <= c < b), (a, b, c, d)
    (HERE / 'candidate').mkdir(exist_ok=True)
    (HERE / 'candidate/GeneralPage.tsx.txt').write_text(candidate)
    (HERE / 'candidate.patch').write_text(''.join(difflib.unified_diff(before.decode().splitlines(keepends=True), candidate.splitlines(keepends=True), fromfile='a/' + path, tofile='b/' + path)))
    (HERE / 'independent.patch').write_text(''.join(difflib.unified_diff(baseline.decode().splitlines(keepends=True), independent.splitlines(keepends=True), fromfile='a/' + path, tofile='b/' + path)))
    protected = {path: sha((ROOT / path).read_bytes()) for path in original['protected_product']}
    assert protected == original['protected_product']
    record = {
        'owner': 'Conductor Rebuild / SAME49',
        'checked_main': main_sha,
        'checkpoint_preserved': '47b70f9d',
        'integration_base': 'a0bde8e4',
        'send_key_checkpoint': '07f2494f',
        'ledger_disposition_message': '2e068345-1d23-4150-bf23-966889c45ed9',
        'ledger_scope': 'No other owner recorded. Existing SAME49 lane; no new approval gate or runtime admission.',
        'retained_reference': original['retained_reference'],
        'reference_spans': spans,
        'composition': {
            'base_sha256': sha(baseline), 'send_key_sha256': sha(before),
            'candidate_sha256': sha(candidate.encode()),
            'follow_up_base_line_intervals_half_open_zero_index': follow_intervals,
            'send_key_base_line_intervals_half_open_zero_index': send_intervals,
            'both_orders_equal': True,
        },
        'protected_product': protected,
        'scope': 'One GeneralPage local pending boolean and Follow-up Select disabled/try-finally settlement. Candidate file and patches only. No product file applied.',
        'validation': 'STATIC_ONLY. No JavaScript, tests, typecheck, install or native process run. Tests authored, not executed. Existing ACC position unchanged.',
        'native_parity': 'UNVERIFIED',
    }
    (HERE / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
    files = sorted(path for path in HERE.rglob('*') if path.is_file() and path.name != 'frozen.sha256' and '__pycache__' not in path.parts)
    (HERE / 'frozen.sha256').write_text(''.join(sha(path.read_bytes()) + '  ' + str(path.relative_to(HERE)) + '\n' for path in files))
    print(json.dumps({'retained_lifecycle_spans': len(spans), 'composition_both_orders': 'PASS', 'changed_intervals_disjoint': 'PASS', 'protected_product': 'UNCHANGED', 'checked_main': main_sha, 'behavioral_tests': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
