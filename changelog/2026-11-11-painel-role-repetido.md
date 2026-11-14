# Repeated registration in the queue panel — 2026-11-11 (épico `epic/painel-role-repetido`, PR #1635, MCP 0.34.3 unchanged, schema v18)

## Corrigido

- `painel.py role <pasta> <papel> <id>` with the `<id>` that is already the one registered for the role (`coordenador` or `supervisor`) no longer changes anything: `n` does not add 1, `previous` does not become its own id, `at` and `link` stay as they were and `meta.json` is neither written nor marked as unpublished. The output says `<papel> <n>: <id> já é o registrado; nada mudou` (and `alterados: nenhum` outside an `apply`), with status 0, and inside the `apply` the repeated line does not write and the rest of the batch writes. Before, the coordinator that registered itself again after the session swap spoiled the panel ("coordenador 4" for the third) and lost the id of the previous session.
- Skill `implementar-fila`: "Painel" describes `meta.roles.<papel>` with the `previous` and the repeated registration with no effect; item 4 of "Na sessão nova" only asks for the registration when `roles` does not show the new session as `coordenador`.
