"""Validate retained source bytes only; never evaluate the reference JavaScript."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "evidence/terminal/clear-redraw-1f/source"
manifest = json.loads((SOURCE / "reference.json").read_text())
for span in manifest["spans"]:
    data = (SOURCE / span["file"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == span["sha256"], span["file"]

handler = (SOURCE / "spans/renderer-$wa.txt").read_bytes()
assert b'if(Qh("terminal.insertNewline",h))return r(`\n`),!1;' in handler
assert handler.index(b'"terminal.insertNewline"') < handler.index(b"u.buffer.active!==u.buffer.normal")
caller = (SOURCE / "spans/renderer-eSa.txt").read_bytes()
assert b"Z=Ye=>{_||qc.write(Q,Ye)}" in caller
assert b"writeInput:se,terminalRef:H" in caller
controller = (SOURCE / "spans/index-V9.txt").read_bytes()
assert b'this.snapshot.connectionState!=="running"||!this.snapshot.isInputEnabled||' in controller
assert b"this.backendSession?.write(e)" in controller
backend = (SOURCE / "spans/index-ySt.txt").read_bytes()
assert b'write(e){if(!this.isAlive)return;const s={id:this.ptyId,data:e};oe("pty_write",{args:s})' in backend
print(f"PASS: {len(manifest['spans'])} retained-span hashes; literal LF precedes alternate-buffer guard; unchanged-input caller and transport")
