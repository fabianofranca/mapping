# AGENTS.md do workspace acertado — 2026-11-08 (épico `epic/agents-md-biblioteca`, PR #873, MCP 0.28.0 sem mudança, schema v18)

## Corrigido

- O bloco de regras do `AGENTS.md` do workspace dizia que `propose_changes` recusa biblioteca (pacote v4). Agora diz o que o servidor faz: a pasta validada vai à pessoa, que a aplica na app ou pede que o agente a proponha com `apply_specialization` (ou `update_specialization`, para versão maior), com `file` = a pasta; numa atualização, `plan_library_update` mostra o impacto antes. A tabela "Estrutura" também diz o que o `setup.sh` faz com `.claude/skills/spec-author` (link para a pasta da skill, ou cópia onde link não existe). O texto chega aos workspaces pelo `setup.sh` da próxima release do MCP.
