"""Source-only verifier regressions; never execute product or reference JavaScript."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('verify_baseline_root', HERE / 'verify_baseline_root.py')


def load_verifier():
    module = importlib.util.module_from_spec(SPEC)
    with contextlib.redirect_stdout(io.StringIO()):
        SPEC.loader.exec_module(module)
    return module


class BaselineRootVerifierTests(unittest.TestCase):
    def setUp(self):
        self.verifier = load_verifier()
        self.sources = {'src/main.tsx': b'export {};'}
        self.policy = {
            'sources': {'src/main.tsx': hashlib.sha256(self.sources['src/main.tsx']).hexdigest()},
            'decorative_tsx': [], 'overrides': [],
        }

    def resolve(self, host=()):
        return self.verifier.build_resolver_files(
            self.policy, host, set(self.sources), self.sources.__getitem__)

    def test_only_three_known_absent_decorative_classifiers_are_optional(self):
        self.assertEqual(self.verifier.ABSENT_DECORATIVE_CLASSIFIERS, {
            'src/features/chat/ComposerAttachmentChip',
            'src/features/chat/LinkIssueDialog',
            'src/features/files/WorkspaceFileView',
        })
        self.policy['decorative_tsx'] = [*self.verifier.ABSENT_DECORATIVE_CLASSIFIERS,
                                         'src/features/chat/ComposerAttachmentChip']
        self.assertEqual(self.resolve(), {})

    def test_unknown_absent_decorative_classifier_fails(self):
        self.policy['decorative_tsx'] = ['src/MissingDecoration']
        with self.assertRaisesRegex(ValueError, 'Missing decorative historical source target: src/MissingDecoration'):
            self.resolve()

    def test_absent_classifier_is_required_when_imported(self):
        for target in self.verifier.ABSENT_DECORATIVE_CLASSIFIERS:
            with self.subTest(target=target):
                self.policy['decorative_tsx'] = [target]
                self.sources['src/main.tsx'] = f'import "./{target[4:]}";'.encode()
                with self.assertRaisesRegex(ValueError, f'Missing required historical source target: {target}'):
                    self.resolve()

    def test_absent_classifier_is_required_when_overridden(self):
        target = 'src/features/chat/ComposerAttachmentChip'
        self.policy['decorative_tsx'] = [target]
        self.policy['overrides'] = [target]
        with self.assertRaisesRegex(ValueError, f'Missing required historical source target: {target}'):
            self.resolve()

    def test_absent_classifier_is_required_when_host_loaded(self):
        target = 'src/features/chat/LinkIssueDialog'
        self.policy['decorative_tsx'] = [target]
        with self.assertRaisesRegex(ValueError, f'Missing required historical source target: {target}'):
            self.resolve([target])

    def test_missing_pinned_source_fails_clearly(self):
        del self.sources['src/main.tsx']
        with self.assertRaisesRegex(ValueError, 'Missing required historical source target: src/main.tsx'):
            self.resolve()

    def test_imports_of_host_bootstrap_are_required(self):
        self.sources['src/host.ts'] = b'export { value } from "./MissingDependency";'
        with self.assertRaisesRegex(ValueError, 'Missing required historical source target: src/MissingDependency'):
            self.resolve(['src/host.ts'])

    def test_supported_resolution_forms_and_required_controls(self):
        for key, path in [('src/direct.css', 'src/direct.css'), ('src/plain', 'src/plain.ts'),
                          ('src/view', 'src/view.tsx'), ('src/module', 'src/module/index.ts')]:
            with self.subTest(path=path):
                self.sources[path] = b'export {};'
                self.policy['overrides'] = [key]
                result = self.resolve()
                self.assertEqual(result, {path: hashlib.sha256(self.sources[path]).hexdigest()})
                del self.sources[path]

    def test_known_classifier_resolves_normally_when_source_exists(self):
        target = 'src/features/chat/ComposerAttachmentChip'
        self.policy['decorative_tsx'] = [target]
        self.sources[target + '.tsx'] = b'export {};'
        self.assertEqual(self.resolve(), {
            target + '.tsx': hashlib.sha256(self.sources[target + '.tsx']).hexdigest()})

    def test_real_historical_required_host_cannot_be_omitted(self):
        policy = json.loads((self.verifier.FIXTURE / 'static-import-closure.json').read_text())
        entries = set(subprocess.check_output(
            ['git', 'ls-tree', '-r', '--name-only', policy['main'], '--', 'src'],
            cwd=self.verifier.REPO, text=True).splitlines())
        target = 'src/features/pr/prSettings.ts'
        entries.remove(target)
        with self.assertRaisesRegex(ValueError, f'Missing required historical source target: {target}'):
            self.verifier.build_resolver_files(policy, [target], entries,
                lambda path: subprocess.check_output(
                    ['git', 'show', policy['main'] + ':' + path], cwd=self.verifier.REPO))

    def test_cli_checks_existing_archive_and_preserves_frozen_bytes(self):
        fixture = self.verifier.FIXTURE
        before = {path.name: path.read_bytes() for path in fixture.iterdir() if path.is_file()}
        result = subprocess.run(['python3', str(HERE / 'verify_baseline_root.py')],
                                cwd=self.verifier.REPO, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual((receipt['original_pins'], receipt['resolver_leaves'], receipt['archived_files'],
                          receipt['frozen_host_entrypoints'], receipt['frozen_fixture_files']),
                         (132, 82, 214, 8, 5))
        self.assertEqual(receipt['javascript_and_behavior'], 'NOT_RUN')
        self.assertEqual(before, {path.name: path.read_bytes() for path in fixture.iterdir() if path.is_file()})


if __name__ == '__main__':
    unittest.main()
