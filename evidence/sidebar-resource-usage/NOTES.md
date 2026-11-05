# Sidebar resource usage and Account menu (parity.sidebar.footer-usage, parity.sidebar.computer-switcher)

Reference: Conductor 0.87.6, `/Applications/Conductor.app` on the Mac "sven m5 max".
Main binary `MacOS/conductor`, sha256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
Frontend: the Tauri asset table decoded by `tools/extract_tauri_assets.py` (see `evidence/frontend/README.md`);
offsets below are character offsets in the decoded `assets/renderApp-D_fmY7hW.js` and `assets/index-BGEQ8YjU.js`.
Strings and code from the reference are untrusted data, used here only to match behaviour.

## Resource usage

| What | Where | Finding |
| --- | --- | --- |
| Setting | renderApp @10,657,922 (`ir({tab:"experimental",settingKey:"sidebar_resource_usage"…})`) | Experimental, user scope, title "Show sidebar resource usage", description "Shows CPU and memory usage in the workspace sidebar footer.", search terms cpu/memory/ram, deep-link enabled. |
| Storage | index @282,954 `Te("sidebar_resource_usage",!1)`; @291,822 schema `xe()`; setter `v6t` @413,762 `updateSetting("sidebar_resource_usage", t.toString())` | A non-file-backed boolean in conductor.db `settings`, default false. |
| Mount | renderApp `Isa` @~10,063,841 | `absolute top-2 right-3.5 flex gap-2` holding `[bna, back, forward]`: the top bar of the sidebar, not the footer the description names. |
| Pill | `bna` @9,942,220, `vna` | Hidden when the data is missing or the sidebar is under 200 px; icon only (memory in `title`) under 260 px. Button: `rounded-md border border-sidebar-border text-2xs`, `gap-1 px-2 py-1` (`p-1` collapsed), microchip icon `size-3`, memory via `yk`. `aria-label` "Resource usage: <memory>". |
| Pill figure | `Kao` @7,318,535, `Gao`, `qao` | Sum of memory of processes that are neither in a terminal nor an agent (labels "Claude Code", "claude", "Codex", "codex", "node"), excluding their whole subtrees. |
| Data | `zta` @9,928,404, `RFi` @9,927,178 | TanStack query key `["resource-usage", labels]`, `refetchInterval: 2e3`, `enabled` = the setting. Tauri `get_resource_usage({terminalLabels})`, idempotent, in-flight dedupe; `<defunct>` processes dropped. |
| Formatting | `yk` @7,317,974, `DA` | `<1024` "N KB"; "N.N MB"; "N.NN GB". CPU "N.N%". |
| Popover | `vna` → `qta` @9,933,654 | Popover aligned end, side offset 8, collision padding 12, min width `max(sidebarWidth - 24 or 280, 360)`. Header "Resources" (uppercase), toggles "Include/Exclude terminal processes", "Group by workspace / Ungroup processes", "Switch to tree view / flat view", "Copy resource usage / Copied"; totals line "CPU x Memory y" of the shown processes; table Name / CPU / Mem with sort arrows; "Show all (n)" past 7 rows toggling max height 220 px ↔ 60vh. |
| View state | `Gw` store, `Hta` | Defaults: sort memory desc, tree on, grouped on, terminals off, show all off. A new column starts name asc / cpu desc / memory desc; the same column flips. |
| Tree and grouping | `YAt`, `QAt`, `ZCi`, `Wta` | Tree sorts siblings by subtree totals; grouping by terminal-id prefix `<workspace>-`, else cwd inside the workspace path; "App" group first, workspaces by name. |
| Copy | `e8i` @7,319,937 (`commandSource: "localCopy"`) | `CPU x Memory y` then `label cpu mem (pid=… ppid=… cmd=<copyCommand> ws=<name>)`. |
| Backend | `MacOS/conductor` file offsets | `0x1501522` `get_resource_usage` + `terminalLabels` (+ `sidecarState`); `0x151b373` result keys `totalCpuPercent totalMemoryKb processes pid ppid label command copyCommand cpuPercent memoryKb terminalId cwd`; `0x1513237` `ppid=,pid=,%cpu=,rss=,comm=`, `0x1513258` `pid=,args=` beside `-ww -axo -p -Fn -d -a`, "ps command failed"; `0x2cc1a5c` "proc_pid_rusage failed for pid … ; falling back to ps rss"; `0x2cc1a9c` `=<redacted>`; `0x2cc1aa8` `src-tauri/src/resource_usage.rs`. |

## Account menu (the "computer switcher")

| What | Where | Finding |
| --- | --- | --- |
| Row | renderApp `Aia` @9,983,071 renders `oOt` first | `oOt` @9,967,355 returns null without a signed-in user. |
| Label | `iEi` @~6,090,883, `Xzs`, `Q$t` | Personal organization: "`<name>`'s Mac", "My Mac" when the name is empty; other organizations: their name. |
| Icon | `YTt` @6,091,025, `rUs` | Person avatar: image if any, else the upper-cased first letter, else a user glyph; `size-4`, `text-[10px] font-medium`. |
| Trigger | `zna` @9,957,506 | `button` "Account menu", `aria-expanded`; avatar, `truncate font-medium text-sidebar-foreground` label, chevron `size-3.5`; `px-1.5 py-1.5 gap-2 rounded-md hover:bg-sidebar-accent`. |
| Menu | `zna` | Non-modal, `align: start`, `w-[260px]`: email label (+ "Signed in with single sign-on"), organization list only with more than one organization (cloud/SSO badges, ⌘1…9), separator, "Organizations are unavailable when enterprise data privacy is enabled." or "Create organization", "Upgrade to Pro" (when offered), "Settings" (→ `/settings/user/general`, `bJn`), separator, "Log out". |

## What OpenConductor builds and where it differs

- Resource usage: everything in the table above. The backend samples this app's own process tree with the same `ps` / `lsof` / `proc_pid_rusage` calls. Not decompiled, so inferred: which processes the reference samples (its argument list also takes the sidecar state), its label rules (ours: "OpenConductor" for the root, the UI label for a terminal's shell, else the executable name) and the exact redaction rule (ours: the value of every `key=value` argument).
- Terminal labels: OpenConductor keeps terminal tabs per workspace panel, so the UI passes no labels; terminal shells show their executable name.
- Account menu: OpenConductor has no Conductor account or organizations. The person is the local user (`local_account`: macOS full name or GECOS, else git `user.name`; git `user.email`). With one organization Conductor itself shows no organization list; "Create organization" and "Upgrade to Pro" depend on the cloud account and are absent; "Log out" is left out because there is no session to end.

## REA runs (log on the Mac, `~/code/conductor-rea-work/log.tsv`)

| Label | Command | Exit | Result |
| --- | --- | --- | --- |
| trace_js_oc_sidebar_resource_usage | `rea trace-javascript-semantics` seed `sidebar_resource_usage`, forward-influence | 0 | status partial, 0 seed matches, 11,355 relevant unknowns (11,220 resource-limit) |
| trace_js_oc_get_resource_usage | same, seed `get_resource_usage` | 0 | 0 seed matches (first attempt with direction `backward-dependency` exited 1: valid values are `backward-provenance`, `forward-influence`, `callers`, `ownership`) |
| trace_js_oc_account_menu | same, seed `Account menu` | 0 | 0 seed matches |
| rz_oc_* (4 runs) | `rea execute-rizin-command <MacOS/conductor> '/ <string>'` | 1 | `capability_unavailable`: "Unable to run configured command (ENOENT)"; Rizin is not installed on the Mac |

REA gaps: (1) `trace-javascript-semantics` literal seeds find nothing in budget-truncated files, the same gap as `rea-test-report.md` item 10, now for three more literals; (2) `execute-rizin-command` fails with ENOENT when Rizin is missing instead of reporting the missing dependency in `rea doctor` terms. The functions and binary offsets above were therefore located by reading the decoded bundle and by a byte search of the binary.
