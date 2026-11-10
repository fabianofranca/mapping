# Migração dos papéis do vínculo — 2026-11-06 (épico `epic/migracao-papeis`)

## Pendências

- **`UpdateImpact`** (PM2): linhas novas no diálogo de atualização, sem componente, token nem ícone novos: os passos de papel ("Renomear o papel A → B em T", "Remover o papel R em T (limpar o papel)" e "(desvincular)", "Dar o papel R aos filhos de T" e, com `childType`, "aos filhos C de T"), a contagem "N desvinculada(s)" ao lado das contagens do passo, as perdas "papel R limpo" e "vínculo desfeito (papel R)" e o total com "e N vínculo(s)" no fim de "Esta atualização apaga …". Atualizar o exemplo do `UpdateImpact` no artefato com um passo de papel e a nova perda.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-06, no fechamento do épico (versão `1793938034-b403`; o índice por último, com `lastChange`):

- `UpdateImpact`, guia (`project/components/UpdateImpact/README.md`): parágrafo novo "Passos de papel do vínculo" (rótulos dos três passos, a contagem "N desvinculada(s)", as perdas "papel R limpo" e "vínculo desfeito (papel R)" e o total com "e N vínculo(s)"), o "Não faça" e o teste em "No código". O papel limpo conta como valor no total; só o desvincular entra em "e N vínculo(s)"; `rename-role` e `set-role` nunca geram perda.
- `UpdateImpact`, prévia (`preview.html`): três cartões novos ao fim da grade ("Passos de papel e papel limpo", "Desvincular: vínculo desfeito" e "Dar o papel aos filhos (set-role)"), sem mexer nos cartões antigos.
- `project/design-system.json`: só o `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: a conferência do cartão `@dsCard height=1200` da prévia do `UpdateImpact` no visualizador real, nos dois temas.
- Passou para o registro do épico `epic/sincronia-ds-2`: nada a gravar: o guia do `SpecsDialog` só cita o `UpdateImpact` em geral e as strings en-US não aparecem nas prévias (o DS é pt-BR).
