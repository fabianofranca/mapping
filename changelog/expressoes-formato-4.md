# Expressões que calculam no formato 4 — [Não lançado] (épico `epic/expressoes-formato-4`, PR #0, MCP 0.31.0, schema v18)

## Adicionado

- Os componentes de `formatVersion` 4 fazem conta nas expressões: `$add`, `$sub`, `$mul`, `$div`, `$mod` (resto com o sinal do divisor), `$round`, `$floor`, `$ceil`, `$abs`, `$min`, `$max`, `$clamp` e `$sin`/`$cos` (em graus), onde vale um número e dentro de `$concat`. Operando vazio, texto não numérico ou divisão por zero fazem a operação não produzir valor (vale o padrão do lugar).
- Comparações `$gt`, `$gte`, `$lt` e `$lte` nas condições (`$if`, `visible`, `$and`, `$or`, `$not`); operando sem valor dá falso.
- Número no texto: um número não inteiro no `$concat` sai com até 6 casas, sem zeros à direita (`0.1 + 0.2` vira `0.3`).
- O validador confere operando literal, aridade e a versão (`só é permitido com formatVersion 4` nas versões 1 a 3); o `docs/component.schema.json`, o `docs/COMPONENT-FORMAT.md`, a skill `spec-author` e o `docs/AGENT-GUIDE.md` descrevem as chaves novas.
