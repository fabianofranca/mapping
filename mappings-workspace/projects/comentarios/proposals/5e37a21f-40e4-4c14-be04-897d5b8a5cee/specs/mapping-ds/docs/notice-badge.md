# NoticeBadge

Selo do aviso de uma especialização (`formatVersion` 10), do `src/ui/NoticeBadge.tsx`: pílula com ícone e rótulo. A cor vem do `kind` e sempre vai com ícone e texto.

| `kind` | Rótulo | Ícone | Cor |
| --- | --- | --- | --- |
| `removed` | Removido | `blocked` | `color-danger` sobre `color-danger-bg` |
| `deprecated` | Obsoleto | `warning` | `color-warning` sobre `color-warning-bg` |
| `diverges` | Diverge | `compare` | `color-warning` sobre `color-warning-bg` |
| `pending` | Pendente | `info` | `color-text-muted` sobre `color-selection-muted` |

No código, o componente recebe o aviso inteiro (`notice`); a mensagem vai na dica e não é desenhada. Variantes do mesmo arquivo: `TypeNoticeBadge`, `NoticeBlock` e `NoticeLines`.
