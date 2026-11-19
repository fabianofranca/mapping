# Notice

Aviso em caixa, do `src/ui/Notice.tsx`.

| `tom` | Fundo | Borda | Ícone |
| --- | --- | --- | --- |
| `info` | `color-selection` | nenhuma | `info`, em `color-accent` |
| `warning` | `color-warning-bg` | `color-warning` | `warning` |
| `error` | `color-danger-bg` | `color-danger` | `error` |
| `success` | `color-success-bg` | `color-success` | `check` |

- `tamanho` `sm` reduz o espaço e a fonte (12 px).
- `titulo` aparece em negrito acima do texto.
- O tamanho `line` (uma linha só, com reticências), as ações e o botão de dispensar não são desenhados; `dica` só vale no `line`.

O `texto` é o filho (`children`) do componente.
