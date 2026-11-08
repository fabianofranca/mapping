# Skill de detalhamento do backlog — 2026-11-08 (épico `epic/skill-detalhar`, PR #938, MCP 0.28.2, schema v18)

## Adicionado

- Skill `/detalhar-backlog` do Claude Code (`.claude/skills/detalhar-backlog/`), para o fluxo de entrega. Primeiro, uma sessão Opus propõe juntar issues num épico só, para ter menos versões pequenas do MCP e uma rodada do testador para várias. Depois, sessões Opus detalham como etapas `ready` todas as issues `roadmap` e `bug` abertas que ainda não estão `ready`, até 3 por vez. As decisões de produto chegam ao dono pelo seletor de perguntas, sempre com uma opção recomendada. Cada etapa sai com a linha `**Depende de:**`, que dá a ordem da implementação.
