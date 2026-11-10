# Expressões que calculam no formato 4 — [Não lançado] (épico `epic/expressoes-formato-4`, PR #1487, MCP 0.31.0, schema v18)

## Adicionado

- Os componentes de `formatVersion` 4 fazem conta nas expressões: `$add`, `$sub`, `$mul`, `$div`, `$mod` (resto com o sinal do divisor), `$round`, `$floor`, `$ceil`, `$abs`, `$min`, `$max`, `$clamp` e `$sin`/`$cos` (em graus), onde vale um número e dentro de `$concat`. Operando vazio, texto não numérico ou divisão por zero fazem a operação não produzir valor (vale o padrão do lugar).
- Comparações `$gt`, `$gte`, `$lt` e `$lte` nas condições (`$if`, `visible`, `$and`, `$or`, `$not`); operando sem valor dá falso.
- Número no texto: um número não inteiro no `$concat` sai com até 6 casas, sem zeros à direita (`0.1 + 0.2` vira `0.3`).
- O validador confere operando literal, aridade e a versão (`só é permitido com formatVersion 4` nas versões 1 a 3); o `docs/component.schema.json`, o `docs/COMPONENT-FORMAT.md`, a skill `spec-author` e o `docs/AGENT-GUIDE.md` descrevem as chaves novas.
- `$rows` (o número de linhas de um campo `table`) e `$size` (a largura ou a altura da instância, que segue o redimensionamento da marcação) nas expressões de número, e o `repeat` por contagem: `count` no lugar de `field`, com `{ "$field": "$index" }` para o índice da linha (também no `repeat` por `field`) e o teto de 1000 linhas (aviso `repeat limitado a 1000 linhas: <nó>`).
- Âncoras por expressão: `left`, `right`, `top` e `bottom` aceitam uma expressão de número e `centerX` e `centerY` uma condição; a que não dá número vale como âncora ausente. Tudo só na `formatVersion` 4 do componente (`só é permitido com formatVersion 4` nas anteriores).
- `rotation` em qualquer nó (menos na raiz) do componente `formatVersion` 4: gira o nó em graus, no sentido horário, em volta do centro da caixa, só no desenho. Os filhos e o recorte de um quadro giram junto; o hover segue a forma girada; layout, `hug` e Arrumar não mudam. A app, o visualizador e o PNG do MCP (`render_marking`, `render_container`, `get_marking_image`) desenham igual, e o recorte girado também. Numa `formatVersion` menor que 4: `só é permitido com formatVersion 4`; na raiz: `não vale na raiz`.
- Roteiro R25.75 a R25.78: a barra por `$size`/`$mul` e o retângulo girado 45° no PNG do MCP e na app.

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 1949696 para 1966080 bytes, pela regra do orçamento.
