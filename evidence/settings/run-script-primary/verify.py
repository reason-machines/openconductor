"""Verify inert custody and paired results; never execute JS or provision packages."""
from pathlib import Path
import gzip
import hashlib
import json
import re

root = Path(__file__).resolve().parent
repo = root.parents[2]
checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


def digest(data):
    return hashlib.sha256(data).hexdigest()


manifest = json.loads((root / "source-manifest.json").read_text())
for item in manifest["spans"]:
    data = (root / item["file"]).read_bytes()
    check(len(data) == item["bytes"], f"span size: {item['name']}")
    check(digest(data) == item["sha256"], f"span digest: {item['name']}")
    start, end = item["utf8_half_open"]
    check(end - start == len(data), f"span bounds: {item['name']}")

before = (root / "frozen/RepoScriptsRows.before.tsx.txt").read_bytes()
after = (repo / "src/settings/rows/RepoScriptsRows.tsx").read_bytes()
check(digest(before) == "9fcfca0123de65aa4aa069a234904988d35f140253a86054971bb375838f4018", "baseline")
check(digest(after) == "01a4744126293c4602e628ea2737f2169654a43972e9d02486b881ca0ff10c6e", "treatment")
# Reconstruct precisely the admitted seven-line diff; every other byte stays fixed.
expected = before.decode()
for old, new in [
    ('import { usePendingEdit } from "../../lib/persistence/producer.ts";\n', 'import { usePendingEdit } from "../../lib/persistence/producer.ts";\nimport { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider";\nimport { effectiveShortcuts } from "../../keybindings/overrides";\nimport { matchesEvent } from "../../keybindings/shortcut";\n'),
    ('}) {\n  const [form, setForm] = useState(props.initial);', '}) {\n  const { overrides } = useKeybindingOverrides();\n  const [form, setForm] = useState(props.initial);'),
    ('if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {\n              e.preventDefault();', 'if (effectiveShortcuts("dialog.primaryAction", overrides).some((key) => matchesEvent(key, e.nativeEvent))) {\n              e.preventDefault();'),
    ('              onModEnter={submit}\n', ''),
]:
    check(expected.count(old) == 1, "unique patch anchor")
    expected = expected.replace(old, new)
check(expected.encode() == after, "all outside-patch bytes preserved")
for data in (before, after):
    region = data.decode().split("/** Conductor's `fei`")[1].split("/**\n * Conductor's `FCe`")[0]
    check(digest(region.encode()) == "08aa5d6ea7686016791b717b2442045b342689d8a402572dbc2cf3a83c33c79b", "SAME49 region")

frozen = (root / "frozen/runScriptDialogPrimaryKey.test.ts.txt").read_bytes()
permanent = (repo / "src/settings/runScriptDialogPrimaryKey.test.ts").read_bytes()
check(digest(frozen) == "03c71a53a888567759ea2100713d6379281c9077693b601db1f52915f81205dc", "frozen fixture")
check(digest(permanent) == "e52aa095219bad2d8ec6fc64502d822b6c634d7b13eb1c496131950904141508", "permanent fixture")
check(frozen.split(b"const sourceRoot =", 1)[1] == permanent.split(b"const sourceRoot =", 1)[1], "all fixture-body bytes and assertions preserved")

names = []
for phase, passed, failed in [("red", 8, 7), ("green", 15, 0)]:
    raw = gzip.decompress((root / f"execution/{phase}.tap.gz").read_bytes()).decode()
    names.append(re.findall(r"^# Subtest: (.+)$", raw, re.M))
    for key, value in [("tests", 15), ("pass", passed), ("fail", failed), ("cancelled", 0), ("skipped", 0), ("todo", 0)]:
        check(re.search(rf"^# {key} {value}$", raw, re.M) is not None, f"{phase} {key}")
    check(len(names[-1]) == 15, f"{phase} named cases")
check(names[0] == names[1], "same test names and order")
adjacent = gzip.decompress((root / "execution/permanent-adjacent.tap.gz").read_bytes()).decode()
for key, value in [("tests", 36), ("pass", 36), ("fail", 0), ("cancelled", 0), ("skipped", 0), ("todo", 0)]:
    check(re.search(rf"^# {key} {value}$", adjacent, re.M) is not None, f"adjacent {key}")
check(re.findall(r"^# Subtest: (Run-script .+)$", adjacent, re.M) == names[1], "permanent retains all frozen cases")
print(f"PASS: {checks} inert source/evidence checks")
