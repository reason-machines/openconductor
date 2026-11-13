#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
identity=-
receipt_dir=
bundle_archive=
while (($#)); do
  case $1 in
    --identity) identity=${2:?--identity needs a value}; shift ;;
    --ci-receipt-dir) receipt_dir=${2:?--ci-receipt-dir needs a value}; shift ;;
    --ci-bundle-archive) bundle_archive=${2:?--ci-bundle-archive needs a value}; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ $(uname -s) == Darwin ]] || { echo "macOS compiler required; no fallback" >&2; exit 2; }
if [[ -n $bundle_archive && -z $receipt_dir ]]; then
  echo "Bundle retention requires CI receipts" >&2
  exit 2
fi
if [[ -n $receipt_dir ]]; then
  [[ $identity == - ]] || { echo "CI receipt requires ad-hoc signing" >&2; exit 2; }
  PYTHONDONTWRITEBYTECODE=1 python3 -m tools.native_qa_vm_receipt preflight --checkout "$PWD"
fi
umask 077
mkdir -p native-qa-vm-runner/.build
out=$(mktemp -d native-qa-vm-runner/.build/package.XXXXXXXX)
app=$out/OpenConductorQAVMRunner.app
mkdir -p "$app/Contents/MacOS"
cp native-qa-vm-runner/Info.plist "$app/Contents/Info.plist"
xcrun --show-sdk-version
xcrun clang -arch arm64 -mmacosx-version-min=15.0 -std=c11 \
  -Wall -Wextra -Werror -pedantic -c native-qa-vm-runner/Profile.c -o "$out/Profile.o"
xcrun clang -arch arm64 -mmacosx-version-min=15.0 -fobjc-arc -fmodules \
  -Wall -Wextra -Werror native-qa-vm-runner/Runner.m "$out/Profile.o" \
  -framework AppKit -framework Virtualization -o "$app/Contents/MacOS/OpenConductorQAVMRunner"
codesign --force --sign "$identity" --options runtime \
  --entitlements native-qa-vm-runner/Entitlements.plist "$app"
python3 tools/native_qa_vm_signing.py "$app"
if [[ -n $receipt_dir ]]; then
  PYTHONDONTWRITEBYTECODE=1 python3 -m tools.native_qa_vm_receipt emit \
    --checkout "$PWD" --bundle "$app" --output-directory "$receipt_dir" \
    --sdk-version "$(xcrun --show-sdk-version)" --clang-version "$(xcrun clang --version)"
fi
if [[ -n $bundle_archive ]]; then
  mkdir -p -m 700 "$(dirname "$bundle_archive")"
  PYTHONDONTWRITEBYTECODE=1 python3 -m tools.native_qa_vm_receipt retain \
    --checkout "$PWD" --bundle "$app" --receipt-directory "$receipt_dir" \
    --output-file "$bundle_archive"
fi
echo "$app"
