# ReferenceField

O campo `ref` de uma anotação tipada nos Detalhes (o `RefField` de `src/ui/TypedFields.tsx`, `.ref-field`): um botão com cara de campo que abre o seletor (RefPicker, o mesmo popup do MarkingPicker), seguido dos IconButtons **Ir para** (`externalLink`) e **Limpar** (`close`).

O desenho é o controle (`.ref-control`): 24 px de altura, centrado na marcação, fundo `color-bg`, borda de controle, raio 4, 6 px de margem e 4 px entre as partes. Ele termina 60 px antes da direita da marcação: ali ficam os dois IconButtons de 28 px (2 px entre eles), que são **marcações filhas**.

| `estado` | Ícone | Texto | Borda |
| --- | --- | --- | --- |
| `valor` | `arrowRight` em `accent` | o rótulo do alvo (`valor`), com reticências, e a camada dele (`camada`, 11 px `muted`) | controle |
| `vazio` | `search` em `muted` | "Escolher…" em `muted` | controle |
| `quebrado` | `warning` | "(referência quebrada)" em `warning`, peso 600 | `warning` |
| `invalido` | `arrowRight` | o rótulo | `danger` (obrigatório vazio, alvo não aceito) |

Não desenhado: o hover (borda `muted`) e o foco com o seletor aberto (contorno de 2 px). Desabilitado é a opacidade do tema no controle inteiro, como nos outros campos.
