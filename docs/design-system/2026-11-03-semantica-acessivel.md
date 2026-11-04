# Semântica acessível — 2026-11-03 (épico `epic/semantica-acessivel`)

## Sincronização

Versões 21 (conteúdo) e 22 (índice) do artefato. **`Menu`:** o guia e o preview descrevem o teclado do `MenuPopover` (itens `menuitem`, foco no primeiro, ↑/↓ circulares, Esc devolve o foco) e o `aria-haspopup` do gatilho. **`Revisao.md`, `ReviewHeader`, `ChangePopover`, `DecisionControl`, `ReviewBar`, `ZoomField`:** nome acessível `<texto visível>: <alvo>`, estado só no `aria-pressed`, conflito na descrição; os previews trocaram só o `aria-label`. **`Segmented`:** o guia descreve o grupo dos Detalhes; o CSS e o preview ficaram pendentes (ver Pendências). `Atalhos.md` não reproduz o texto do rótulo e não mudou.

## Ficou sem gravar

O fechamento do épico gravou no artefato o que dava (ver o histórico). Ficou sem gravar:

- **`Segmented`, CSS e preview.** O guia já descreve o grupo dos Detalhes (quebra de linha, borda própria por opção), mas o `project/components/bundle.css` do artefato só tem `.props-value > .segmented { align-self: flex-start; }`. Faltam as regras de `src/theme/details.css` (`flex-wrap`, `gap`, `border: 0`, `overflow: visible`, borda por `.segmented-item`, `.segmented-invalid .segmented-item`, `.segmented-text { white-space: nowrap }`) e um exemplo do `Segmented` dentro de `.props-value` em coluna estreita no preview. Conferir o contraste nos dois temas ao gravar.
- **Paleta da biblioteca.** O botão de adicionar do tipo tem nome acessível `{label}: {name}` (`library.addType`, `src/ui/LibraryPalette.tsx`), mas o artefato não tem guia da paleta (`LibraryPalette`/`Library`; só `LibraryIssueList`). Criar o guia é decisão do dono, como em "Com forma visível e sem componente no DS".
