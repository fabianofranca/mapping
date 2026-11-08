# Button

Botão com texto, do `src/ui/controls/Button.tsx`. Use para uma ação da tela.

## Variantes

| `variant` | Aparência |
| --- | --- |
| `default` | Fundo `color-surface`, borda de controle. |
| `primary` | Cheio de `color-accent`, texto `color-accent-text`. Um por região. |
| `danger` | Borda e texto `color-danger`. |
| `ghost` | Sem borda nem fundo em repouso. |
| `accept` e `reject` | Os botões de decisão da revisão; em repouso, como o `default`. O estado marcado (`aria-pressed`) não é desenhado. |

## Tamanho

O desenho segue o retângulo da marcação. A altura é 28 px no `size="md"` e 24 px no `sm`; no `sm` o desenho só troca o espaço lateral, então ajuste a altura da marcação.

## Estados

Hover, pressionado e foco vêm do CSS e não são desenhados. O desabilitado usa `opacity-disabled` (0,45).

Com `icone` (a chave do ícone em `src/ui/icons.tsx`), o ícone de 16 px vem antes do texto, na cor dele. O texto é o filho (`children`) do componente. Para um link com a aparência de botão, use `LinkButton`, do mesmo arquivo.
