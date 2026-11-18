# Singleton queued-row drag eligibility

Owner: Conductor Rebuild / SAME135.

## Product scope

One existing `QueuePanel` predicate in `Composer.tsx` now requires more than one
queued item, as well as no active edit, before rendering a draggable row.
Callbacks, drag payloads, list order, self-drop, focus, and queue mutations are
unchanged. A disabled callback is never manually invoked by these tests.

## Reference and current source

The retained REA extraction from the real Conductor app qualifies the singleton
eligibility policy through the complete visible queue producer and its sortable
consumer. The historical source packet, declaration spans, parent digest, and
REA limitations are retained under `reference/`. This is retained source evidence,
not a fresh physical/native observation. Earlier candidate language about drag
entry is narrowed by the actual tests to **rendered eligibility only**.

The baseline and treatment were checked against fetched main
`5f7afadc1c50ee44aa21677b5ab0dd96b87cfb57`. All 18 untouched source inputs match
that main; outside-QueuePanel prefix and suffix bytes are identical. Only the
`draggable` predicate differs. The containing package has not been tested.

## Frozen RED and identical GREEN

Both phases used exactly this command, with no source-ref substitution:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env -u COMPOSER_QUEUE_SINGLETON_DRAG_SOURCE_REF \
  NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 \
  .qa/queue-singleton-drag-135/composerQueueSingletonDrag.test.ts
```

- **RED:** six intended rendered-eligibility failures (`true !== false`), fourteen
  passing controls; exit 1. Actual cleanup/release: 2026-11-17T23:56:04.391214Z.
  All 242 identities passed before and after; no surviving owned processes.
- **GREEN:** all 20 passed; exit 0. Test start/end:
  2026-11-18T00:08:14.191854Z / 00:08:15.310342Z. Actual cleanup/release:
  00:08:15.311072Z. All 243 identities passed before and after; process group 111
  had no survivors. No setup errors, skips, cancellations, unhandled failures,
  timeout, retries, or fixture/oracle drift.
- GREEN retained output: 4,086 bytes. Child maximum RSS: 161,388 KiB, **not**
  aggregate group RSS or a group cap. Heap limit was 768 MiB per Node process.
- Frozen fixture SHA-256:
  `8391b03a3f7317fbfcba7645d6a9b6e1ac922023d7fa73532c60e3e0e44aa752`.
- GREEN TAP SHA-256:
  `82f1116915e9cfeddd7c1d8d72fa10dcc19fe4066bc5536a403ee3cdbddc2937`.

The six target cases check singleton eligibility initially, after deletion or
collapse/shrink, after edit Cancel/Save, and across session remount. They contain
no singleton drag-start callback or later entry assertion. Enabled multirow
controls 9, 10, 11, and 13 invoke actual handlers, preserving payload, reorder,
self-drop, and drag-end behavior. Other controls preserve active-edit exclusion,
blank-save protection (#1474), collapse/regrowth (#1476), and removed-row,
session-switch, and steer focus negatives (#1479).

## Permanent regression / focused adjacent delivery

The prepared permanent 20-case port is
`src/features/chat/composerQueueSingletonDrag.test.ts`. All executable case
bodies are byte-identical to the frozen fixture; only named relative imports
and two comments differ. Its SHA-256 is
`bc52c1ecb79557bb6a96c50c0c43be07efe1988117f43f53b7eeed6df018f935`.

The permanent port plus six adjacent suites is **not yet executed**. It has a
separate serialized request; do not interpret a source-only preparation receipt
or the earlier identical GREEN as that seven-file check passing. No ready PR
is opened before the focused regression/adjacent result.

## Verification limits

These are actual-Composer React component tests with editor, focus, and drag
payload ports, not browser or native gesture tests. No disabled singleton
callback, physical drag suppression, visual match, signed package, or packaged
macOS behavior is proven. There is no screenshot/recording for this fix because
native/package execution remains with the existing sole E1 lane, currently
blocked; no duplicate native execution or retry was started.
