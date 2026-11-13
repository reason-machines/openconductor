# NEW13 ES2021 compatibility candidate V3

Conductor Rebuild prepared this source-only candidate after the [bounded V2 run](../frontend-run-20261112/README.md) reproduced two intended failures, passed the same thirteen cases after the frontend fix, passed twenty-one adjacent cases, then failed typecheck with TS2550. No V3 replay has run.

The only executable-source change from V2 is `Object.hasOwn(imports, name)` to `Object.prototype.hasOwnProperty.call(imports, name)`. Receiver and key are identical. All other fixture bytes, thirteen tests, assertions, raw-validator guards and controls are unchanged. This does not change TypeScript configuration, libraries, dependencies or product behavior. [Literal mapping, hashes and unadmitted command request](mapping.json).

The active candidate is `src/settings/customPrefixDotDelimiterV3.test.ts`, SHA256 `d6c81e973d4054aead4ffb63a63b3288aebabb0c933f569e34473a823e3e98cb`, 7,142 bytes. The old active V2 path is removed so its unsupported library call is not still compiled. [The original V2 bytes](customPrefixDotDelimiterV2.test.ts.txt) remain exact: SHA256 `8c6bbd962eb12b2fd45f5d525003d61b17c87d9683db5f2258ad7600b02c046e`, 7,119 bytes. The original NEW13 and NEW10 archives are unchanged.

The parent nine-entry `SHA256SUMS` and V2 metadata remain immutable historical records. Their original active V2 path now maps to the preserved `.txt` file; all nine remapped hashes passed. The separate [V3 manifest](SHA256SUMS) names current paths. This remapping does not omit or change any original manifest member. V2 failure output remains exact in gzip form, with both compressed and raw hashes recorded.

Static inventory remains two delimiter positives, seven pure raw-validator and normalization guards, three sanitizer-stable mounted invalid controls, and one GitHub/None control. Expected V3 baseline RED is two failures and eleven passing controls. Expected fixed GREEN is thirteen passes, adjacent checks twenty-one passes, and typecheck exit zero. These V3 outcomes are predictions, not observations.

The fixed frontend product milestone is commit `4235d533bafe93fc82ebce194ce3b677ecca5b8a`, based on incorporated main `84a3153cbca1c25e210c3835ea9314f54e9f6c36`. The slot was released. A distinct direct ACC decision is required before the requested serial V3 replay. At eligibility the current containing main, hunks, lock and fixture must be requalified. No reinstall is requested because frontend dependencies remain present with the original lock.

Rust remains unchanged and unadmitted. GitPage and the separate sanitizer remain untouched. No browser, native, provider, build, package, manual dispatch, release-cut expansion or screenshot is included. This candidate is not a complete or mergeable delimiter fix.
