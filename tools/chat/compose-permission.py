import base64
import json
from pathlib import Path
from PIL import Image

out = Path("evidence/chat/permission-colors")
reference = json.loads((out / "reference.json").read_text())
current = json.loads((out / "openconductor.json").read_text())
images = {}
for theme in ("dark", "light"):
    for name, source, rect in (
        ("reference", f"ref-{theme}.png", reference["geometry"]["card"]["rect"]),
        ("before", f"before-{theme}.png", current["geometry"]["card"]["rect"]),
        ("after", f"after-{theme}.png", current["geometry"]["card"]["rect"]),
    ):
        box = tuple(round(rect[k]) for k in ("left", "top", "right", "bottom"))
        destination = out / f"{name}-{theme}-card.png"
        Image.open(out / source).crop(box).save(destination)
        images[f"{name}-{theme}"] = "data:image/png;base64," + base64.b64encode(destination.read_bytes()).decode()

figures = "".join(
    f'<figure data-theme="{theme}" {"hidden" if theme == "light" else ""}><figcaption>{label}</figcaption><img src="{images[f"{name}-{theme}"]}" alt="{label}, {theme} theme"></figure>'
    for name, label in (("reference", "Conductor · decoded real-app frontend"), ("before", "OpenConductor · before"), ("after", "OpenConductor · fixed"))
    for theme in ("dark", "light")
)
html = '''<!doctype html><html><head><meta charset="UTF-8"><title>Permission colors</title><style>
body{margin:0;color:var(--foreground);font-family:var(--font-sans);line-height:1.5}h1{font-size:24px;font-weight:500;margin:0 0 8px}p{margin:0 0 16px}.muted,figcaption{color:var(--muted-foreground)}nav{display:flex;gap:8px;margin:16px 0}button{padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:inherit;cursor:pointer}button[aria-pressed=true]{background:var(--foreground);color:var(--background)}figure{margin:0 0 16px}figure[hidden]{display:none}figcaption{font-size:12px;margin-bottom:8px}img{display:block;width:100%;max-width:648px;border-radius:8px;border:1px solid var(--border)}section{border-top:1px solid var(--border);margin-top:24px;padding-top:16px}h2{font-size:18px;font-weight:500;margin:0 0 8px}ul{margin:0;padding-left:20px}code{font-family:var(--font-mono);font-size:12px}
</style></head><body><h1>Permission cards keep their muted tool colors</h1><p class="muted">Conductor Rebuild · current-source check on main f16d9338 plus a five-line CSS diff.</p><p>Approval cards sit outside the transcript. Their tool rows previously lost the transcript-scoped color variables, making the command bright and its chip transparent. Sharing the existing tokens fixes that scope without changing the request or its answers.</p><nav aria-label="Capture theme"><button aria-pressed="true" data-mode="dark">Dark</button><button aria-pressed="false" data-mode="light">Light</button></nav>''' + figures + '''<section><h2>Verified</h2><ul><li>The full workspace browser check fails before the fix and passes after it in dark and light themes.</li><li>No, Enter, and Backspace answer the request and clear its card. The matched component fixture also checks the Yes button.</li><li>The same Bash approval is shown above. Both component card bodies measure 648 × 188 pixels.</li><li>Build, color lint, and all 1,293 unit tests passed.</li></ul></section><section><h2>Limits</h2><p>These are Chromium captures of Conductor's identity-checked decoded frontend and OpenConductor's real ToolApproval component with identical synthetic data. They are not native macOS proof. Neutral theme colors and shortcut glyph rendering differ; no whole-screen or pixel-exact parity is claimed.</p><p>The full workspace checks use the built-in preview agent. No command executes, no real coding-agent session starts, and no live Mac data is touched. Native workspace actionability and the separate five-pass sequence remain with their existing owners.</p></section><script>document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('figure').forEach(f=>f.hidden=f.dataset.theme!==button.dataset.mode)});</script></body></html>'''
(out / "report.html").write_text(html)
