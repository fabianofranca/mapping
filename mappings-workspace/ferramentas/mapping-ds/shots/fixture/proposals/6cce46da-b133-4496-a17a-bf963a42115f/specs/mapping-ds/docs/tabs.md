# Tabs

Abas do `src/ui/controls/Tabs.tsx`. O `rotulo` do conjunto é obrigatório porque é o nome acessível; ele não aparece no desenho.

- `abas`: uma linha por aba do `tabs` (`rotulo`, se é a `selecionada` e um `selo` de contagem). Marque só uma.
- A aba selecionada tem texto `color-text` em peso 600 e sublinhado de 2 px em `color-accent`; as outras usam `color-text-muted`.
- A linha de baixo (`color-border`) corre por toda a largura.

Ícone, ponto de alerta e aba desabilitada não são desenhados. `BottomTabs` é o uso na janela inferior.
