from pathlib import Path
import importlib.util
import json
import shutil
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("prefix_replay", HERE / "replay.py")
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class BaselineAssemblyTests(unittest.TestCase):
    def test_baseline_keeps_all_original_hashes_when_candidate_theme_changes(self):
        manifest = json.loads((HERE / "source.json").read_text())
        frozen_types = (HERE / "baseline/types.ts").read_text()
        for theme in ["light", "dark", "system"]:
            with self.subTest(theme=theme), tempfile.TemporaryDirectory(prefix="prefix-assembly-") as temp:
                root = Path(temp) / "input"
                for path in manifest["baseline_sources"]:
                    destination = root / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(replay.ROOT / path, destination)
                candidate_types = frozen_types.replace('general: { theme: "system",', f'general: {{ theme: "{theme}",')
                (root / "src/settings/types.ts").write_text(candidate_types)
                for phase in ["baseline", "candidate"]:
                    tree = Path(temp) / phase
                    with patch.object(replay, "ROOT", root):
                        replay.prepare_sources(tree, phase, manifest)
                    for path, expected in manifest["baseline_sources"].items():
                        if phase == "baseline":
                            self.assertEqual(replay.digest(tree / path), expected, path)
                        else:
                            self.assertEqual((tree / path).read_bytes(), (root / path).read_bytes(), path)

    def test_each_live_source_can_change_without_contaminating_baseline(self):
        manifest = json.loads((HERE / "source.json").read_text())
        frozen_types = (HERE / "baseline/types.ts").read_text()
        for changed_path in manifest["baseline_sources"]:
            for theme in ["light", "dark", "system"]:
                with self.subTest(source=changed_path, theme=theme), tempfile.TemporaryDirectory(prefix="prefix-assembly-") as temp:
                    root = Path(temp) / "input"
                    for path in manifest["baseline_sources"]:
                        destination = root / path
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(replay.ROOT / path, destination)
                    candidate_types = frozen_types.replace('general: { theme: "system",', f'general: {{ theme: "{theme}",')
                    (root / "src/settings/types.ts").write_text(candidate_types)
                    changed = root / changed_path
                    changed.write_bytes(changed.read_bytes() + b"\n// Unrelated live candidate source change.\n")
                    with patch.object(replay, "ROOT", root):
                        candidate = Path(temp) / "candidate"
                        replay.prepare_sources(candidate, "candidate", manifest)
                        for path in manifest["baseline_sources"]:
                            self.assertEqual((candidate / path).read_bytes(), (root / path).read_bytes(), path)
                        baseline = Path(temp) / "baseline"
                        replay.prepare_sources(baseline, "baseline", manifest)
                        for path, expected in manifest["baseline_sources"].items():
                            self.assertEqual(replay.digest(baseline / path), expected, path)

    def test_frozen_types_remain_hash_pinned(self):
        manifest = json.loads((HERE / "source.json").read_text())
        self.assertEqual(replay.digest(HERE / "baseline/types.ts"), manifest["baseline_sources"]["src/settings/types.ts"])


if __name__ == "__main__":
    unittest.main()
