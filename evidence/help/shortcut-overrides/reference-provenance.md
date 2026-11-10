# Help shortcut resolver: retained decoded artifact follow-through

Result: resolver source gap closed by read-only inspection of already-decoded artifacts on Sven's authorized `sven m5 max`. This is static shipped-artifact evidence, NOT native/runtime observation. No REA rerun, new app extraction, source execution, product edits, builds or runtime used.

Artifact root: /Users/sven/code/conductor-rea-work/frontend/dist/assets
- renderApp-D_fmY7hW.js: 11600457 bytes; SHA-256 5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde
- index-BGEQ8YjU.js: 3493297 bytes; SHA-256 b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3

Locations below are zero-based UTF-8 byte ranges [start,end), not character offsets.

renderApp:
- Help KQo [9788028,9792847): Keyboard shortcuts calls Ss with commandId openKeyboardShortcuts. Corroborates retained Help REA slice ev_a5741d7426810a0ccab286f8c817898a562e9fbc21ce0a38984b760ec3230f5c.
- Ss [2117989,2118414): calls jde(commandId), renders returned key and additionalKeys.
- jde [2116331,2116446): passes Mde() to wYe(commandId, overrides).
- Mde [2116206,2116331): useSyncExternalStore(q4r,WTn,WTn), parses snapshot using K4r.
- imports at bytes 55253,55263,55273,55283 map cV/cW/cX/cY to wYe/q4r/WTn/K4r, respectively, from index-BGEQ8YjU.js.

index:
- exports bytes 3481631/3481641/3481651/3481661 map OQt/SQt/bQt/zfe to cV/cW/cX/cY.
- zfe [3391333,3392168): parses version-1 override JSON; accepts recognized configurable commands and valid shortcut arrays.
- OQt [3395496,3395628): GUt(commandId,{overrides}).
- GUt [3395365,3395496): merges command metadata with nh()'s primary/additional keys.
- nh [3393483,3393608): returns overrides[commandId] when present; otherwise defaults.
- EUt [3388902,3389049), SQt [3389049,3389101), bQt [3389101,3389126): storage snapshot subscription and readback.
- jUt [3395628,3396107): wires settingsByKey[Cm] snapshot/subscription plus get/updateSetting; Cm is keybinding_overrides_v1 (character offset 3388285).
- openKeyboardShortcuts registry entry at character 3361037 explicitly configurable:true.

Conclusion: retained Conductor code's Help hint is override-aware, including live snapshot subscription; it is not a hardcoded default hint. Native visible remap behavior remains NOT RUN. No dynamic behavior, artifact freshness relative to currently installed app, or rapid-reopen parity is claimed.

Raw focused reads, including exact slices and import/export aliases:
- reference-focused.json
- reference-transitive.json
- reference-trace.txt

Prior whole-analysis gaps in ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367 remain: renderApp worker heap exhaustion and index parent graph retention budget. They no longer block this specific source lookup. No incomplete graph rescan performed.

This record describes the evidence-only pass. The subsequent focused Help correction and red→green checks are documented in README.md. #793, destination and exclusive native executor holds remain unchanged; no native/runtime operation was used.
