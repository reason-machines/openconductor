import base64
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2]
out = root / "evidence/chat/turn-details"
for name in ["reference-dark", "reference-light", "dark-open", "light-open", "before-dark"]:
    Image.open(out / f"{name}.png").crop((180, 200, 800, 365)).save(out / f"{name}-crop.png")


def image(name):
    data = base64.b64encode((out / f"{name}-crop.png").read_bytes()).decode()
    return f"data:image/png;base64,{data}"


sections = []
for theme in ["dark", "light"]:
    sections.append(f'''<section data-theme="{theme}" {'hidden' if theme == 'light' else ''}>
      <figure><figcaption>Conductor reference · REA-decoded frontend</figcaption><img src="{image(f'reference-{theme}')}" alt="Conductor metadata popover with agent, time range and usage"></figure>
      {f'<figure><figcaption>Before · current Transcript has only a native title</figcaption><img src="{image("before-dark")}" alt="OpenConductor transcript before with no details popover"></figure>' if theme == 'dark' else ''}
      <figure><figcaption>After · actual Transcript component</figcaption><img src="{image(f'{theme}-open')}" alt="OpenConductor popover with the existing agent label and time range"></figure>
    </section>''')

html = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{{margin:0;color:var(--foreground);font:14px/20px var(--font-sans,system-ui)}}h1{{font-size:22px;line-height:28px;font-weight:500;margin:0 0 8px}}h2{{font-size:17px;font-weight:500}}p{{margin:8px 0 16px}}.muted,figcaption{{color:var(--muted-foreground)}}button{{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:6px;padding:6px 12px;margin-right:8px}}button[aria-pressed=true]{{box-shadow:inset 0 -2px currentColor}}figure{{margin:16px 0}}figcaption{{margin-bottom:8px}}img{{display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:6px}}ul{{padding-left:20px}}section[hidden]{{display:none}}
</style></head><body>
<h1>Turn details are now reachable by mouse and keyboard</h1><p class="muted">Conductor Rebuild · bounded Chromium proof · source fcc96920</p>
<p>The finished-turn timestamp now opens an inspectable popover instead of relying on a non-focusable native title. The duration and existing model/agent label are unchanged.</p>
<nav aria-label="Screenshot theme"><button aria-pressed="true" data-pick="dark">Dark</button><button aria-pressed="false" data-pick="light">Light</button></nav>
{''.join(sections)}
<h2>Verified</h2><ul><li>The same regression failed before with SPAN ≠ BUTTON, then passed all 16 browser checks.</li><li>Click, Enter, Space and hover open details. Escape restores focus. Leaving or clicking outside closes.</li><li>Dark and light themes, unknown agent, running turns and cancelled turns were exercised.</li><li>Build, color lint and all 1,329 unit tests passed.</li></ul>
<h2>Not full metadata parity</h2><p>The reference has usage rows. OpenConductor's current transcript contract has no token or fast-mode telemetry; this UI-only fix does not invent it. The supplied agent label is not proof of historical per-turn model attribution. Fixture dates and agent labels differ from the reference.</p><p>These are screenshots of Conductor's identity-checked decoded frontend and OpenConductor's real Transcript component with synthetic data. Native macOS, real agent transport and final side-by-side acceptance were not run. No pixel-exact match is claimed.</p>
<script>document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{{document.querySelectorAll('[data-theme]').forEach(s=>s.hidden=s.dataset.theme!==b.dataset.pick);document.querySelectorAll('[data-pick]').forEach(x=>x.setAttribute('aria-pressed',x===b));}});</script>
</body></html>'''
(out / "review.html").write_text(html)
