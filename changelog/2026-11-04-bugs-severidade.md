# Bugs sem duplicadas e com severidade — 2026-11-04 (épico `epic/bugs-severidade`, PR #412, MCP 0.13.0, schema v13)

## Alterado

- Antes de abrir uma issue `bug`, o agente procura uma igual ou que agrupe o defeito, nas abertas e nas fechadas: o igual vira comentário na existente, o agrupável entra nela como item (ou fica relacionado, se ela já estiver em andamento) e o que voltou depois de fechado vira issue nova que cita a antiga. A busca fica registrada no corpo.
- Todo `bug` aberto leva um rótulo de severidade: `severity: high`, `severity: medium` ou `severity: low`, com a correspondência da escala do relato de teste (bloqueia e alta → high, média → medium, baixa → low). Os bugs abertos foram classificados: #405 e #372 médios, #371 baixo.
