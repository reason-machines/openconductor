"""Read signed VM-runner metadata without executing the candidate."""
import argparse
from pathlib import Path
import plistlib
import subprocess

BUNDLE_ID = "com.reasonmachines.openconductor.qa-vm-runner"
EXECUTABLE = "OpenConductorQAVMRunner"
ENTITLEMENTS = {
    "com.apple.security.app-sandbox": True,
    "com.apple.security.virtualization": True,
}


def verify_entitlements(data):
    values = plistlib.loads(data)
    if (not isinstance(values, dict) or values.keys() != ENTITLEMENTS.keys()
            or any(type(values[key]) is not bool or values[key] is not True
                   for key in ENTITLEMENTS)):
        raise ValueError("signed runner must have exactly sandbox and virtualization entitlements")


def verify_bundle(bundle):
    bundle = Path(bundle)
    if bundle.suffix != ".app" or not bundle.is_dir() or bundle.is_symlink():
        raise ValueError("expected a standalone VM runner app bundle")
    allowed = {"Contents", "Contents/Info.plist", "Contents/MacOS",
               f"Contents/MacOS/{EXECUTABLE}", "Contents/_CodeSignature",
               "Contents/_CodeSignature/CodeResources"}
    for path in bundle.rglob("*"):
        if path.is_symlink() or str(path.relative_to(bundle)) not in allowed:
            raise ValueError("unexpected runner bundle content")
    info = plistlib.loads((bundle / "Contents/Info.plist").read_bytes())
    if (info.get("CFBundleIdentifier") != BUNDLE_ID
            or info.get("CFBundleExecutable") != EXECUTABLE
            or not (bundle / "Contents/MacOS" / EXECUTABLE).is_file()):
        raise ValueError("runner bundle identity mismatch")
    subprocess.run(["/usr/bin/codesign", "--verify", "--strict", str(bundle)],
                   check=True, capture_output=True)
    result = subprocess.run(
        ["/usr/bin/codesign", "--display", "--entitlements", "-", "--xml", str(bundle)],
        check=True, capture_output=True)
    verify_entitlements(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()
    verify_bundle(args.bundle)
    print("PASS: signed standalone runner identity and exact entitlement keys; not native enforcement")


if __name__ == "__main__":
    main()
