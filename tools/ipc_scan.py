import re, glob, json, collections
bs = open('main_strings.txt', errors='ignore').read()
pat = re.compile(r'(?<![\w$.])([\w$]{1,3})\("([a-z][a-z0-9]*(?:_[a-z0-9]+)+)"(\s*[,)])')
cmds = collections.defaultdict(set)
for f in glob.glob('frontend/dist/assets/*.js'):
    t = open(f, errors='ignore').read()
    for m in pat.finditer(t):
        if m.group(2) in bs: cmds[m.group(2)].add(f.split('/')[-1])
out = {k: sorted(v) for k, v in sorted(cmds.items())}
json.dump(out, open('ipc_commands.json','w'), indent=1)
print(len(out)); print(' '.join(out))
