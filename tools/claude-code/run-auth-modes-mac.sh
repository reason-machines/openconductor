#!/usr/bin/env bash
# Real Claude Code turns in the built app on a Mac: the import path, the CLI
# card (Claude subscription login) and the API key card (key from 1Password
# via OC_E2E_ANTHROPIC_OP_REF). See tools/auth/run-auth-modes-mac.sh.
# Usage: tools/claude-code/run-auth-modes-mac.sh OUT [APP]
exec "$(dirname "$0")/../auth/run-auth-modes-mac.sh" claude "$@"
