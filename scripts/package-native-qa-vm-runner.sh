#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
identity=-
while (($#)); do
  case $1 in
    --identity) identity=${2:?--identity needs a value}; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ $(uname -s) == Darwin ]] || { echo "macOS compiler required; no fallback" >&2; exit 2; }
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
echo "$app"
