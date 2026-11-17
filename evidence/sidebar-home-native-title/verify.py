"""Inert source-contract check; never imports/evaluates product or reference JS."""
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
source = (root / "src/components/Sidebar.tsx").read_text()
reference = json.loads(pathlib.Path("evidence/home-routing/reference-static.json").read_text())
home = next(line for line in source.splitlines() if "<NavRow " in line and 'label="Home"' in line)
navrow = source[source.index("function NavRow("):source.index("\ninterface MenuItem")]
reference_text = "\n".join(item["excerpt"] for item in reference["homeReferences"])
checks = {
    "retained REA caller constructs Home title from nav.home": 'O=HH("Home","nav.home")' in reference_text,
    "retained REA Home caller binds title:O": "title:O" in reference["sidebarDispatch"]["excerpt"],
    "Home supplies native title from effective primary shortcut": 'title={titleWithShortcut("Home", glyphs(effectiveShortcuts("nav.home", overrides)[0]))}' in home,
    "NavRow forwards the native title to its button": "title={title}" in navrow,
    "Home does not substitute an app-tooltip prop": "tooltip=" not in home,
}
for label, passed in checks.items():
    print(f'{"PASS" if passed else "FAIL"}: {label}')
print(f"{sum(checks.values())}/{len(checks)} static checks passed; no product/reference JavaScript executed")
sys.exit(0 if all(checks.values()) else 1)
