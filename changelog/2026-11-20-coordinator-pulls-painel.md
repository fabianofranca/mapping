# Coordinator pulls on any skill-folder change — 2026-11-20 (épico `epic/coordinator-pulls-painel`, PR #2355, MCP unchanged, schema v21 unchanged)

## Corrigido

- `implementar-fila`, "Session switch" › "New skill on `main`": the check covers the whole `.claude/skills/implementar-fila/` folder, not only `SKILL.md`. A change only in `painel/` is small by definition: `git pull`, no reread and no session switch, with the proof `painel.py <commit>: atualizado` in the `log`. A running coordinator no longer computes `vagas`, conflicts and the canary verdict with an old `painel.py` (#2353).
- `supervisionar-fila`, "Reading the sources": `painel.py` runs from `main` (`git show origin/main:…` into the scratchpad), not from the session's own checkout (#2353).

## Alterado

- A coordinator that takes over writes one `log` line with the commit and date of the `painel.py` it runs, so a stale script shows without a check (#2353).
