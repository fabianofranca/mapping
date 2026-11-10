# Revisão de propostas — 2026-11-09 (épico `epic/revisao-propostas`)

## Pendências

- `ReviewRow` (fase 2): o `treeitem` ganhou `id`, `aria-setsize` e `aria-posinset`, e a árvore (`ReviewLevels`) `aria-activedescendant`. Só semântica acessível, sem mudança visual: o preview do `ReviewRow` não precisa mudar; anotar no guia se ele descreve os atributos ARIA.

## Sincronização

Nada gravado no artefato **Mapping** neste fechamento: a única pendência (atributos ARIA do `treeitem` do `ReviewRow` e `aria-activedescendant` da árvore) é só semântica acessível, sem mudança visual, token nem ícone, e o preview do componente não muda. O artefato não foi aberto.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: atributos ARIA do `treeitem` do `ReviewRow` e `aria-activedescendant` da árvore: não é pendência (nem o guia nem o preview do `ReviewRow` descrevem atributos ARIA além de `role="treeitem"`; a condição da nota não se cumpre).
