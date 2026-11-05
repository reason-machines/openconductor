"""Check a built OpenConductor.app against the packaging contract.

The contract has three parts:
  1. identity: Info.plist matches src-tauri/tauri.conf.json, and the executable,
     icon, URL scheme and folder-access prompts are in place;
  2. parity: every Info.plist key and entitlement that REA observed in
     Conductor.app (evidence/packaging/conductor-reference.json) is present with
     the same value type, unless evidence/packaging/divergences.json lists it
     with a reason;
  3. resources: every file src-tauri/tauri.bundle.conf.json bundles is in
     Contents/Resources and executable;
  4. signing (macOS only): the bundle verifies with `codesign --strict`, has the
     hardened runtime, and is signed the expected way (ad-hoc or Developer ID).

Usage:
  python3 tools/check_macos_bundle.py path/to/OpenConductor.app \
      [--signing adhoc|developer-id|any] [--skip-codesign] [--report out.json]
Exit status is 0 when every check passes, 1 otherwise.
"""
import argparse
import json
import os
import pathlib
import plistlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "evidence/packaging/conductor-reference.json"
DIVERGENCES = ROOT / "evidence/packaging/divergences.json"
TAURI_CONF = ROOT / "src-tauri/tauri.conf.json"
BUNDLE_CONF = ROOT / "src-tauri/tauri.bundle.conf.json"
URL_SCHEME = "openconductor"
FOLDER_KEYS = (
    "NSDesktopFolderUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
    "NSMicrophoneUsageDescription",
)


def value_type(v):
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (str, dict)) and (not isinstance(v, dict) or v.get("type") == "string"):
        return "string"
    if isinstance(v, list):
        return "array"
    if isinstance(v, dict):
        return "dict"
    return type(v).__name__


class Report:
    def __init__(self):
        self.checks = []

    def add(self, name, ok, detail=""):
        self.checks.append({"check": name, "ok": bool(ok), "detail": detail})

    @property
    def ok(self):
        return all(c["ok"] for c in self.checks)


def check_identity(app, info, conf, r):
    r.add("CFBundleIdentifier", info.get("CFBundleIdentifier") == conf["identifier"],
          f"{info.get('CFBundleIdentifier')!r} (want {conf['identifier']!r})")
    r.add("CFBundleName", info.get("CFBundleName") == conf["productName"],
          f"{info.get('CFBundleName')!r} (want {conf['productName']!r})")
    r.add("CFBundleShortVersionString", info.get("CFBundleShortVersionString") == conf["version"],
          f"{info.get('CFBundleShortVersionString')!r} (want {conf['version']!r})")
    want_min = conf.get("bundle", {}).get("macOS", {}).get("minimumSystemVersion")
    if want_min:
        r.add("LSMinimumSystemVersion", info.get("LSMinimumSystemVersion") == want_min,
              f"{info.get('LSMinimumSystemVersion')!r} (want {want_min!r})")

    exe = app / "Contents/MacOS" / str(info.get("CFBundleExecutable", ""))
    r.add("executable", exe.is_file() and os.access(exe, os.X_OK), str(exe.relative_to(app)))

    icon = str(info.get("CFBundleIconFile", ""))
    res = app / "Contents/Resources"
    icon_ok = bool(icon) and ((res / icon).is_file() or (res / f"{icon}.icns").is_file())
    r.add("icon", icon_ok, icon or "CFBundleIconFile missing")

    schemes = [s for t in info.get("CFBundleURLTypes", []) for s in t.get("CFBundleURLSchemes", [])]
    r.add("url-scheme", URL_SCHEME in schemes, f"schemes={schemes}")

    for key in FOLDER_KEYS:
        text = info.get(key)
        r.add(f"prompt:{key}", isinstance(text, str) and "OpenConductor" in text,
              "present" if text else "missing")


def check_parity(info, reference, divergences, r):
    allowed = divergences.get("info_plist", {})
    for key, ref_value in reference["info_plist"]["keys"].items():
        if key in allowed:
            r.add(f"parity:{key}", True, f"divergence: {allowed[key]}")
            continue
        if key not in info:
            r.add(f"parity:{key}", False, "missing (Conductor has it; add it or list it in divergences.json)")
            continue
        want, got = value_type(ref_value), value_type(info[key])
        r.add(f"parity:{key}", want == got, f"type {got} (Conductor: {want})")
    extra = sorted(set(info) - set(reference["info_plist"]["keys"]))
    r.add("parity:extra-keys", True, ", ".join(extra) or "none")


def check_resources(app, bundle_conf, r):
    """Each bundled tool (bin/gh) is in Contents/Resources and executable."""
    for target in bundle_conf.get("bundle", {}).get("resources", {}).values():
        path = app / "Contents/Resources" / target
        ok = path.is_file() and os.access(path, os.X_OK)
        r.add(f"resource:{target}", ok, "present" if ok else "missing or not executable")


def codesign(*args):
    p = subprocess.run(["codesign", *args], capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def check_signing(app, reference, divergences, signing, r):
    code, _, err = codesign("--verify", "--deep", "--strict", "--verbose=2", str(app))
    r.add("codesign-verify", code == 0, err.strip().splitlines()[-1] if err.strip() else "")

    _, _, info = codesign("-dvvv", str(app))
    flags = re.search(r"flags=0x[0-9a-f]+\(([^)]*)\)", info)
    flag_set = set(flags.group(1).split(",")) if flags else set()
    r.add("hardened-runtime", "runtime" in flag_set, f"flags={sorted(flag_set)}")

    adhoc = "Signature=adhoc" in info
    devid = "Authority=Developer ID Application:" in info
    kind = "adhoc" if adhoc else "developer-id" if devid else "other"
    r.add("signing-kind", signing == "any" or kind == signing, f"{kind} (want {signing})")

    code, out, _ = codesign("-d", "--entitlements", "-", "--xml", str(app))
    ents = plistlib.loads(out.encode()) if code == 0 and out.strip() else {}
    main_ref = next(s for s in reference["signatures"] if s["subject"] == "conductor")
    allowed = divergences.get("entitlements", {})
    for ent, val in main_ref["entitlements"].items():
        if ent in allowed:
            r.add(f"entitlement:{ent}", True, f"divergence: {allowed[ent]}")
        else:
            r.add(f"entitlement:{ent}", ents.get(ent) == val, f"{ents.get(ent)!r} (Conductor: {val!r})")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("app", type=pathlib.Path)
    ap.add_argument("--signing", choices=["adhoc", "developer-id", "any"], default="any")
    ap.add_argument("--skip-codesign", action="store_true", help="plist checks only (any OS)")
    ap.add_argument("--report", type=pathlib.Path, help="write the results as JSON")
    ap.add_argument("--reference", type=pathlib.Path, default=REFERENCE)
    ap.add_argument("--divergences", type=pathlib.Path, default=DIVERGENCES)
    ap.add_argument("--tauri-conf", type=pathlib.Path, default=TAURI_CONF)
    ap.add_argument("--bundle-conf", type=pathlib.Path, default=BUNDLE_CONF)
    a = ap.parse_args(argv)

    app = a.app.resolve()
    plist_path = app / "Contents/Info.plist"
    if not plist_path.is_file():
        print(f"not an app bundle: {plist_path} missing", file=sys.stderr)
        return 1
    info = plistlib.loads(plist_path.read_bytes())
    conf = json.loads(a.tauri_conf.read_text())
    reference = json.loads(a.reference.read_text())
    divergences = json.loads(a.divergences.read_text())

    r = Report()
    check_identity(app, info, conf, r)
    check_parity(info, reference, divergences, r)
    check_resources(app, json.loads(a.bundle_conf.read_text()), r)
    if not a.skip_codesign:
        check_signing(app, reference, divergences, a.signing, r)

    for c in r.checks:
        print(f"{'ok  ' if c['ok'] else 'FAIL'} {c['check']}: {c['detail']}")
    print("PASS" if r.ok else "FAIL", f"({sum(c['ok'] for c in r.checks)}/{len(r.checks)} checks)")
    if a.report:
        a.report.write_text(json.dumps({"app": app.name, "ok": r.ok, "checks": r.checks}, indent=2) + "\n")
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main())
