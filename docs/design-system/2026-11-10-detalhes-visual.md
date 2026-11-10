# Passada visual dos Detalhes — 2026-11-10 (épico `epic/detalhes-visual`)

## Pendências

- **`Choice` na Lista (`DataGrid`):** a caixa **Só incompletas** passa a levar o ícone `warning` (SVG de contorno) no rótulo, no lugar do glifo ⚠ fixo. Arquivos: `src/ui/ListView.tsx`, `tests/components/bottomWindows.test.tsx`.
- **Diálogo de tipo dos Detalhes (`TypePicker`):** a lista vazia mostra a mensagem do motivo (`emptyMessage`, chaves `typed.empty.*`) no lugar do aviso genérico; o `LinkDialog` não muda. Arquivos: `src/ui/TypePicker.tsx`, `src/ui/AnnotationsPanel.tsx`, `src/ui/offeredTypes.ts`.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-10: versão 73 (`1794311275-062c`), numa publicação só, com o índice por último e `lastChange` "Claude Code (épico detalhes-visual, DV1)":

- `components/DataGrid/preview.html`: a caixa **Só incompletas** passa a levar o ícone `warning` (SVG de contorno, os mesmos paths do código) no lugar do glifo ⚠; o nome acessível continua sendo o texto "Só incompletas".
- `components/DataGrid/README.md` (item em "Estados" sobre o ícone e o nome acessível) e `components/Choice/README.md` (o ícone `warning` como exemplo de rótulo em nó).
- `components/Dialog/README.md`: a escolha de tipo da nova anotação descreve a lista vazia com a mensagem do motivo (`emptyMessage`; o aviso genérico `typed.noTypes` só sem motivo) e os textos pt-BR das cinco chaves `typed.empty.*`.
- Conferência visual: a prévia do `DataGrid` aberta num Chrome local nos temas claro e escuro, sem barra horizontal a 900 px; o ícone herda a cor do texto.

## Ficou sem gravar

- Prévia do diálogo de tipo dos Detalhes (`TypePicker`) com a lista vazia. Motivo: o DS não tem componente `TypePicker` (ele está na lista dos 9 componentes "sem componente no DS" aprovada pelo dono); o texto ficou só no guia do `Dialog`.
