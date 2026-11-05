"""Walk Tauri's embedded asset table (key_ptr,key_len,body_ptr,body_len) and brotli-decode bodies."""
import struct, sys, os, json, hashlib, brotli
binp, start, outdir = sys.argv[1], int(sys.argv[2], 16), sys.argv[3]
data = open(binp,'rb').read(); BASE = 0x100000000
def entry(o):
    kp,kl,dp,dl = struct.unpack('<4Q', data[o:o+32])
    if not (BASE <= kp < BASE+len(data) and 0 < kl < 512 and BASE <= dp < BASE+len(data) and dl < 64<<20): return None
    k = data[kp-BASE:kp-BASE+kl]
    if not k.startswith(b'/'): return None
    try: k = k.decode()
    except: return None
    return k, data[dp-BASE:dp-BASE+dl]
o = start
while entry(o-32): o -= 32
first = o; manifest = []; n = 0
while (e := entry(o)):
    k, body = e; o += 32
    try: raw = brotli.decompress(body); enc = 'brotli'
    except Exception: raw = body; enc = 'raw'
    p = os.path.join(outdir, k.lstrip('/'))
    os.makedirs(os.path.dirname(p), exist_ok=True); open(p,'wb').write(raw)
    manifest.append({'key':k,'encoding':enc,'compressed_bytes':len(body),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
json.dump({'binary':binp,'table_file_offset_first':hex(first),'table_file_offset_end':hex(o),'entries':manifest}, open(os.path.join(outdir,'..','tauri-assets-manifest.json'),'w'), indent=1)
print('entries', len(manifest), 'first', hex(first), 'end', hex(o), 'raw', sum(m['encoding']=='raw' for m in manifest))
