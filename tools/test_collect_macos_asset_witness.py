import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from collect_macos_asset_witness import collect


class WitnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source = self.put("src/example.tsx", b"export const hint = 'Reveal key';\n")
        self.git("init", "-q")
        self.git("add", "src")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture")
        self.commit = self.git("rev-parse", "HEAD").decode().strip()
        self.dist_js = self.put("dist/assets/index.js", b"original JS bytes\0")
        self.dist_map = self.put("dist/assets/index.js.map", b'{"sources":["src/example.tsx"]}')
        self.generated = "src-tauri/target/debug/build/app-a/out/tauri-codegen-assets"
        self.cache_js = self.put(f"{self.generated}/{'a' * 64}.js", b"original compressed JS bytes\0")
        self.cache_map = self.put(f"{self.generated}/{'b' * 64}.map", b"original compressed map bytes\0")
        self.app = self.root / "src-tauri/target/debug/bundle/macos/OpenConductor.app"
        self.exe = self.put(str(self.app.relative_to(self.root)) + "/Contents/MacOS/OpenConductor", b"synthetic executable, never launched\0")
        self.plist = self.put(str(self.app.relative_to(self.root)) + "/Contents/Info.plist", plistlib.dumps({
            "CFBundleIdentifier": "com.reasonmachines.openconductor", "CFBundleExecutable": "OpenConductor"}))
        self.contract = self.put("bundle-check.json", json.dumps({
            "ok": True, "checks": [{"check": "codesign-verify", "ok": True}]}).encode())
        self.archive = self.root / "OpenConductor-debug.zip"
        self.make_archive()
        self.output = self.root / "frontend-codegen-witness.zip"

    def put(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], stderr=subprocess.DEVNULL)

    def make_archive(self, extra=None):
        with zipfile.ZipFile(self.archive, "w") as z:
            for path in (self.exe, self.plist):
                z.write(path, "OpenConductor.app/" + path.relative_to(self.app).as_posix())
            if extra:
                z.writestr(*extra)

    def run_collect(self, commit=None, profile="debug"):
        return collect(self.root, commit or self.commit, profile, self.archive, self.contract, self.output)

    def test_retains_exact_original_assets_and_signed_bundle_binding(self):
        result = self.run_collect()
        self.assertEqual(result["native_acceptance"], "NOT_RUN")
        self.assertEqual(result["source_commit"], self.commit)
        with zipfile.ZipFile(self.output) as z:
            manifest = json.loads(z.read("witness-manifest.json"))
            self.assertEqual(z.read("dist/assets/index.js"), self.dist_js.read_bytes())
            self.assertEqual(z.read("dist/assets/index.js.map"), self.dist_map.read_bytes())
            self.assertEqual(z.read(f"generated/0/{self.cache_js.name}"), self.cache_js.read_bytes())
            self.assertEqual(z.read(f"generated/0/{self.cache_map.name}"), self.cache_map.read_bytes())
            self.assertEqual(len(manifest["files"]), 4)
            for row in manifest["files"]:
                self.assertEqual(hashlib.sha256(z.read(row["archive_path"])).hexdigest(), row["sha256"])
            binding = manifest["bundle"]
            self.assertEqual(binding["executable"]["sha256"], hashlib.sha256(self.exe.read_bytes()).hexdigest())
            self.assertEqual(binding["archive"]["sha256"], hashlib.sha256(self.archive.read_bytes()).hexdigest())
            self.assertEqual(manifest["source_files"][0]["git_blob"], self.git("rev-parse", "HEAD:src/example.tsx").decode().strip())
            self.assertEqual(z.testzip(), None)

    def test_retains_non_js_assets_and_multiple_original_cache_directories(self):
        self.put("dist/icon.svg", b"<svg/>")
        other = self.generated.replace("app-a", "app-b")
        self.put(f"{other}/{'c' * 64}.js", b"second original JS")
        self.put(f"{other}/{'d' * 64}.map", b"second original map")
        self.run_collect()
        with zipfile.ZipFile(self.output) as z:
            self.assertEqual(z.read("dist/icon.svg"), b"<svg/>")
            self.assertEqual(z.read(f"generated/1/{'c' * 64}.js"), b"second original JS")

    def test_rejects_wrong_cut(self):
        with self.assertRaisesRegex(ValueError, "HEAD differs"):
            self.run_collect("0" * 40)

    def test_rejects_dirty_source(self):
        self.source.write_text("changed product")
        with self.assertRaisesRegex(ValueError, "source bytes differ"):
            self.run_collect()

    def test_succeeds_without_codegen_tauri_v2(self):
        # Tauri v2 does not create tauri-codegen-assets directories.  The
        # collector must succeed with only the dist directory in that case.
        self.cache_js.unlink()
        self.cache_map.unlink()
        self.cache_js.parent.rmdir()
        result = self.run_collect()
        self.assertEqual(result["original_files"], 2)  # dist js + map only

    def test_rejects_missing_maps(self):
        self.dist_map.unlink()
        with self.assertRaisesRegex(ValueError, "source maps required"):
            self.run_collect()

    def test_rejects_symlink_asset(self):
        self.cache_js.unlink()
        self.cache_js.symlink_to(self.dist_js)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.run_collect()

    def test_rejects_symlink_directory(self):
        self.dist_js.parent.rename(self.root / "original-assets")
        self.dist_js.parent.symlink_to(self.root / "original-assets", target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.run_collect()

    def test_rejects_zip_executable_mismatch(self):
        self.exe.write_bytes(b"changed executable after archive")
        with self.assertRaisesRegex(ValueError, "member size differs|bytes differ"):
            self.run_collect()

    def test_rejects_zip_same_size_executable_mismatch(self):
        data = self.exe.read_bytes()
        self.exe.write_bytes(b"X" + data[1:])
        with self.assertRaisesRegex(ValueError, "bytes differ"):
            self.run_collect()

    def test_rejects_unsafe_zip(self):
        self.make_archive(("../unexpected", b"not extracted"))
        with self.assertRaisesRegex(ValueError, "unsafe bundle ZIP"):
            self.run_collect()

    def test_rejects_failing_bundle_check(self):
        self.contract.write_text('{"ok":false,"checks":[]}')
        with self.assertRaisesRegex(ValueError, "passing bundle check"):
            self.run_collect()

    def test_rejects_missing_codesign_check(self):
        self.contract.write_text('{"ok":true,"checks":[{"check":"executable","ok":true}]}')
        with self.assertRaisesRegex(ValueError, "codesign-verify"):
            self.run_collect()

    def test_rejects_over_limit_asset(self):
        with patch("collect_macos_asset_witness.MAX_FILE", 1):
            with self.assertRaisesRegex(ValueError, "file limit"):
                self.run_collect()

    def test_rejects_existing_output_without_overwrite(self):
        self.output.write_bytes(b"preserve existing receipt")
        with self.assertRaises(FileExistsError):
            self.run_collect()
        self.assertEqual(self.output.read_bytes(), b"preserve existing receipt")

    def test_failure_during_copy_removes_only_own_partial_output(self):
        with patch("zipfile.ZipFile.write", side_effect=RuntimeError("fixture write failure")):
            with self.assertRaisesRegex(RuntimeError, "fixture write failure"):
                self.run_collect()
        self.assertFalse(self.output.exists())
        self.assertTrue(self.archive.is_file())
        self.assertTrue(self.cache_js.is_file())

    def test_release_profile_supported(self):
        (self.root / "src-tauri/target/debug").rename(self.root / "src-tauri/target/release")
        self.run_collect(profile="release")


class ProducerIntegrationTests(unittest.TestCase):
    def test_existing_producer_retains_witness_in_same_artifact(self):
        default_workflow = Path(__file__).resolve().parents[1] / ".github/workflows/package-macos.yml"
        workflow = Path(os.environ.get("WITNESS_WORKFLOW", str(default_workflow))).read_text()
        self.assertIn("tools/collect_macos_asset_witness.py", workflow)
        self.assertIn('--source-commit "$GITHUB_SHA"', workflow)
        self.assertEqual(workflow.count("actions/upload-artifact@v4"), 1)
        self.assertIn("            frontend-codegen-witness.zip\n", workflow)
        self.assertIn("            asset-witness.json\n", workflow)
        self.assertLess(workflow.index("- name: Zip the bundle"), workflow.index("- name: Retain original asset witnesses"))


if __name__ == "__main__":
    unittest.main()
