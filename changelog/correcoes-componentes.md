# Correções no motor de componentes — [Não lançado] (épico `epic/correcoes-componentes`, PR #1173, MCP 0.28.9, schema v18)

## Corrigido

- Componentes: `visible` e `italic` com `{ "$field": "x", "default": true }` agora usam o `default` quando o campo está vazio (o nó não some mais).
- Componentes: Arrumar, posicionar uma filha nova e o `hug` do slot passam a ler o `gap` e o `padding` do slot escritos como `$token`, com os tokens do modo do desenho (antes ficavam em 0).
- `mapping-viewer`: `parseScreen` mantém as tabelas dos valores (round-trip com `serializeScreen` sem perda) e recusa `parentId` em auto-referência, ciclo ou inexistente, e `id` repetido; `descendantsOf` não trava mais com ciclo.
- Troca de imagem: trocar o arquivo por outro do mesmo tamanho não altera mais nenhum retângulo, e a reescala respeita o tamanho mínimo de cada marcação de componente (sem inflar a 8 px); a que cresceu por causa do mínimo vai para revisão (MCP 0.28.9).
- Componentes: o medidor de texto do canvas devolve a largura real da linha mais larga, e um texto `fill` dentro de um quadro `hug` deixa de ocupar o limite inteiro.
