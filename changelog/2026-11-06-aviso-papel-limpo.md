# Aviso de papel limpo — 2026-11-06 (épico `epic/aviso-papel-limpo`, PR #600, MCP 0.19.0, schema v14)

## Adicionado

- MCP: o `plan_changes` e o `propose_changes` avisam, antes de gravar, quando um `update_annotation` com `owner` limpa o papel da anotação sem o passo pedir (a nova dona não oferece o papel, ou `owner: null`). O passo do `summary` ganha `; papel "Clique" limpo` e `warnings` traz um aviso `role-cleared` por anotação (`op`, `annotation`, `role`, `roleName`, `message`). O comportamento não muda: o papel continua sendo limpo na mesma operação, e o aviso não bloqueia nada. Não avisa quando a anotação não tinha papel, quando a nova dona oferece o mesmo papel ou quando o mesmo passo traz `role`.
