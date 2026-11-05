import re, glob, json, collections
js = {f.split('/')[-1]: open(f, errors='ignore').read() for f in glob.glob('frontend/dist/assets/*.js')}
app = {k:v for k,v in js.items() if len(v) > 200000 or k.startswith(('index-BGEQ','renderApp'))}
routes = collections.Counter()
for t in js.values():
    for m in re.finditer(r'(?:path|to|href|navigate\()\s*[:(]?\s*["`](/[a-z0-9$:._/-]*)["`]', t): routes[m.group(1)] += 1
css = {}
for f in glob.glob('frontend/dist/assets/*.css'):
    t = open(f, errors='ignore').read()
    for sel, body in re.findall(r'([:.\w\[\]="-]+(?:\s*,\s*[:.\w\[\]="-]+)*)\s*\{([^{}]*--[^{}]*)\}', t):
        for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;}]+)', body):
            css.setdefault(sel.strip()[:60], {})[k] = v.strip()
copy = collections.Counter()
for t in app.values():
    for m in re.finditer(r'(?:children|title|label|placeholder|description|tooltip|content)\s*:\s*"([A-Z][^"\\]{3,160})"', t): copy[m.group(1)] += 1
    for m in re.finditer(r'"([A-Z][a-z]+(?: [a-zA-Z\',.?!]+){1,20}[.?!]?)"', t): copy[m.group(1)] += 1
json.dump(sorted(routes), open('fe_routes.json','w'), indent=1)
json.dump(css, open('fe_css_tokens.json','w'), indent=1)
json.dump(sorted(copy), open('fe_copy_catalog.json','w'), indent=0)
print('routes', len(routes), 'css selectors', len(css), 'tokens', sum(map(len, css.values())), 'copy', len(copy), 'appchunks', list(app)[:8])
print(sorted(routes)[:80])
