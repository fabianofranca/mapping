# Avisos da revisão numa linha — 2026-11-06 (épico `epic/aviso-revisao-compacto`)

## Pendências

- **`Notice`, variante de linha (`size="line"`):** ícone de aviso, texto curto numa linha só (reticências se não couber, com a frase completa na dica `Tooltip` e, escondida, no `role="status"` para o leitor de tela), a ação (`Button` `sm`) e o X (`IconButton` `close` `sm`, nome "Dispensar"). Altura de `--control-height-sm` mais a borda; `--space-2` de preenchimento lateral, sem preenchimento vertical; fonte `--t-text-small`; sem quebra de linha. Os usos `md` e `sm` não mudam. Sem token novo. Arquivos: `src/ui/Notice.tsx`, `src/theme/review.css` (`.notice-box-line`, `.review-levels > .notice-box-line` com `--space-1` de margem superior). Atualizar o `Notice` no artefato (guia e prévia: a variante de linha, nos temas claro e escuro).
- **Lista da revisão (`ReviewLevels`):** os avisos de conflitos novos e de proposta substituída viram a linha acima, entre a linha dos filtros e o cabeçalho **Nível**, com o X. Textos novos: `review.stale.short`, `review.stale.showShort` e `review.superseded.short`. Arquivos: `src/ui/review/ReviewLevels.tsx`, `src/i18n/review.ts`. Atualizar o `ReviewRow` (lista da revisão com o aviso em linha, a 240 px de janela).

## Sincronização

Gravado no artefato **Mapping** em 2026-11-06, no fechamento do épico (versão 47; o índice junto, com `lastChange`):

- `Notice` (guia e prévia): a variante de linha (`size="line"`, prop `hint`), com as medidas e o X; dois cartões na prévia (conflitos novos e proposta substituída, esta com reticências).
- `project/components/bundle.css`: `.notice-box-line` e as regras dela, e `.review-levels > .notice-box-line`.
- `ReviewRow` (guia): o aviso em linha entre os filtros e o cabeçalho **Nível**, com as alturas medidas.
- `project/design-system.json`: só o `lastChange`.

## Ficou sem gravar

- A prévia do `ReviewRow` não ganhou um cartão com o aviso em linha (só o guia e o `Notice`); o aviso em linha aparece no cartão do `Notice`.
- As prévias não foram conferidas no visualizador real do artefato, nem o contraste recalculado (sem cor nova).
