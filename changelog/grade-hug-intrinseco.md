# Grade hug sob pai max-content/min-content provada por teste — [Não lançado] (épico `epic/grade-hug-intrinseco`, PR #0 provisório, MCP 0.38.2 provisória, schema v19)

## Alterado

- A grade `hug` com `minColumnWidth` sob pai `max-content`/`min-content` fica provada por teste (`tests/model/components/huggedCounts.test.ts`, #1749), com a mesma contagem de trilhas do pai de mesma largura em px, em `column` e `row` e nas duas ordens de medição. O comentário do `huggedCounts` em `src/model/components/instantiate.ts` deixa de dizer que esse pai ainda pode errar. Nada muda para quem usa a app ou o MCP.
