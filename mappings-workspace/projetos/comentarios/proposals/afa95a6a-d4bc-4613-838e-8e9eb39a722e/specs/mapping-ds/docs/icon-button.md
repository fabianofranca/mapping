# IconButton

Botão só com ícone, do `src/ui/controls/IconButton.tsx`. O `label` é obrigatório porque vira o nome acessível e o texto do Tooltip; onde cabe texto, prefira o Button.

## Ícone e texto

`icone` é o nome (chave camelCase) de um ícone de `src/ui/icons.tsx`; este desenho traz o traço dos 88 ícones do app. Com `texto`, o texto aparece ao lado do ícone (como **Especializações** e **Exportar** na barra principal); sem ele, o botão é só o ícone, e o `rotulo` não aparece.

## Estados desenhados

- `pressionado`: cheio de `color-accent`, ícone e texto em `color-accent-text`.
- `variant`: `danger` pinta o ícone de `color-danger`; `accept` e `reject` o deixam neutro (`color-text-muted`).
- `alerta`: ponto de 6 px no canto de cima, à direita. `selo`: contador numérico no canto.

Hover e foco vêm do CSS. O tamanho `sm` tem 24 px: reduza a marcação.
