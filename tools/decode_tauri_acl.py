#!/usr/bin/env python3
"""Decode the resolved Tauri ACL that generate_context! compiles into an arm64 Mach-O.

Tauri builds the capability ACL as straight-line Rust code: every scope string
becomes a String and is inserted into a BTreeMap<String, tauri_utils::acl::Value>,
and every scope into BTreeMap<u64, ResolvedScope>. String data search misses many
of these literals: LLVM writes literals of 8 bytes or fewer as movz/movk
immediates, and longer ones as an 8- or 16-byte load from packed data plus the
tail bytes as immediates. This walks the disassembly of that function in order
and prints, per instruction, the printable immediates it stores, the data it
references (adrp+add) and each map insert, so the scope entries can be read in
order.

Usage (macOS, Xcode command line tools):
  tools/decode_tauri_acl.py <binary> <start-address> <stop-address>

Find the function with `nm <binary> | grep init_common5inner` (Conductor 0.87.6:
0x100338208). The output is raw evidence; derived data stays untrusted.
"""
import re
import subprocess
import sys

TEXT_VMADDR = 0x100000000  # __TEXT vmaddr; file offset = address - this for __TEXT data


def main() -> None:
    binary, start, stop = sys.argv[1:4]
    data = open(binary, "rb").read()
    asm = subprocess.run(
        ["xcrun", "llvm-objdump", "-d", "--no-show-raw-insn",
         f"--start-address={start}", f"--stop-address={stop}", binary],
        capture_output=True, text=True, check=True).stdout
    regs: dict[str, int] = {}
    adrp: dict[str, int] = {}
    for line in asm.split("\n"):
        m = re.match(r"\s*([0-9a-f]+):\s+(\S+)\s*(.*)", line)
        if not m:
            continue
        addr, op, args = m.groups()
        if op in ("mov", "movz") and "#0x" in args:
            r, imm = re.match(r"(\w+), #(0x[0-9a-f]+)", args).groups()
            regs[r[1:]] = int(imm, 16)
        elif op == "movk":
            r, imm, sh = re.match(r"(\w+), #(0x[0-9a-f]+)(?:, lsl #(\d+))?", args).groups()
            sh = int(sh or 0)
            regs[r[1:]] = (regs.get(r[1:], 0) & ~(0xFFFF << sh)) | (int(imm, 16) << sh)
        elif op == "adrp":
            r, t = re.match(r"(\w+), (0x[0-9a-f]+)", args).groups()
            adrp[r] = int(t, 16)
        elif op == "add" and (mm := re.match(r"(x\d+), (x\d+), #(0x[0-9a-f]+)$", args)):
            _, src, imm = mm.groups()
            if src in adrp:
                t = adrp.pop(src) + int(imm, 16)
                print(addr, "ref", hex(t), data[t - TEXT_VMADDR:t - TEXT_VMADDR + 40])
        elif op in ("strb", "strh", "str", "stur", "sturh", "sturb") and args[0] in "wx":
            r = args.split(",")[0]
            if r[1:] in regs:
                n = {"strb": 1, "sturb": 1, "strh": 2, "sturh": 2}.get(op, 8 if r[0] == "x" else 4)
                s = regs[r[1:]].to_bytes(8, "little")[:n]
                if all(32 <= c < 127 for c in s):
                    print(addr, "imm", s.decode(), op)
        elif op == "bl" and "insert" in args:
            if "5value5Value" in args:
                print(addr, "INSERT Value")
            elif "ResolvedScope" in args:
                print(addr, f"INSERT Scope key={regs.get('1')}")
            elif "ResolvedCommand" in args:
                print(addr, "INSERT Command")
        elif op == "ret":
            print(addr, "RET")


if __name__ == "__main__":
    main()
