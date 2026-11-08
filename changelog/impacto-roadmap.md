# Impacto nas issues roadmap — [Não lançado] (épico `epic/impacto-roadmap`, PR #847, MCP 0.28.0, schema v18)

## Alterado

- Toda issue `roadmap` nasce com um rótulo de impacto, `impact: high`, `impact: medium` ou `impact: low`, e a linha `Impacto: <nível> — <porquê>` no corpo, como todo `bug` nasce com a severidade. O critério é o quanto o item muda o uso da ferramenta e ajuda a função dela, contando também o custo recorrente do fluxo de entrega; o tamanho do trabalho não conta. O rótulo fica quando a `roadmap` vira `ready` e `in-progress`; o `bug` leva só a severidade, e a `roadmap` que vira `bug` troca um rótulo pelo outro.
- As issues abertas foram acertadas: a #833 recebeu `impact: medium` e a #538, que é `bug`, perdeu o `impact: low`.
