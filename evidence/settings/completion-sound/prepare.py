"""Prepare the catalog successor without changing existing frozen product inputs."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new, 1)


def sound_row(text):
    text = replace_once(text, 'import type { Settings, SoundType } from "./types";', 'import type { Settings } from "./types";')
    text = replace_once(text, '''      <Row label="Completion sound" help="Choose what plays when AI finishes working in a chat.">''', '''      <Row
        label="Completion sound"
        help="Choose what plays when AI finishes working in a chat."
        detail="Original recordings are not included. Playback uses a synthesized chime."
      >''')
    text = replace_once(text, '''          <Select<SoundType>
            label="Completion sound"
            width={190}
            value={g.sound_type}
            options={SOUND_OPTIONS}
            onChange={(v) => save(withField(settings, "general", "sound_type", v))}
          />''', '''          <select
            className="settings-select"
            aria-label="Completion sound"
            style={{ width: 190 }}
            value={g.sound_type}
            onChange={(event) => {
              const sound = SOUND_OPTIONS.find((option) => option.value === event.currentTarget.value);
              if (sound) void save(withField(settings, "general", "sound_type", sound.value));
            }}
          >
            {[...new Set(SOUND_OPTIONS.map((option) => option.group))].map((group) => {
              const options = SOUND_OPTIONS.filter((option) => option.group === group).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ));
              return group ? <optgroup key={group} label={group}>{options}</optgroup> : options;
            })}
          </select>''')
    return replace_once(text, 'disabled={g.sound_type === "none"}', 'disabled={g.sound_type === "disabled"}')


def product_candidate(path, raw):
    text = raw.decode()
    if path == 'src/settings/GeneralPage.tsx':
        return sound_row(text).encode()
    if path == 'src/settings/sound.ts':
        return (HERE / 'candidate/src/settings/sound.ts.txt').read_bytes()
    if path == 'src/settings/types.ts':
        text = replace_once(text, 'import type { PaletteId } from "../theme/palettes.ts";', 'import type { PaletteId } from "../theme/palettes.ts";\nimport type { SoundType } from "./sound";')
        return replace_once(text, 'export type SoundType = "default" | "none";', 'export type { SoundType } from "./sound";').encode()
    if path == 'src-tauri/src/settings/model.rs':
        old = '#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]\n#[serde(rename_all = "snake_case")]\npub enum SoundType {\n    #[default]\n    Default,\n    None,\n}\n'
        return replace_once(text, old, (HERE / 'sound-type.rs.txt').read_text()).encode()
    if path == 'src-tauri/src/settings/tests.rs':
        before = '#[test]\nfn explicit_themes_keep_their_value_across_load_save_and_reload() {'
        return replace_once(text, before, (HERE / 'rust-tests.rs.txt').read_text() + '\n' + before).encode()
    raise AssertionError(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--closure', type=Path, required=True)
    parser.add_argument('--renderer', type=Path, required=True)
    args = parser.parse_args()
    assert sha(args.closure.read_bytes()) == 'f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084'
    with tarfile.open(args.closure) as archive:
        index = archive.extractfile('.rea-work/retained-reference/index-BGEQ8YjU.js').read()
    renderer = args.renderer.read_bytes()
    assert len(index) == 3493297 and sha(index) == 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'
    assert len(renderer) == 11600457 and sha(renderer) == '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde'
    records = []

    def retain(name, asset, raw, start, end):
        content = raw[start:end]
        path = Path('reference') / (name + '.txt')
        (HERE / path).parent.mkdir(exist_ok=True)
        (HERE / path).write_bytes(content)
        records.append({'path': str(path), 'asset': asset, 'utf8_half_open': [start, end], 'sha256': sha(content), 'bytes': len(content)})

    def function(name, asset, raw):
        match = re.search(rb'(?:async )?function ' + name.encode() + rb'\(', raw)
        assert match, name
        following = re.search(rb'(?:async )?function [\w$]+\(', raw[match.end():])
        retain(name, asset, raw, match.start(), match.end() + following.start())

    for name in ['u5t', 'Gzt', 'Zwt', 'p9', 'Eue', 'E8t', 'eSt']:
        function(name, 'index', index)
    function('rga', 'renderer', renderer)
    start = index.index(b'bue="disabled"')
    end = index.index(b'];function p9(', start) + 1
    retain('catalog', 'index', index, start, end)
    start = renderer.index(b'ir({tab:"general",settingKey:"sound_type"')
    end = renderer.index(b'ir({', start + 5)
    retain('registration', 'renderer', renderer, start, end - 1)
    for token, asset, raw in [
        (b'qz as z9r', 'renderer', renderer), (b'qH as G9r', 'renderer', renderer),
        (b'qI as q9r', 'renderer', renderer), (b'qJ as K9r', 'renderer', renderer),
        (b'qK as Y9r', 'renderer', renderer), (b'nga=z9r()', 'renderer', renderer),
        (b'E8t as qz', 'index', index), (b'u5t as qH', 'index', index),
        (b'Gzt as qI', 'index', index), (b'Zwt as qJ', 'index', index), (b'Eue as qK', 'index', index),
    ]:
        start = raw.index(token)
        retain('binding-' + str(len(records)), asset, raw, start, start + len(token))

    checked_main = subprocess.check_output(['git', 'rev-parse', 'origin/main'], cwd=ROOT, text=True).strip()
    paths = ['src/settings/GeneralPage.tsx', 'src/settings/sound.ts', 'src/settings/types.ts',
             'src-tauri/src/settings/model.rs', 'src-tauri/src/settings/tests.rs']
    baselines = {}
    candidates = {}
    for path in paths:
        raw = subprocess.check_output(['git', 'show', checked_main + ':' + path], cwd=ROOT)
        if path in paths[:2]:
            baseline_path = HERE / 'baseline' / (path + '.txt')
            baseline_path.parent.mkdir(parents=True, exist_ok=True)
            baseline_path.write_bytes(raw)
        baselines[path] = raw
        candidates[path] = product_candidate(path, raw)
    page = paths[0]
    candidate_page = HERE / 'candidate' / (page + '.txt')
    candidate_page.parent.mkdir(parents=True, exist_ok=True)
    candidate_page.write_bytes(candidates[page])
    current = (ROOT / page).read_bytes()
    send_before = subprocess.check_output(['git', 'show', '07f2494f:' + page], cwd=ROOT)
    assert current == send_before
    follow = (ROOT / 'evidence/settings/follow-up-pending/composition/candidate/GeneralPage.tsx.txt').read_bytes()
    current_successor = sound_row(current.decode()).encode()
    prior_namespace = {'__file__': str(ROOT / 'evidence/settings/follow-up-pending/composition/prepare.py'), '__name__': 'prior_composition'}
    exec(compile((ROOT / 'evidence/settings/follow-up-pending/composition/prepare.py').read_text(), prior_namespace['__file__'], 'exec'), prior_namespace)
    integrated = sound_row(follow.decode()).encode()
    assert prior_namespace['send_key'](candidates[page].decode()).encode() == current_successor
    assert prior_namespace['follow_up'](current_successor.decode()).encode() == integrated
    integrated_path = HERE / 'integrated/GeneralPage.tsx.txt'
    integrated_path.parent.mkdir(exist_ok=True)
    integrated_path.write_bytes(integrated)
    sound_delta = list(difflib.SequenceMatcher(None, baselines[page].splitlines(), candidates[page].splitlines()).get_opcodes())
    adjacent_delta = list(difflib.SequenceMatcher(None, baselines[page].splitlines(), follow.splitlines()).get_opcodes())
    for tag, a, b, _, _ in sound_delta:
        if tag == 'equal':
            continue
        for other, c, d, _, _ in adjacent_delta:
            if other != 'equal':
                assert not (max(a, c) < min(b, d) or a == b and c <= a < d or c == d and a <= c < b)
    patch = ''.join(''.join(difflib.unified_diff(baselines[path].decode().splitlines(keepends=True), candidates[path].decode().splitlines(keepends=True), fromfile='a/' + path, tofile='b/' + path)) for path in paths)
    (HERE / 'candidate.patch').write_text(''.join('\n' if line == ' \n' else line for line in patch.splitlines(keepends=True)))
    integrated_patch = ''.join(difflib.unified_diff(follow.decode().splitlines(keepends=True), integrated.decode().splitlines(keepends=True), fromfile='a/' + page, tofile='b/' + page))
    (HERE / 'integrated.patch').write_text(''.join('\n' if line == ' \n' else line for line in integrated_patch.splitlines(keepends=True)))
    frozen_binding = ROOT / 'evidence/settings/follow-up-integration/binding.json'
    prior = json.loads(frozen_binding.read_text())
    protected = {path: sha((ROOT / path).read_bytes()) for path in prior['immutable_files']}
    assert protected == prior['immutable_files']
    record = {
        'owner': 'Conductor Rebuild / SAME49', 'status': 'SOURCE_ONLY_CANDIDATE_NOT_APPLIED',
        'checked_main': checked_main, 'runtime_grant': None,
        'reference': {'application': 'Conductor 0.87.6', 'rea_receipt': 'ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2',
                      'limits': 'Historical REA-extracted source only. No original JavaScript executed, installed-asset refresh, audio listening or native parity observation. Original semantic renderer analysis exhausted heap.'},
        'reference_spans': records,
        'baseline_sha256': {path: sha(raw) for path, raw in baselines.items()},
        'candidate_sha256': {path: sha(raw) for path, raw in candidates.items()},
        'composition': {'send_key_checkpoint': '07f2494f', 'follow_up_checkpoint': '5d4e0c16', 'frozen_general_page': sha(current), 'follow_up_general_page': sha(follow), 'current_successor_general_page': sha(current_successor), 'integrated_general_page': sha(integrated), 'changed_intervals_disjoint': True, 'both_application_orders_equal': True},
        'scope': 'Completion sound catalog, grouped row, frontend type and Rust serde known-ID persistence only. No agent completion dispatch, notification permission, shared Select, SendKey, Follow-up, native process or original MP3 copying.',
        'audio_gap': 'All audible choices retain OpenConductor synthesized-chime fallback. This is explicitly disclosed in the row. Original recordings, logos, loudness, timing and fidelity are not recreated or claimed.',
        'asset_boundary': 'No tracked audio assets found in public/, src/ or src-tauri/ at checked_main. This is not a global asset-availability claim.',
        'protected_binding': {'path': str(frozen_binding.relative_to(ROOT)), 'sha256': sha(frozen_binding.read_bytes()), 'files': len(protected)},
        'validation': {'source': 'PENDING', 'product_tests': 'NOT_RUN', 'rust_tests': 'NOT_RUN', 'typecheck': 'NOT_RUN', 'native_parity': 'UNVERIFIED'},
    }
    (HERE / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'candidate_files': len(paths), 'reference_spans': len(records), 'composition': 'DISJOINT', 'protected': len(protected), 'behavior': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
