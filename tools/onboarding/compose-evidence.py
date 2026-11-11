from pathlib import Path
import base64
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
out = root / 'evidence/onboarding-sign-in'
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
reference = root / 'evidence/screens/onboarding--sign-up-opening-browser--dark.png'
items = [
    ('reference', reference, (124, 592, 588, 760)),
    ('before', out / 'before.png', (408, 442, 872, 610)),
    ('after', out / 'after.png', (408, 432, 872, 600)),
]
manifest = {}
for name, source, crop in items:
    image = Image.open(source)
    image.crop(crop).save(out / f'{name}-controls.png')
    manifest[name] = {'source': str(source.relative_to(root)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'viewport': list(image.size), 'crop': list(crop)}
(out / 'images.json').write_text(json.dumps(manifest, indent=2) + '\n')

for filename, names, labels in [
    ('before-after.png', ('before', 'after'), ('OpenConductor before / Strict Mode', 'OpenConductor after / Strict Mode')),
    ('reference-after.png', ('reference', 'after'), ('Conductor / reused REA component crop', 'OpenConductor / synthetic IPC component crop')),
]:
    canvas = Image.new('RGB', (952, 218), '#ffffff')
    draw = ImageDraw.Draw(canvas)
    for i, (name, label) in enumerate(zip(names, labels)):
        draw.text((i * 480 + 4, 8), label, fill='#161616', font=font)
        canvas.paste(Image.open(out / f'{name}-controls.png'), (i * 480, 40))
    canvas.save(out / filename)

def uri(filename):
    return 'data:image/png;base64,' + base64.b64encode((out / filename).read_bytes()).decode()

(out / 'report.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Local sign-in lifecycle</title>
<style>body{margin:0;font-family:var(--font-sans,system-ui);color:var(--foreground);line-height:1.5}h1{font-size:26px;font-weight:500;margin:0 0 8px}h2{font-size:19px;font-weight:500;margin:24px 0 12px}p{margin:8px 0;color:var(--muted-foreground)}.result{padding:16px;background:var(--muted);border-radius:8px;margin:20px 0}.result strong{color:var(--foreground)}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;border:1px solid var(--border);border-radius:6px}figcaption{font-size:13px;color:var(--muted-foreground);margin-top:8px}ul{padding-left:20px}code{font-family:var(--font-mono,monospace)}@media(max-width:550px){.pair{grid-template-columns:1fr}}</style>
<h1>Sign-in survives the development remount</h1><p>Conductor Rebuild · isolated local onboarding verification · November 6, 2026</p>
<div class="result"><strong>Four reproduced failures fixed.</strong><p>The same nine browser checks go from five passing and four failing to nine passing. Normal mounting and late-result suppression also pass.</p></div>
<h2>Before and after</h2><div class="pair"><figure><img src="''' + uri('before-controls.png') + '''"><figcaption>Before: the handoff confirmation code is missing. Account completion and retry results are ignored too.</figcaption></figure><figure><img src="''' + uri('after-controls.png') + '''"><figcaption>After: the synthetic confirmation code appears. Poll completion, already-signed-in completion and retry all pass.</figcaption></figure></div>
<h2>Conductor reference</h2><div class="pair"><figure><img src="''' + uri('reference-controls.png') + '''"><figcaption>Reused REA crop of Conductor 0.87.6's sign-up component. No fresh native run or new reference capture.</figcaption></figure><figure><img src="''' + uri('after-controls.png') + '''"><figcaption>OpenConductor's actual component uses Reason for sign-in. The skip link and confirmation code are intentional differences.</figcaption></figure></div>
<h2>What this proves</h2><ul><li>The mounted-state guard is rearmed on effect setup and cleared on cleanup.</li><li>Browser handoff, synthetic account polling, inline retry and already-signed-in completion work under React Strict Mode.</li><li>Build and typecheck, color lint and all 1,252 unit tests pass.</li></ul>
<h2>Limits</h2><p>Chromium with synthetic IPC is not a real Reason CLI login, browser handoff, macOS WebKit test or native final-parity verdict. The reference crop came from a 1440×900 onboarding capture; the OpenConductor crop came from a 1280×820 login fixture. Only the shared sign-up controls are compared, without scaling or a pixel-match score. No real account, workspace, repository or filesystem was changed.</p></html>''')
