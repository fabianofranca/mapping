# Sincronia do design system — 2026-11-02 (épico `epic/sincronia-ds`)

## Sincronização

Primeira sincronização pelo processo. Versões 14 (conteúdo) e 15 (índice) do artefato. **Proposto com componentes:** `Revisao.md` e `Canvas.md` passaram ao presente (saíram "ainda não implementado" e a lista "Para implementar"), e `ComponentDrawing`, `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader` e `OtherChanges` ganharam a marca de criada e o fantasma nas duas visões. **Sugestões no campo:** `TextField` ganhou as seções "Sugestões" e "Estados da lista" e o preview ganhou três cartões; `PropertyGrid`, `DataGrid` e `ReferenceField` ganharam o vocabulário sugerido e o `linkedRef`. **Imagens remotas:** `ComponentDrawing` e `Canvas.md` ganharam o nó `image`; `SettingsDialog` ganhou a seção Privacidade, com as quatro chaves e a lista de origens. **Material 3:** `CodeDefinitions` ganhou a prop `values` e a resolução da variante; `CatalogPage` ganhou a tabela de variantes. **Marcação pai:** `MultiSelectionPanel` ganhou o botão Envolver; `LayerGroup` e `Breadcrumbs` ganharam a dica no nome cortado. **Tokens:** entraram `size-grid-col-min` e os papéis `control-height`, `control-height-sm`, `control-radius`, `control-icon`, `control-check` e `row-height`.

### Correções do próprio registro

A sincronia de 2026-11-02 achou três erros na lista de pendências que a DS1 montou, todos já corrigidos acima:

- A dica (`title`) no nome cortado foi atribuída ao `TreeRow`, que já estava correto (lá só a linha da seta tem `title`). O componente certo é o `Breadcrumbs`, o caminho acima do canvas.
- O `KeyValueGrid` foi listado como afetado pelo vocabulário sugerido. As células de chave e valor da anotação livre **não** têm lista: o vocabulário é dos campos e colunas `string` da especialização. O guia ganhou esse esclarecimento.
- A pendência dizia que a string `review.legend.rejected` não existia mais em `src/`. A chave existe (`src/i18n/review.ts`); o que saiu do texto dela foi o "(só em Atual)".
