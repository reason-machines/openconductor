"""Capture retained Settings source without evaluating Conductor JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--renderer', required=True, type=Path)
    parser.add_argument('--closure', required=True, type=Path)
    parser.add_argument('--main', required=True)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    renderer = args.renderer.read_bytes()
    assert sha(renderer) == '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde'
    assert sha(args.closure.read_bytes()) == 'f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084'
    with tarfile.open(args.closure) as archive:
        index = archive.extractfile('.rea-work/retained-reference/index-BGEQ8YjU.js').read()
        provenance = json.load(archive.extractfile('.rea-work/dxe-source-closure/packet.json'))
    assert sha(index) == 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'
    blobs = {'renderer': renderer, 'index': index}
    spans = []
    args.out.mkdir(parents=True, exist_ok=True)

    def retain(name, asset, start, end):
        value = blobs[asset][start:end]
        path = Path('reference') / (name + '.txt')
        (args.out / path).parent.mkdir(parents=True, exist_ok=True)
        (args.out / path).write_bytes(value)
        spans.append({'path': str(path), 'asset': asset, 'utf8_half_open': [start, end], 'bytes': len(value), 'sha256': sha(value)})

    for name, asset, end_marker in [
        ('Z5e', 'renderer', b'function bho('),
        ('bga', 'renderer', b'const _Ot='),
        ('RQt', 'index', b'async function HUt('),
        ('BUt', 'index', b'function WUt('),
    ]:
        start = blobs[asset].index(b'function ' + name.encode() + b'(')
        retain(name, asset, start, blobs[asset].index(end_marker, start))
    start = renderer.index(b'ir({tab:"general",settingKey:"message_send_key"')
    retain('registration', 'renderer', start, renderer.index(b',ir(', start))
    for name, asset, literal in [
        ('import-save', 'renderer', b'qF as xAn'),
        ('export-save', 'index', b'RQt as qF'),
    ]:
        start = blobs[asset].index(literal)
        retain(name, asset, start, start + len(literal))
    baseline = subprocess.check_output(['git', 'show', args.main + ':src/settings/GeneralPage.tsx'])
    (args.out / 'baseline').mkdir(exist_ok=True)
    (args.out / 'baseline/GeneralPage.tsx').write_bytes(baseline)
    manifest = {
        'owner': 'Conductor Rebuild / SAME49',
        'scope': 'GeneralPage.SendKeyRow USER save-failure notification caller only. No shared Select, keybinding provider, override store, persistence service, or chat-submit changes.',
        'checked_main': args.main,
        'baseline_sha256': sha(baseline),
        'retained_reference': {
            'application': 'Conductor 0.87.6',
            'rea_receipt': provenance['rea_receipt'],
            'assets': {name: {'bytes': len(value), 'sha256': sha(value)} for name, value in blobs.items()},
            'limits': provenance['rea_limit'] + ' Current installed version, renderer equality, and native behavior remain unverified.',
        },
        'reference_spans': spans,
        'unchanged_boundaries': {path: sha(subprocess.check_output(['git', 'show', args.main + ':' + path])) for path in [
            'src/settings/SettingsView.tsx', 'src/settings/composerSettings.ts',
            'src/settings/useSettingsOverrideStore.ts', 'src/settings/keybindingOverrides.ts',
            'src/settings/appPrefs.ts', 'src/settings/controls.tsx', 'src/keybindings/overrides.ts',
        ]},
        'fixture_boundary': 'Synthetic registry registration, memo cache, elements, notification callback, keybinding preset and persistence boundaries. RQt/BUt and original registration callbacks execute only when admitted. Z5e event relay retained for source inspection, not full shared Select execution.',
        'status': 'SOURCE_ONLY. Product, reference, typecheck, screenshot and native checks NOT_RUN pending serialized ACC admission.',
    }
    (args.out / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n')
    files = [path for path in args.out.rglob('*') if path.is_file() and path.name != 'frozen.sha256']
    files += [Path('src/settings/GeneralPage.tsx'), Path('src/settings/sendKeySaveFeedback.test.ts')]
    (args.out / 'frozen.sha256').write_text(''.join(sha(path.read_bytes()) + '  ' + str(path) + '\n' for path in sorted(files)))
    print(json.dumps({'retained_assets_verified': 2, 'spans': len(spans), 'baseline_sha256': sha(baseline), 'behavioral_tests': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
