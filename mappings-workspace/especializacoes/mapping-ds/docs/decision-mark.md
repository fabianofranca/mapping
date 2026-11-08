# DecisionMark

Estado de decisão de um nível da revisão, só leitura (`src/ui/review/DecisionMark.tsx`, classes `.decision-mark-*` de `src/theme/review.css`). A **forma** diz o estado e a cor reforça:

| `estado` | Forma | Cor |
| --- | --- | --- |
| `sem-decisao` | círculo tracejado (raio 5,75, traço 1,25, traços de 2,1) | `color-text-muted` |
| `aceita` | disco cheio (raio 6,25) com ✓ | `color-success`, o ✓ em `color-surface` (traço 1,5) |
| `rejeitada` | disco cheio com ✕ | `color-danger`, o ✕ em `color-surface` |
| `parcial` | contorno com a metade esquerda cheia | `color-text` |

O desenho ocupa a marcação (a grade de 16 px escala): 16 px na linha da proposta, na linha dos níveis, no cabeçalho do item e na barra; 12 px nas contagens (`.review-count`) e dentro do marcador (ChangeMark, que já o desenha). Quem decide é o DecisionControl.
