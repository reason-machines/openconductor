"""Tests for tools/check_macos_bundle.py on synthetic bundles (any OS, no codesign).

Run: python3 -m unittest tools/test_check_macos_bundle.py
"""
import contextlib
import io
import json
import pathlib
import plistlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_macos_bundle as cmb  # noqa: E402

CONF = json.loads(cmb.TAURI_CONF.read_text())
REF_KEYS = json.loads(cmb.REFERENCE.read_text())["info_plist"]["keys"]
BUNDLED = list(json.loads(cmb.BUNDLE_CONF.read_text())["bundle"]["resources"].values())
DIVERGENT = json.loads(cmb.DIVERGENCES.read_text())["info_plist"]


def good_info():
    """An Info.plist with every reference key, filled with our own values."""
    ours = json.loads(json.dumps(REF_KEYS))
    for key, value in ours.items():
        if isinstance(value, dict):
            ours[key] = "x"
    ours.update(
        CFBundleIdentifier=CONF["identifier"],
        CFBundleName=CONF["productName"],
        CFBundleShortVersionString=CONF["version"],
        CFBundleVersion=CONF["version"],
        CFBundleExecutable="openconductor",
        CFBundleIconFile="icon.icns",
        LSMinimumSystemVersion=CONF["bundle"]["macOS"]["minimumSystemVersion"],
        CFBundleURLTypes=[{"CFBundleTypeRole": "Editor", "CFBundleURLName": "x",
                           "CFBundleURLSchemes": ["openconductor"]}],
    )
    for key in cmb.FOLDER_KEYS:
        ours[key] = "OpenConductor needs this."
    for key in DIVERGENT:
        ours.pop(key, None)
    return ours


class CheckBundle(unittest.TestCase):
    def run_check(self, info, exe=True, icon=True, tools=True, divergences=None):
        with tempfile.TemporaryDirectory() as tmp:
            app = pathlib.Path(tmp, "OpenConductor.app")
            (app / "Contents/MacOS").mkdir(parents=True)
            (app / "Contents/Resources").mkdir()
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
            if exe:
                p = app / "Contents/MacOS/openconductor"
                p.write_text("#!/bin/sh\n")
                p.chmod(0o755)
            if icon:
                (app / "Contents/Resources/icon.icns").write_bytes(b"icns")
            if tools:
                for target in BUNDLED:
                    p = app / "Contents/Resources" / target
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text("#!/bin/sh\n")
                    p.chmod(0o755)
            report = pathlib.Path(tmp, "report.json")
            with contextlib.redirect_stdout(io.StringIO()):
                args = [str(app), "--skip-codesign", "--report", str(report)]
                if divergences:
                    args += ["--divergences", str(divergences)]
                code = cmb.main(args)
            failed = [c["check"] for c in json.loads(report.read_text())["checks"] if not c["ok"]]
            return code, failed

    def test_complete_bundle_passes(self):
        self.assertEqual(self.run_check(good_info()), (0, []))

    def test_missing_reference_key_fails(self):
        info = good_info()
        del info["NSHighResolutionCapable"]
        self.assertEqual(self.run_check(info), (1, ["parity:NSHighResolutionCapable"]))

    def test_microphone_prompt_is_required(self):
        info = good_info()
        del info["NSMicrophoneUsageDescription"]
        self.assertEqual(self.run_check(info)[1],
                         ["prompt:NSMicrophoneUsageDescription", "parity:NSMicrophoneUsageDescription"])

    def test_listed_divergence_may_be_absent(self):
        info = good_info()
        del info["NSMicrophoneUsageDescription"]
        with tempfile.TemporaryDirectory() as tmp:
            div = pathlib.Path(tmp, "divergences.json")
            div.write_text(json.dumps({"info_plist": {"NSMicrophoneUsageDescription": "test"}}))
            _, failed = self.run_check(info, divergences=div)
        self.assertEqual(failed, ["prompt:NSMicrophoneUsageDescription"])

    def test_wrong_identifier_and_missing_scheme_fail(self):
        info = good_info()
        info["CFBundleIdentifier"] = "com.example.other"
        info["CFBundleURLTypes"] = []
        self.assertEqual(self.run_check(info)[1], ["CFBundleIdentifier", "url-scheme"])

    def test_prompt_must_name_openconductor(self):
        info = good_info()
        info["NSDesktopFolderUsageDescription"] = "Some other app reads your Desktop."
        self.assertEqual(self.run_check(info)[1], ["prompt:NSDesktopFolderUsageDescription"])

    def test_missing_executable_and_icon_fail(self):
        self.assertEqual(self.run_check(good_info(), exe=False, icon=False)[1], ["executable", "icon"])

    def test_missing_bundled_tool_fails(self):
        self.assertEqual(BUNDLED, ["bin/gh"])
        self.assertEqual(self.run_check(good_info(), tools=False)[1], ["resource:bin/gh"])


if __name__ == "__main__":
    unittest.main()
