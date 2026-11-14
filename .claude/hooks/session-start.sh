#!/bin/bash
# SessionStart hook of the Claude Code cloud sessions: installs the dependencies
# so the gates (npm run lint, typecheck, test, build) run without a manual step.
# It only acts in a remote session (CLAUDE_CODE_REMOTE); locally it does nothing. It is
# idempotent: `npm install` with the package-lock is a quick no-op when everything is
# already installed. It runs synchronously: the session only starts with the dependencies
# ready, which a session without the owner (for example, the overnight development) requires.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
npm install --no-audit --no-fund --prefer-offline --loglevel=error
