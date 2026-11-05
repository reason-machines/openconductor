#!/usr/bin/env python3
"""Bind Conductor IPC command names to Rust handler symbols and dispatcher references.

Static only. Inputs: the thin arm64 Mach-O, ipc_names.txt (151 candidates from the frontend).
For each name:
  - string_sites: every exact byte occurrence in __TEXT,__const / __cstring (vm address)
  - handler_symbols: local symbols whose conductor_lib path ends in the name (Rust v0 path idents)
  - referencing_functions: functions whose ADRP+ADD pairs compute a string site address
Output is evidence, not source; decoded from shipped bytes.
"""
import bisect, json, re, struct, subprocess, sys, hashlib

B = sys.argv[1]
names = [l.strip() for l in open(sys.argv[2]) if l.strip()]
data = open(B, 'rb').read()
sha = hashlib.sha256(data).hexdigest()

# --- sections (thin Mach-O, LC_SEGMENT_64) ---
def sections():
    out = []
    ncmds = struct.unpack_from('<I', data, 16)[0]
    off = 32
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', data, off)
        if cmd == 0x19:
            nsects = struct.unpack_from('<I', data, off + 64)[0]
            so = off + 72
            for i in range(nsects):
                sect = data[so:so+16].rstrip(b'\0').decode()
                seg = data[so+16:so+32].rstrip(b'\0').decode()
                addr, sz, foff = struct.unpack_from('<QQI', data, so + 32)
                out.append((seg, sect, addr, sz, foff))
                so += 80
        off += size
    return out
S = sections()
def sec_of_off(o):
    for seg, sect, addr, sz, foff in S:
        if foff and foff <= o < foff + sz:
            return seg, sect, addr + (o - foff)
    return None

# --- symbols (nm, local+external defined text symbols) ---
nm = subprocess.run(['nm', '-U', '-n', B], capture_output=True, text=True).stdout.splitlines()
syms = []
for l in nm:
    p = l.split(' ', 2)
    if len(p) == 3 and p[1] in 'tT':
        syms.append((int(p[0], 16), p[2]))
syms.sort()
saddrs = [a for a, _ in syms]
def fn_at(pc):
    i = bisect.bisect_right(saddrs, pc) - 1
    return syms[i] if i >= 0 else None

def v0_path(m):
    """Length-prefixed identifiers following the conductor_lib crate ident (best-effort v0 path)."""
    k = m.find('13conductor_lib')
    if k < 0:
        return None
    i, ids = k + len('13conductor_lib'), []
    while i < len(m) and m[i].isdigit():
        j = i
        while j < len(m) and m[j].isdigit():
            j += 1
        n = int(m[i:j])
        if n == 0:
            break
        if m[j:j+1] == '_':  # v0 punycode/underscore separator
            j += 1
        ids.append(m[j:j+n]); i = j + n
    return ids

def kind(m):
    head = m.split('13conductor_lib')[0]
    if head.startswith('__RNvNt') or head.startswith('__RNvCs'):
        return 'fn'
    if 'NC' in head[:12]:
        return 'closure'
    if 'drop_glue' in m:
        return 'drop_glue'
    return 'generic_or_impl'

# --- ADRP+ADD reference scan over __text ---
text = next(s for s in S if s[1] == '__text')
_, _, taddr, tsz, tfoff = text
words = struct.unpack_from('<%dI' % (tsz // 4), data, tfoff)
# collect string sites first
sites = {}
for n in names:
    pat = n.encode()
    hits = []
    for mm in re.finditer(re.escape(pat), data):
        s = sec_of_off(mm.start())
        if s and s[0] == '__TEXT' and s[1] in ('__const', '__cstring'):
            hits.append((s[1], s[2]))
    sites[n] = hits
want = {a: n for n, hs in sites.items() for _, a in hs}
refs = {}
pending = {}  # reg -> (page, pc)
for idx, w in enumerate(words):
    pc = taddr + idx * 4
    if (w & 0x9F000000) == 0x90000000:  # ADRP
        imm = (((w >> 5) & 0x7FFFF) << 2) | ((w >> 29) & 3)
        if imm & (1 << 20):
            imm -= 1 << 21
        pending[w & 31] = ((pc & ~0xFFF) + (imm << 12), pc)
    elif (w & 0xFFC00000) == 0x91000000:  # ADD Xd, Xn, #imm12 (64-bit, sh=0)
        rn = (w >> 5) & 31
        p = pending.get(rn)
        if p and pc - p[1] <= 32:
            t = p[0] + ((w >> 10) & 0xFFF)
            if t in want:
                refs.setdefault(t, set()).add(pc)
    if idx & 0x3F == 0 and len(pending) > 64:
        pending.clear()

out = []
for n in names:
    hs = sites[n]
    handlers = []
    for a, m in syms:
        if '13conductor_lib' in m:
            p = v0_path(m)
            if p and n in p and p[-1] == n:
                handlers.append({'addr': hex(a), 'mangled': m, 'path': 'conductor_lib::' + '::'.join(p), 'kind': kind(m)})
    rf = {}
    for _, a in hs:
        for pc in refs.get(a, ()):
            f = fn_at(pc)
            key = f[1] if f else '?'
            rf.setdefault(key, {'fn_addr': hex(f[0]) if f else None, 'symbol': key,
                                'path': ('conductor_lib::' + '::'.join(v0_path(key) or [])) if f and '13conductor_lib' in key else None,
                                'ref_pcs': []})['ref_pcs'].append(hex(pc))
    rank = {'fn': 0, 'closure': 1, 'drop_glue': 2, 'generic_or_impl': 3}
    handlers.sort(key=lambda h: rank[h['kind']])
    fns = handlers
    out.append({'command': n,
                'string_sites': [{'section': s, 'addr': hex(a)} for s, a in hs],
                'handler_fn': fns[0]['path'] if fns else None,
                'handler_fn_addr': fns[0]['addr'] if fns and fns[0]['kind'] == 'fn' else None,
                'handler_evidence': fns[0]['kind'] if fns else None,
                'handler_symbols': handlers[:12],
                'referencing_functions': sorted(rf.values(), key=lambda r: r['fn_addr'] or '')[:12]})

summary = {
    'subject': {'path': 'Conductor.app/Contents/MacOS/conductor', 'sha256': sha, 'format': 'mach-o arm64 (thin)'},
    'method': 'static: nm -U symbol table (Rust v0 path idents), exact byte search in __TEXT __const/__cstring, ADRP+ADD pair decoding over __text (<=8 insn window). Not REA; REA Ghidra per-address xrefs re-import the 70 MB binary per call (~32 min).',
    'candidates': len(names),
    'with_string_site': sum(1 for r in out if r['string_sites']),
    'with_handler_fn': sum(1 for r in out if r['handler_fn']),
    'with_referencing_fn': sum(1 for r in out if r['referencing_functions']),
    'limitations': [
        'Candidate list includes setting keys and event names, not only #[tauri::command] names; handler_fn is the conductor_lib path of the best symbol ending in the name (fn > closure > drop_glue of its future > generic); handler_fn_addr is set only for a plain fn symbol. null means no conductor_lib symbol ends in that name (inlined, renamed, or not a command).',
        'v0 demangling is best-effort path-ident extraction, no generic args.',
        'ADRP+ADD decoding misses LDR-literal, ADR and register-computed string loads; absence of a reference is bounded to that pattern.',
        'Decoded from shipped bytes; not original source.'],
}
json.dump({'summary': summary, 'bindings': out}, open(sys.argv[3], 'w'), indent=1)
print(json.dumps(summary, indent=1))
