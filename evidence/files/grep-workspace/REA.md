# grep_workspace — REA evidence

## Source

**Artifact:** Conductor 0.87.6, `index-BGEQ8YjU.js`
(SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`,
retained in `.rea-work/retained-reference/index-BGEQ8YjU.js` of the
DXE source closure attachment `conductor-dxe-source-closure.tar`).

## Call site (bytes 2265460–2266400)

```js
// Local branch of Tmt (async function for workspace grep):
local: async () => {
  try {
    return FK(await oe("grep_workspace", n))
  } catch (r) {
    throw typeof r === "string" && r.startsWith(OK) ? new MK(r) : r
  }
}
// n = { query: e, workspacePath: t.workspacePath,
//        isRegex: s.isRegex, caseSensitive: s.caseSensitive,
//        wholeWord: s.wholeWord }
// FK = t => ({ matches: t.matches, truncated: t.truncated,
//              filesSearched: t.files_searched })
// OK = "Invalid pattern: "   (prefix checked in MK constructor)
```

## Schema (bytes 1404081–1404500)

```js
// Request (remote route only; local uses the five fields in n above):
b({ type: w("grepWorkspaceRequest"),
    auth: f(), query: f(),
    isRegex: H().optional(), caseSensitive: H().optional(),
    wholeWord: H().optional(), maxResults: F().optional() })

// Submatch:
const Zot = b({ start: F(), end: F() })

// Match entry:
const eat = b({ relative_path: f(), line_number: F(),
                line_text: f(), submatches: U(Zot) })

// Response:
const tat = b({ type: w("grepWorkspaceResponse"),
                matches: U(eat), truncated: H(), files_searched: F() })
```

## Implementation notes

- `start` / `end` are UTF-8 byte offsets within `line_text`
  (Rust `regex::Match::start/end`).
- An error string starting with `"Invalid pattern: "` is caught by the
  frontend and surfaced as an invalid-pattern user error (`MK`).
- Binary files (containing a null byte) are silently skipped, matching
  ripgrep's default behaviour.
- Maximum 1 000 matching lines before `truncated = true`.

## Gap identifier

REA obligation ledger `rol_ba2a4881…` (`ws.file-tree-search`).
Previously recorded as *unimplementable from source alone* (required
Ghidra Rust binding). This evidence was obtained from the retained
minified frontend bundle without native Mac access or Ghidra analysis,
and provides a complete interface contract for a correct implementation.
