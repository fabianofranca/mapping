# IconButton

Botão só com ícone, do `src/ui/controls/IconButton.tsx`. O `label` é obrigatório porque vira o nome acessível e o texto do Tooltip; onde cabe texto, prefira o Button.

## Ícone

O campo `icone` é o nome (chave camelCase) de um ícone de `src/ui/icons.tsx`. A lista de sugestões traz todos os ícones do app, mas este desenho só traz o traço de alguns: close, plus, minus, check, chevronDown, info, warning, error, compare, blocked, search, copy, trash, edit, refresh, undo, redo, note, text, marking e arrow. Os outros aparecem como um quadrado.

## Estados desenhados

- `pressionado`: cheio de `color-accent`, ícone em `color-accent-text`.
- `variant`: `danger` pinta o ícone de `color-danger`; `accept` e `reject` o deixam neutro (`color-text-muted`).
- `alerta`: ponto de 6 px no canto de cima, à direita.
- `selo`: contador numérico no canto.

Hover e foco vêm do CSS. O tamanho `sm` tem 24 px: reduza a marcação.
