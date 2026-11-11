"""Check retained reference/test bytes without executing JavaScript or Rust."""
import hashlib
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = root / "evidence/sidebar-rename-unicode"
for line in (evidence / "fixture.sha256").read_text().splitlines():
    expected, relative = line.split("  ", 1)
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative

backend_path = "src-tauri/src/sidebar_rename_commands.rs"
backend = (root / backend_path).read_text()
frozen_tests = (evidence / "rust-tests.frozen.txt").read_text()
assert backend.count(frozen_tests) == 1, "Rust regression tests changed"
baseline = subprocess.check_output(
    ["git", "show", "f19879abe8cb4ea3118907c78722ca3e4da3be54:" + backend_path],
    cwd=root,
    text=True,
)
if ".all(|c| c.is_alphanumeric() || c == '_' || c == '-')" in backend:
    assert backend.replace(frozen_tests, "") == baseline, "Unexpected baseline product change"
    print("PASS: frozen fixture and unchanged baseline validator; JS/Rust NOT RUN")
else:
    print("PASS: frozen fixture; validator changed; JS/Rust NOT RUN by this check")
