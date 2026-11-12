# Grade hug sob pai max-content/min-content provada por teste — 2026-11-12 (épico `epic/grade-hug-intrinseco`, PR #1768, MCP 0.38.2, schema v19)

## Alterado

- A grade `hug` com `minColumnWidth` sob pai `max-content`/`min-content` fica provada por teste (`tests/model/components/huggedCounts.test.ts`, #1749), com a mesma contagem de trilhas do pai de mesma largura em px, em `column` e `row` e nas duas ordens de medição. O comentário do `huggedCounts` em `src/model/components/instantiate.ts` deixa de dizer que esse pai ainda pode errar. Nada muda para quem usa a app ou o MCP.
