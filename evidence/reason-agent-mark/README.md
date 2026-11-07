# Official Reason agent mark

Source: reason-machines/monorepo at f33c0f0d339b11cf3016a1a0e322e2fc09c895b9,
apps/web/public/reason-agent-mark/reason-mark-mask.svg (read-only attachment).
Copied byte-for-byte to src/assets/reason-agent-mark/reason-mark-mask.svg.
SHA-256: 165ebc1307e4f84bb69118d32d97d3a9e6ab82ddde1f2f0a63b2c62af7c176e1.

ReasonMark imports the unmodified source, supplies currentColor and scopes the
mask ID per React instance. No replacement geometry or brand color is introduced.

## Existing identity render paths

- Settings Agents: Reason tab and Reason account authentication card share ReasonMark.
- Experimental Cloud setup: existing ReasonMark re-export receives the same mark.
- ChatModelPicker: explicit agentForPick identity, not model-provider inference,
  selects the Reason mark for every Reason-hosted model, including Auto and BYOK.
  Local Codex and Claude Code entries retain their existing glyphs.
- ChatEmptyState transcript attachment chips: use the chat's actual agent, including
  Reason, instead of mapping every non-Codex chat to Claude.

## Audited surfaces without Reason identity glyphs

- WorkspaceView MainTabs renders unread dots and text, not agent glyphs.
- SidebarWorkspaceRow renders repository, workspace status, matrix and shortcut
  indicators. Sidebar/SidebarSections do not add a Reason agent badge.
- ToolRows renders semantic tool/status icons. Delegated SubagentRow uses the
  task/status icon; CollabRow is Codex collaboration. Neither is a Reason identity.
  These are preserved, not claimed as Reason mark visual exercises.
- FirstRunOnboarding and SignIn are app-brand surfaces owned by the separate app
  icon change. Home OPENCONDUCTOR pixel wordmark is untouched.

## Verification

- Production build/typecheck and color-literal check.
- Full frontend Node test suite.
- tests/e2e/reason-agent-mark.e2e.mjs: official source hash, built Settings tab +
  account card, built workspace model picker, dark/light themes, distinct inline
  mask IDs and mask references, two eye strokes, currentColor and actual dimensions.
  Run with node --test after npm run build; it starts Vite preview on E2E_PORT
  (default 4288), or uses REASON_MARK_BASE_URL. E2E_OUT saves screenshots.
- Cloud Chrome images are supplemental browser evidence only, not native macOS
  proof. Native before/after built-app screenshots are coordinated separately and
  must be attached to the PR; this file does not attest they have been captured.
