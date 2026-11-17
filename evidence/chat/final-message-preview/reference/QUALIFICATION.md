# Retained preview selector qualification

**Conductor Rebuild: message-ID selection is qualified; per-part mounted rendering is not.**

Asset: `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
Exact supplied upload verified on Reason Cloud. Ledger-reported origin: unchanged previously retained extraction asset, read/copied on authorized sven m5 max; no fresh extraction or installed identity observation.

## Source conclusions

### Per-message selection, not per-part selection
Att returns a Set populated only by e.add(o.id). na reads message content blocks, and ktt only asks whether any non-string text block has nonblank text. No block ID or index is returned. A mixed or multi-text message still contributes its message ID, not a chosen text-part ID.

### Segmentation precedes the reverse scan
hie calls Ett, calls Att on each segment, and unions the IDs. Ett starts a new segment before every user-role message if one is in progress, and ends a segment immediately after every content.type=result message, including a non-error result. Any final nonempty segment is retained.

### Ordinary assistant text is only one selection rule
Att walks each segment newest-to-oldest. It always selects user-role messages, content.type=error, error results (is_error exactly true), and messages containing tool_use ExitPlanMode or AskUserQuestion. It selects the latest ordinary text-bearing assistant only if no assistant text has yet been encountered and its inhibition flag is clear. Tool-only ordinary messages do not set the text-seen flag. Therefore this is not simply “keep only the last text message.”

### The inhibition flags matter
The source variables s/n/r respectively track a previously encountered text-bearing assistant, inhibition of ordinary text selection, and any selected message. When an error/ExitPlanMode/AskUserQuestion is encountered before any selected message in the reverse scan, n becomes true; that inhibits older ordinary text. Every text-bearing assistant sets s, even if it is not selected; every selected message sets r.

### Presentation caller applies one flag to each whole message
_jt obtains wB(t), computes hie over that ordered list, filters renderable messages through bB, then constructs {type:message,message:a,isPreviewMessage:s.has(a.id)}. Preview messages flush the pending collapse batch and are pushed individually; non-preview messages form collapse batches, with fewer than three returned individually. The selection set is computed before that visibility filter.

### Second caller also retains full message content
jOt filters aiMessages with Wp (cancelledAt exactly null), calls hie on that list, and for a selected d.id emits one record with content:d.content. It does not slice a selected message down to a text part. OOt and MOt account for unselected/subagent elision counts. KOt invokes this path only in its branch named concise; its other branch does not use hie.

### Do not substitute the separate last-text accessor
hjt requires assistant role and assistant content. If any ExitPlanMode tool_use is present it returns nothing. Otherwise it scans blocks backwards and returns the original (untrimmed) text string of the last nonblank text block. It is exported as mA, but neither Att/hie/Ett nor _jt/jOt/KOt calls it. _jt is separately exported as my. The consuming exported-module chunk was not qualified here.

## Source-derived cases (not executed)

- **One assistant message with text A, a tool_use and text B:** If selected, Att returns that one message ID; _jt marks that whole message. It does not itself choose B. hjt would separately return B unless ExitPlanMode is present; no call-chain link is established.
- **Two ordinary text-bearing assistant messages, no special barrier:** The later one is the default text candidate within its Ett segment; the earlier one is not selected by that default rule.
- **Text-bearing assistant followed by an ordinary tool-only assistant:** The tool-only message does not set s or n; the prior text-bearing message can remain the ordinary preview candidate.
- **Error / AskUserQuestion / ExitPlanMode at the reverse-scan tail:** That message is selected and, if no message has yet been selected, inhibits older ordinary text. Older special/user messages still have their own selection rules.
- **A successful result between two message runs:** Ett closes the first segment after the result, so ordinary preview selection is computed independently for each segment.

## Exact ranges and literal hashes

All ranges below are zero-based UTF-8 byte ranges [start,end), without normalization or a trailing newline. The manifest also records Unicode code-point ranges and all 33 spans.

- `Att`: [1149033,1149431), 398 bytes, SHA-256 `ad83bdd40d7ce09c1fab5180892be86b2786181336619db39f575926e2026a06`.
- `hie`: [1148755,1148849), 94 bytes, SHA-256 `8a711327171a0bed272961eb073858cef00d02da972697bd5ae912f8c11f4a7d`.
- `Ett`: [1148849,1149033), 184 bytes, SHA-256 `1cc88e4d4cbd22bd69303b64ea6ddf447f10347a4f35f65ea4fd245b64838ff1`.
- `na`: [1148057,1148224), 167 bytes, SHA-256 `7673a785165ce3c671210fa21a1e1a0a836ccda502ece16b01fe4cc93d6b87bb`.
- `Fa`: [1148224,1148305), 81 bytes, SHA-256 `26475e8ddf9c5f5292ca8e385429f41b1893267e4599b2fef7055b93f51a7407`.
- `ktt`: [1148596,1148681), 85 bytes, SHA-256 `de3c05b77b5051e130fab95650b8af0f7be153eba4b27d88910bd3d678685361`.
- `die`: [1148681,1148755), 74 bytes, SHA-256 `04936ad02551fcbfc2dff5bb11d147651464598b9ddda84892177c785050bb9c`.
- `_jt`: [1153746,1154246), 500 bytes, SHA-256 `1806109603caa218b2bc48dac7cb3ed18126790e4ec12f8d3bd578b765e17964`.
- `wB`: [1149946,1150034), 88 bytes, SHA-256 `2061ef5afd371daeae34b2e2acf120508bed1993c3b8c5ea1841da5cf7a422c5`.
- `SB`: [1150301,1150443), 142 bytes, SHA-256 `ebd2cfabf0eeb4c26546d2350c6d77dd02647448f4f88a0bb4f2a47ecd4a0ca3`.
- `hjt`: [1149431,1149671), 240 bytes, SHA-256 `6f8e647077e5e0ccd9f526c045a545e71e144a1a7526ef261524bc34242d8b6c`.
- `jOt`: [3118967,3119515), 548 bytes, SHA-256 `24054ba9df5ba234069cf3bd1d576237f2ac5522a85970232329e7af2ec1414f`.
- `KOt`: [3119515,3120590), 1075 bytes, SHA-256 `7ed5fe0c966e8e724bf24dd70cbc38ac1530d4a6aeffedc41e1e55a07fe19267`.
- `Wp`: [3115186,3115229), 43 bytes, SHA-256 `8a72e613414ff7e5c4039bc3247613a5fc7ac8852c51a7dda9be68caf960b614`.

## Verification

PASS: full asset length/digest; 30 complete function bodies plus one dependency constant and two exact export aliases; all 33 saved literal slices match the asset at their recorded UTF-8 ranges and hashes. Exact identifier occurrence inventory confirms the two direct in-bundle hie callers (_jt and jOt).
The locally written qualifier performs lexical slicing and hashing only. It does not evaluate the JavaScript or execute example inputs.
Product tests, current-main comparison, mounted/native/package checks: NOT RUN.

## Limits

- These are conclusions about exact retained source literals, not observations of the current installed Conductor app.
- No cross-chunk renderer consumer was supplied/qualified in this task. Per-part visual preview, rendering all versus one text block, copy-button wiring and mounted behavior are not established by these selectors alone.
- The recorded filename and asset digest do not establish current installed-app version, executable identity or package containment.
- No comparison to current OpenConductor main, defect diagnosis or behavioral RED was performed; BE7 owns that comparison.
- No vendor JavaScript was imported, evaluated or executed. No reference acquisition, REA/app operation, product/test edit, browser/native/provider execution, new watcher or acceptance dispatch occurred.
