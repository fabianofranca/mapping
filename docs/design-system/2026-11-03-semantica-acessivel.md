# Semântica acessível — 2026-11-03 (épico `epic/semantica-acessivel`)

## Sincronização

Versões 21 (conteúdo) e 22 (índice) do artefato. **`Menu`:** o guia e o preview descrevem o teclado do `MenuPopover` (itens `menuitem`, foco no primeiro, ↑/↓ circulares, Esc devolve o foco) e o `aria-haspopup` do gatilho. **`Revisao.md`, `ReviewHeader`, `ChangePopover`, `DecisionControl`, `ReviewBar`, `ZoomField`:** nome acessível `<texto visível>: <alvo>`, estado só no `aria-pressed`, conflito na descrição; os previews trocaram só o `aria-label`. **`Segmented`:** o guia descreve o grupo dos Detalhes; o CSS e o preview ficaram pendentes (ver Pendências). `Atalhos.md` não reproduz o texto do rótulo e não mudou.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Segmented`, CSS e preview: regras de `.props-value > .segmented` (quebra de linha, borda por opção, `.segmented-text`) no `bundle.css` e um exemplo em coluna estreita no preview.
- Passou para o registro do épico `epic/sincronia-ds-2`: Paleta da biblioteca (`LibraryPalette`): guia sem componente no DS; já está em "Com forma visível e sem componente no DS", decisão do dono.
