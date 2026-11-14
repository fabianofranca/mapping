# setup.sh download — 2026-11-08 (epic `epic/setup-download`, PR #880, MCP 0.28.2 no change, schema v18)

## Corrigido

- The workspace's `setup.sh` shows the reason when it cannot download (HTTP code), retries on transient failures and, if the direct download of the release fails, uses the GitHub assets API before giving up. Whoever already has an old `setup.sh` keeps hitting the failure until a download succeeds: the fix only arrives with the new script (through self-update or the transition line in the workspace's `README.md`) and after a release that brings it; for GitHub's 504, the workaround with `gh release download` is in "Se o GitHub não responder", in the workspace's `README.md`.
