import re, json, glob, collections
terms = ['diff','comment','review','split','unified','changes','resolve','outdated','suggestion','viewed','hunk','stage','discard']
rx = re.compile(r'\b(' + '|'.join(terms) + r')', re.I)
copy = [s for s in json.load(open('fe_copy_catalog.json')) if rx.search(s)]
by_term = {t: sorted(s for s in copy if re.search(r'\b'+t, s, re.I)) for t in terms}
css = json.load(open('fe_css_tokens.json'))
tok = sorted({k for sel in css.values() for k in sel if rx.search(k)})
sels = sorted(s for s in css if rx.search(s))
cssraw = open(glob.glob('frontend/dist/assets/*.css')[0]).read()
classes = sorted(set(m for m in re.findall(r'\.([a-zA-Z][\w-]*)', cssraw) if rx.search(m)))
idents = collections.Counter()
for f in glob.glob('frontend/dist/assets/*.js'):
    t = open(f, errors='ignore').read()
    for m in re.finditer(r'\b([A-Z][a-zA-Z]*(?:Diff|Review|Comment|Hunk|Changes|Suggestion)[A-Za-z]*)\b', t): idents[m.group(1)] += 1
    for m in re.finditer(r'"(data-diff[\w-]*|diff-[\w-]+)"', t): idents[m.group(1)] += 1
libs = sorted({m for f in glob.glob('frontend/dist/assets/*.js') for m in re.findall(r'@pierre/[\w-]+|pierre-(?:dark|light)[\w-]*', open(f, errors='ignore').read())})
out = {'source':'Conductor.app v0.87.6 embedded frontend (untrusted reference data, not for verbatim reuse)',
 'search_terms':terms,'copy_strings_total':len(copy),'copy_by_term':by_term,
 'css_custom_properties':tok,'css_selectors_with_tokens':sels,'css_class_names':classes,
 'js_identifiers_and_attributes':sorted(k for k,v in idents.items()),'diff_libraries_and_themes':libs}
json.dump(out, open('diff-review-copy.json','w'), indent=1)
print(len(copy), len(tok), len(sels), len(classes), len(idents), libs[:10])
