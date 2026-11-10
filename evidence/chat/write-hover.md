# Write selected-content badge hover

Conductor Rebuild. Source-bound repair WRITE-HOVER-029F-01. This is not native, provider, browser, or side-by-side acceptance.

## Current-main mismatch

Checked default main `8f88db182e0ea7ed20e0b612a6e111ba7f70dcc0`. `ToolRows.tsx` blob `e7ae5357f492d9de081081028808834d62daf43b` has a private WriteRow whose `shown` value is the first 2,000 UTF-16 units until expanded, then the full raw content. Its body receives `shown`, but the right FileBadge receives no hover content. The existing opt-in FileBadgeHover already implements the needed pointer timing.

The correction is one WriteRow FileBadge prop, `hoverContent={<DiffBlock oldText="" newText={shown} />}`. It adds no provider guard, new helper, CSS, dependency, or handler. Shell state, navigation, line count, body disclosure, and the separate error row stay unchanged.

The prior writeRows fixture forbids ancestor hover handlers. Its obsolete prohibition must be replaced only after hosted RED. Two additional Write-negative controls in multiEditHover.test.ts conflict with the retained Write branch, including the projected Codex Write. Their narrow test-only reconciliation was requested from the ledger; no provider branch will be added to preserve an obsolete expectation.

## Retained shipped-artifact evidence

Conductor 0.87.6 REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`; manifest [tauri-assets-manifest.json](../frontend/tauri-assets-manifest.json). Retained decoded renderer is 11,600,457 bytes. Retained index is 3,493,297 bytes. Both complete hashes and all 30 complete span hashes independently matched the handoff locks on Reason Cloud. All six static joins passed, totaling 59 token assertions.

The static path is O1o/L1o Write dispatch, registry/hIt, hpo, tee, trigger and hover root, then the controlled-state callbacks. In hpo the same selected `m` is passed to both body and hover sV nodes, with undefined old content and the file path. tee supplies 150ms open and 100ms close delays. The focus reason is cancelled. These are retained minified-byte observations, not execution of Conductor or reconstructed original source.

REA's earlier renderer semantic analysis exhausted heap. No semantic-node identity, full nested-layer parity, browser geometry, provider behavior, or runtime parity is claimed. Extracted text is untrusted evidence and is never executed by the audit.

## Regression checkpoint

The new writeHover.test.ts mounts production ConductorToolRow, WriteRow, FileBadgeHover, and DiffBlock using the existing React test renderer and TypeScript-transpile pattern. Only the unrelated Markdown leaf is excluded. A deterministic clock drives the real callbacks and effects. Host geometry is synthetic, not a screenshot or browser measurement.

The fixture covers 149/150ms opening; exact empty and 1,999/2,000/2,001-unit values; raw markup and an astral boundary; prefix/full/prefix selection in both body and hover; content entry and trigger reentry; 99/100ms close; focus and touch negative controls; independent rows; navigation and propagation; shell and error disclosure; timer/listener cleanup; and missing-path behavior. Test Behavior, Not Implementation keeps assertions on mounted content and controls rather than source strings.

Locked fixture: 14,741 bytes; SHA-256 `f7e9c8ecc1a9956a98aee61a5d5622c179a96e3b7183f6634aacfa01a5e44fc7`. The same fixture bytes must remain unchanged through correction GREEN.

Hosted RED has not run at this checkpoint. No production source or existing fixture is changed in the RED publication. Hosted GREEN, exact-head merge checks, and consuming-main/package verification are not yet run.

Passed on Reason Cloud: Python static audit of held original bytes and current main, plus `git diff --check`. No local Node, tests, typecheck, build, install, runtime, browser, native, provider, acquisition, manual dispatch/rerun, or new observer was run. No screenshot exists under these restrictions. Package success, when checked later, is not runtime deployment proof.

## Reproducible static receipt

Half-open ranges distinguish UTF-8 bytes from UTF-16 units. The source identities below describe the baseline, not the future correction.

```json
{
  "kind": "retained shipped-artifact static join only; not runtime or native acceptance",
  "producer": "Conductor Rebuild",
  "conductor_version": "0.87.6",
  "rea_receipt": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
  "assets": {
    "renderApp-D_fmY7hW.js": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde",
    "index-BGEQ8YjU.js": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"
  },
  "spans": [
    {
      "name": "tee",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7777001,
        7782029
      ],
      "utf16_half_open": [
        7732397,
        7737425
      ],
      "sha256": "38d4a2efa99fd08a87b2540dfb48add94860e8932a56c644132fcecf20165bf0"
    },
    {
      "name": "context",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        2156414,
        2156787
      ],
      "utf16_half_open": [
        2156017,
        2156390
      ],
      "sha256": "33c7eaa0ed8f6488836b65685714920ca9067391370bcc95155aca0b1297dab8"
    },
    {
      "name": "root-store",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6119908,
        6120656
      ],
      "utf16_half_open": [
        6077094,
        6077842
      ],
      "sha256": "45343fd7b8d63a25a6a3be3020fabba78c3d885cd31bd5f4a101687d0c8f0c9f"
    },
    {
      "name": "aHn",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6120656,
        6121572
      ],
      "utf16_half_open": [
        6077842,
        6078758
      ],
      "sha256": "649e73d7c1acbdb62ca4ee3d2e4ea139fda16d6c8eeccc77b9d55ec1e5d6256c"
    },
    {
      "name": "Bzs",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6121572,
        6121751
      ],
      "utf16_half_open": [
        6078758,
        6078937
      ],
      "sha256": "a24976e0ff4312e5fc9914af861515b6d8582e3719d04163013a8ad47419d3ec"
    },
    {
      "name": "base-root",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6121751,
        6121851
      ],
      "utf16_half_open": [
        6078937,
        6079037
      ],
      "sha256": "3138983c257791ec4b9b4b00c78a4c1770436950835ae94f80f8996bde8e5ffd"
    },
    {
      "name": "portal",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6121968,
        6122141
      ],
      "utf16_half_open": [
        6079154,
        6079327
      ],
      "sha256": "190ab4e870f01c03eff992d94b6c5eddef27561ab1128adabda4e7a998aad38b"
    },
    {
      "name": "trigger-base",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6122141,
        6122917
      ],
      "utf16_half_open": [
        6079327,
        6080103
      ],
      "sha256": "092b8bbcaffaaaea5a2954b399e8e03e19e187f393d015b10f91b25bdf4b64a3"
    },
    {
      "name": "GJe",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6124817,
        6125322
      ],
      "utf16_half_open": [
        6082003,
        6082508
      ],
      "sha256": "4d8d502751c48a1a7b804ad94302bc430528ea425f7c29f1f0d3c2d2e67b6e51"
    },
    {
      "name": "s1e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6125322,
        6125839
      ],
      "utf16_half_open": [
        6082508,
        6083025
      ],
      "sha256": "65d8cf6695f38f4964ee453a1414cbe94eb2bcddf9cb883ceb9951b20ef240ad"
    },
    {
      "name": "o1e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6125839,
        6127202
      ],
      "utf16_half_open": [
        6083025,
        6084388
      ],
      "sha256": "4c9d8fca67121f0bacdf7c5e2b17dd67cf944486dbb582931773e5665dc6230b"
    },
    {
      "name": "p9e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6127202,
        6129094
      ],
      "utf16_half_open": [
        6084388,
        6086280
      ],
      "sha256": "ba705a95513cbccf7b9835c7a2c7996f1acdb71f84f761c68f11baee49e29c20"
    },
    {
      "name": "a1e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6129094,
        6129662
      ],
      "utf16_half_open": [
        6086280,
        6086848
      ],
      "sha256": "a1bbcca42a4f23ae74e3d0d02162ebe82695953d43b8e5cd162baabfbc111adf"
    },
    {
      "name": "l1e",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        6129662,
        6130285
      ],
      "utf16_half_open": [
        6086848,
        6087471
      ],
      "sha256": "690a8a7872327cf72201269436c28cd70aead7c86f4f08fe24eec3efb2125d45"
    },
    {
      "name": "mouse-handlers",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        526669,
        530852
      ],
      "utf16_half_open": [
        526665,
        530848
      ],
      "sha256": "eba8b937807e84740fb592f4f93b443d8db340ed75ecc2301366e487b63966bb"
    },
    {
      "name": "focus-handlers",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        521299,
        522971
      ],
      "utf16_half_open": [
        521295,
        522967
      ],
      "sha256": "794f11007776007e9b8e6459a2383211ee29a4de5f043f08ac3b952d6fa5c9c7"
    },
    {
      "name": "open-dispatch",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        513838,
        514242
      ],
      "utf16_half_open": [
        513834,
        514238
      ],
      "sha256": "0102ae82cdebe0d78b0a0267244c42a0df9fd135b9c540a33195cd7ba38f2a92"
    },
    {
      "name": "controlled-state",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        1910696,
        1910985
      ],
      "utf16_half_open": [
        1910321,
        1910610
      ],
      "sha256": "c57fce88a6519630e130eb81d6098bf2e07cefee72f81375de5a3cd640862c9f"
    },
    {
      "name": "debouncer",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        1979845,
        1981704
      ],
      "utf16_half_open": [
        1979460,
        1981319
      ],
      "sha256": "293aa42be9546b542722fece5ffca2aacf8aebffedeae008355729955d94ccc3"
    },
    {
      "name": "timer",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        442176,
        442464
      ],
      "utf16_half_open": [
        442172,
        442460
      ],
      "sha256": "18396376badb2246c94a35966e5cfc32e34bff2afb988ec3d5fa13223ddf513b"
    },
    {
      "name": "reason-tags",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        447911,
        448293
      ],
      "utf16_half_open": [
        447907,
        448289
      ],
      "sha256": "6d18014c34d6de90d111f5928bb53fca849398e87a08d62dbd108466c7d9d252"
    },
    {
      "name": "reason-object",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        448293,
        448508
      ],
      "utf16_half_open": [
        448289,
        448504
      ],
      "sha256": "adf38d5bddb3ecb26da5f419d38eb2ab5d03a0a7d2024791f78660734f4bee05"
    },
    {
      "name": "dom-registration",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        450333,
        450422
      ],
      "utf16_half_open": [
        450329,
        450418
      ],
      "sha256": "aca42ffe320f48e067c872f43484d6e50c8f5453f096ce78a150d7cbe89235a0"
    },
    {
      "name": "O1o",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7587305,
        7588525
      ],
      "utf16_half_open": [
        7544223,
        7545443
      ],
      "sha256": "9f3ff5dc1b79f4690ad7b89b8911acbd083c2b97a4b3268f14f18cd964972184"
    },
    {
      "name": "L1o",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7588525,
        7588936
      ],
      "utf16_half_open": [
        7545443,
        7545854
      ],
      "sha256": "38f9343e156728f1decb69430d406c3c1ff29482da74e69e24b6d5c538834f25"
    },
    {
      "name": "registry",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7877182,
        7877770
      ],
      "utf16_half_open": [
        7832569,
        7833157
      ],
      "sha256": "94305b7588c4a5551656594289bc17ddb6934ed298cb76fc48181a2731105310"
    },
    {
      "name": "hIt",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7877770,
        7878325
      ],
      "utf16_half_open": [
        7833157,
        7833712
      ],
      "sha256": "8c45bb6e5892cce46330f820a54460ee896d1c14c19ad134dab20b9f20b75340"
    },
    {
      "name": "hpo",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7845824,
        7847626
      ],
      "utf16_half_open": [
        7801216,
        7803018
      ],
      "sha256": "439808b9941142548d2132720d96712eac341450ea87d9e9ccccdd5f5256ff3b"
    },
    {
      "name": "sV",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7775444,
        7776600
      ],
      "utf16_half_open": [
        7730842,
        7731998
      ],
      "sha256": "8b38333809c09e26d0d90ecf0ae88eae19cf9694747952170a37cea38edbf1e6"
    },
    {
      "name": "Mu",
      "artifact": "renderApp-D_fmY7hW.js",
      "utf8_half_open": [
        7795403,
        7798463
      ],
      "utf16_half_open": [
        7750797,
        7753857
      ],
      "sha256": "2a88a2516341f7a98563d2f4b2a602ac9c0acc584282cd01cf54a011e3e4231d"
    }
  ],
  "joins": {
    "write-dispatch": {
      "result": "PASS",
      "assertions": 4
    },
    "same-selected-content-for-hover-and-body": {
      "result": "PASS",
      "assertions": 8
    },
    "badge-trigger-card": {
      "result": "PASS",
      "assertions": 6
    },
    "trigger-events-to-controlled-state": {
      "result": "PASS",
      "assertions": 22
    },
    "content-hover-close-and-nested-layer-guard": {
      "result": "PASS",
      "assertions": 14
    },
    "focus-cancellation": {
      "result": "PASS",
      "assertions": 5
    }
  },
  "source": {
    "checked_main": "8f88db182e0ea7ed20e0b612a6e111ba7f70dcc0",
    "path": "src/features/chat/ToolRows.tsx",
    "git_blob": "e7ae5357f492d9de081081028808834d62daf43b",
    "sha256": "b96f58009eb8fa85a2d2fc304d578c10f2738f6962b33b2f4a53119e2bee9448",
    "WriteRow_sha256": "52fc94eacabf7ce96ac6a0284d952470e6640510162f68ce3dfce5f05c366112",
    "FileBadge_and_FileBadgeHover_sha256": "86838bc7a5720c9367d2671adf833ddef4b15de4872ea774309cf916350619e1",
    "writeRows_test_blob": "f63b529d523f73e3f9880b2b1fb5302a76b4e85d"
  },
  "mismatch": "WriteRow supplies no hoverContent although the retained hpo passes the same selected raw prefix/full content to both sV body and tee hover; shared FileBadgeHover is already opt-in for MultiEdit.",
  "proposed_scope": [
    "src/features/chat/ToolRows.tsx: private WriteRow right FileBadge prop only; reuse shown via DiffBlock, no shared helper edits",
    "src/features/chat/writeHover.test.ts: new locked deterministic-clock mounted-production-row fixture",
    "src/features/chat/writeRows.test.ts: rename prior no-hover test and remove only ancestor no-hover prohibition; retain shell, body, navigation assertions",
    "evidence/chat/write-hover.md: new provenance and RED/GREEN evidence"
  ],
  "not_claimed": [
    "g6/native/heap identity closure",
    "full nested-menu parity",
    "browser geometry or side-by-side appearance",
    "provider behavior",
    "runtime verification"
  ],
  "checks": {
    "whole_assets": "PASS",
    "thirty_complete_retained_spans": "PASS",
    "six_static_joins": "PASS",
    "current_main_mismatch": "PASS",
    "tests_typecheck_build_browser_native_provider": "NOT_RUN"
  },
  "limitations": "Prior REA renderer analysis exhausted heap. This reads retained decoded shipped bytes as data, not original source. No new acquisition, Node, application runtime, package installation, browser or native execution. No repair is authorized by this file; ledger collision clearance still required."
}
```

## Static audit

The following Python audit reads held artifact bytes as data and inspects git blobs. It never imports vendor code. Its workspace-relative inputs are under the retained evidence scratch; its only path adaptation sets ROOT to the repository.

Working audit SHA-256 `7bd6c5dfce84be0c2254780fca7f17045fc93da7f862244971ba6f820b6c7813`.

```python
"""Retained Conductor bytes are data only. No target code is imported or executed."""
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
ASSETS = HERE.parent / "retained-reference"
EXPECTED = {
    "renderApp-D_fmY7hW.js": "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde",
    "index-BGEQ8YjU.js": "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3",
}
SPAN_LOCKS = [
    ("tee", 7777001, 7782029, "38d4a2efa99fd08a87b2540dfb48add94860e8932a56c644132fcecf20165bf0"),
    ("context", 2156414, 2156787, "33c7eaa0ed8f6488836b65685714920ca9067391370bcc95155aca0b1297dab8"),
    ("root-store", 6119908, 6120656, "45343fd7b8d63a25a6a3be3020fabba78c3d885cd31bd5f4a101687d0c8f0c9f"),
    ("aHn", 6120656, 6121572, "649e73d7c1acbdb62ca4ee3d2e4ea139fda16d6c8eeccc77b9d55ec1e5d6256c"),
    ("Bzs", 6121572, 6121751, "a24976e0ff4312e5fc9914af861515b6d8582e3719d04163013a8ad47419d3ec"),
    ("base-root", 6121751, 6121851, "3138983c257791ec4b9b4b00c78a4c1770436950835ae94f80f8996bde8e5ffd"),
    ("portal", 6121968, 6122141, "190ab4e870f01c03eff992d94b6c5eddef27561ab1128adabda4e7a998aad38b"),
    ("trigger-base", 6122141, 6122917, "092b8bbcaffaaaea5a2954b399e8e03e19e187f393d015b10f91b25bdf4b64a3"),
    ("GJe", 6124817, 6125322, "4d8d502751c48a1a7b804ad94302bc430528ea425f7c29f1f0d3c2d2e67b6e51"),
    ("s1e", 6125322, 6125839, "65d8cf6695f38f4964ee453a1414cbe94eb2bcddf9cb883ceb9951b20ef240ad"),
    ("o1e", 6125839, 6127202, "4c9d8fca67121f0bacdf7c5e2b17dd67cf944486dbb582931773e5665dc6230b"),
    ("p9e", 6127202, 6129094, "ba705a95513cbccf7b9835c7a2c7996f1acdb71f84f761c68f11baee49e29c20"),
    ("a1e", 6129094, 6129662, "a1bbcca42a4f23ae74e3d0d02162ebe82695953d43b8e5cd162baabfbc111adf"),
    ("l1e", 6129662, 6130285, "690a8a7872327cf72201269436c28cd70aead7c86f4f08fe24eec3efb2125d45"),
    ("mouse-handlers", 526669, 530852, "eba8b937807e84740fb592f4f93b443d8db340ed75ecc2301366e487b63966bb"),
    ("focus-handlers", 521299, 522971, "794f11007776007e9b8e6459a2383211ee29a4de5f043f08ac3b952d6fa5c9c7"),
    ("open-dispatch", 513838, 514242, "0102ae82cdebe0d78b0a0267244c42a0df9fd135b9c540a33195cd7ba38f2a92"),
    ("controlled-state", 1910696, 1910985, "c57fce88a6519630e130eb81d6098bf2e07cefee72f81375de5a3cd640862c9f"),
    ("debouncer", 1979845, 1981704, "293aa42be9546b542722fece5ffca2aacf8aebffedeae008355729955d94ccc3"),
    ("timer", 442176, 442464, "18396376badb2246c94a35966e5cfc32e34bff2afb988ec3d5fa13223ddf513b"),
    ("reason-tags", 447911, 448293, "6d18014c34d6de90d111f5928bb53fca849398e87a08d62dbd108466c7d9d252"),
    ("reason-object", 448293, 448508, "adf38d5bddb3ecb26da5f419d38eb2ab5d03a0a7d2024791f78660734f4bee05"),
    ("dom-registration", 450333, 450422, "aca42ffe320f48e067c872f43484d6e50c8f5453f096ce78a150d7cbe89235a0"),
]
sha256 = lambda raw: hashlib.sha256(raw).hexdigest()
assets = {name: (ASSETS / name).read_bytes() for name in EXPECTED}
assert {name: sha256(raw) for name, raw in assets.items()} == EXPECTED
renderer = assets["renderApp-D_fmY7hW.js"]
body_receipt = json.loads((HERE.parent / "write-content-disclosure/receipt.json").read_text())
for span in body_receipt["spans"]:
    start, end = span["utf8_half_open"]
    assert sha256(renderer[start:end]) == span["sha256"]
    SPAN_LOCKS.append((span["name"], start, end, span["sha256"]))
spans = []
text = {}
for name, start, end, digest in SPAN_LOCKS:
    raw = renderer[start:end]
    assert sha256(raw) == digest, name
    value = raw.decode("utf-8")
    text[name] = value
    (HERE / (name + ".txt")).write_bytes(raw)
    units_start = len(renderer[:start].decode("utf-8").encode("utf-16-le")) // 2
    units_length = len(value.encode("utf-16-le")) // 2
    spans.append({"name": name, "artifact": "renderApp-D_fmY7hW.js", "utf8_half_open": [start, end], "utf16_half_open": [units_start, units_start + units_length], "sha256": digest})

joins = {
    "write-dispatch": [
        ("O1o", 'Write:"write"'), ("L1o", "const e=D1o[t]"),
        ("registry", "write:hpo"), ("hIt", "O1o({kind:L1o(n.name),registry:Qpo})"),
    ],
    "same-selected-content-for-hover-and-body": [
        ("hpo", 'a=n.input?.content||""'), ("hpo", 'd=a.length>2e3'),
        ("hpo", 'h=d&&!c?a.substring(0,2e3):a'), ("hpo", 'const m=h'),
        ("hpo", 'w=p.jsx(sV,{oldContent:void 0,newContent:m,filePath:o})'),
        ("hpo", 'E=p.jsx(tee,{filePath:o,localWorkspaceId:r,inline:!1,hoverCardContent:w})'),
        ("hpo", 'k=p.jsx(sV,{oldContent:void 0,newContent:m,filePath:o})'),
        ("hpo", 'onClick:()=>u(!c)'),
    ],
    "badge-trigger-card": [
        ("tee", 'hoverCardContent:h'), ("tee", 'if(h){'),
        ("tee", 'p.jsx(a1e,{asChild:!0,children:Ze})'),
        ("tee", 'p.jsx(l1e,{side:"top",align:E,sideOffset:8,className:Ct,children:h})'),
        ("tee", 'p.jsxs(p9e,{openDelay:150,closeDelay:100,children:[Tt,_t]})'),
        ("tee", 'Tt.stopPropagation(),u'),
    ],
    "trigger-events-to-controlled-state": [
        ("p9e", 'const[h,m]=jZ(d)'), ("p9e", 'p.jsx(GJe,{...a,open:h,closeDelay:u,onOpenChange:Q,children:n})'),
        ("GJe", 'openDelay:r,closeDelay:o'), ("GJe", 'p.jsx($zs,{...i,children:n})'),
        ("GJe", 'p.jsx(eEi.Provider,{value:d,children:h})'),
        ("base-root", 'p.jsx(aHn,{...e})'),
        ("aHn", 'h.useContextCallback("onOpenChange",i)'),
        ("a1e", 'a?.onContentHoverChange(!0)'), ("a1e", 'a?.onContentHoverChange(!1)'),
        ("a1e", 'p.jsx(s1e,{...o,ref:e,onPointerEnter:c,onPointerLeave:u})'),
        ("s1e", 'openDelay:c,closeDelay:u'), ("s1e", 'p.jsx(Hzs,{ref:e,render:d,delay:c,closeDelay:u,...o,children:h})'),
        ("trigger-base", 'B=nEe(k,{mouseOnly:!0,move:!1,handleClose:iEe(),delay:()=>({open:O,close:D})'),
        ("mouse-handlers", 'vc(Q,"mouseenter",J),vc(Q,"mouseleave",te)'),
        ("mouse-handlers", 'I.pointerType=Q.pointerType'),
        ("mouse-handlers", 'I.openChangeTimeout.start(de,()=>{je&&U()&&x.setOpen(!0,Ys(Np,ce,he))})'),
        ("root-store", 'setOpen=(e,n)=>'), ("root-store", 'Lli(this,e,n'),
        ("open-dispatch", 't.context.onOpenChange?.(e,n),n.isCanceled'),
        ("p9e", 'if(se.reason==="trigger-focus"){se.cancel();return}F(Z)'),
        ("p9e", 'Z&&E(!1),m(Z)'),
        ("controlled-state", 'a||u(_),r?.(_)'),
    ],
    "content-hover-close-and-nested-layer-guard": [
        ("context", 'function dFt(){return $.useContext(Fbi)}'),
        ("p9e", 'value:X'), ("p9e", 'onContentHoverChange:G,onNestedLayerOpenChange:U'),
        ("l1e", 'a?.onContentHoverChange(!0)'), ("l1e", 'a?.onContentHoverChange(!1)'),
        ("p9e", '_(Z),Z?(R.cancel(),E(!1)):R.maybeExecute()'),
        ("p9e", 'k=()=>E(!0)'), ("p9e", 'I={wait:u}'), ("p9e", 'const R=aD(k,I)'),
        ("p9e", 'w&&v.size===0&&!g&&m(!1)'),
        ("debouncer", 'this.#e=setTimeout('), ("debouncer", 'this.options.trailing&&!i&&this.#r(...n)'),
        ("portal", 'h9e().useState("mounted")||i'),
        ("o1e", 'p.jsx(Uzs,{container:c,keepMounted:u,children:k})'),
    ],
    "focus-cancellation": [
        ("trigger-base", 'F=yLt(k,{delay:O})'), ("focus-handlers", 'r.setOpen(!0,Ys(Dle,E,k))'),
        ("reason-tags", 'Dle="trigger-focus"'),
        ("p9e", 'if(se.reason==="trigger-focus"){se.cancel();return}F(Z)'),
        ("open-dispatch", 'if(t.context.onOpenChange?.(e,n),n.isCanceled)return;'),
    ],
}
for name, pairs in joins.items():
    for span, token in pairs:
        assert token in text[span], (name, span, token)

main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
path = "src/features/chat/ToolRows.tsx"
raw = subprocess.check_output(["git", "show", main + ":" + path], cwd=ROOT)
source = raw.decode()
write = source[source.index("function WriteRow("):source.index("function MultiEditRow(")]
badge = source[source.index("export function FileBadge("):source.index("/** `LD`", source.index("export function FileBadge("))]
assert 'const shown = long && !expanded ? content.substring(0, 2000) : content;' in write
assert 'right={path ? <FileBadge path={path} onOpen={onOpenFile} /> : undefined}' in write
assert 'hoverContent=' not in write
assert 'return hoverContent ? <FileBadgeHover content={hoverContent}>{button}</FileBadgeHover> : button;' in badge
assert '<DiffBlock oldText="" newText={shown} />' in write
for token in ['}, 150)', 'setTimeout(close, 100)', 'onPointerEnter={clearTimer}', 'onPointerLeave={leave}']:
    assert token in badge, token
old_test_path = "src/features/chat/writeRows.test.ts"
old_tests = subprocess.check_output(["git", "show", main + ":" + old_test_path], cwd=ROOT)
assert b'Write badge has no hover activation' in old_tests
source_identity = {"checked_main": main, "path": path, "git_blob": subprocess.check_output(["git", "rev-parse", main + ":" + path], cwd=ROOT, text=True).strip(), "sha256": sha256(raw), "WriteRow_sha256": sha256(write.encode()), "FileBadge_and_FileBadgeHover_sha256": sha256(badge.encode()), "writeRows_test_blob": subprocess.check_output(["git", "rev-parse", main + ":" + old_test_path], cwd=ROOT, text=True).strip()}
(HERE / "current-main-WriteRow.txt").write_text(write)
(HERE / "current-main-FileBadge.txt").write_text(badge)
receipt = {
    "kind": "retained shipped-artifact static join only; not runtime or native acceptance",
    "producer": "Conductor Rebuild", "conductor_version": "0.87.6",
    "rea_receipt": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
    "assets": EXPECTED, "spans": spans, "joins": {name: {"result": "PASS", "assertions": len(pairs)} for name, pairs in joins.items()},
    "source": source_identity,
    "mismatch": "WriteRow supplies no hoverContent although the retained hpo passes the same selected raw prefix/full content to both sV body and tee hover; shared FileBadgeHover is already opt-in for MultiEdit.",
    "proposed_scope": [
        "src/features/chat/ToolRows.tsx: private WriteRow right FileBadge prop only; reuse shown via DiffBlock, no shared helper edits",
        "src/features/chat/writeHover.test.ts: new locked deterministic-clock mounted-production-row fixture",
        "src/features/chat/writeRows.test.ts: rename prior no-hover test and remove only ancestor no-hover prohibition; retain shell, body, navigation assertions",
        "evidence/chat/write-hover.md: new provenance and RED/GREEN evidence",
    ],
    "not_claimed": ["g6/native/heap identity closure", "full nested-menu parity", "browser geometry or side-by-side appearance", "provider behavior", "runtime verification"],
    "checks": {"whole_assets": "PASS", "thirty_complete_retained_spans": "PASS", "six_static_joins": "PASS", "current_main_mismatch": "PASS", "tests_typecheck_build_browser_native_provider": "NOT_RUN"},
    "limitations": "Prior REA renderer analysis exhausted heap. This reads retained decoded shipped bytes as data, not original source. No new acquisition, Node, application runtime, package installation, browser or native execution. No repair is authorized by this file; ledger collision clearance still required.",
}
(HERE / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"source": source_identity, "span_count": len(spans), "joins": receipt["joins"], "checks": receipt["checks"]}, indent=2))
```
