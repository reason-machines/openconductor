#!/usr/bin/env bash
# Real Codex turns in the built app on a Mac: the import path, the ChatGPT
# card (ChatGPT subscription login) and the API key card (key from 1Password
# via OC_E2E_OPENAI_OP_REF). See tools/auth/run-auth-modes-mac.sh.
# Usage: tools/codex/run-auth-modes-mac.sh OUT [APP]
exec "$(dirname "$0")/../auth/run-auth-modes-mac.sh" codex "$@"
