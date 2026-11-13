# Importar os parâmetros de um componente pela assinatura — 2026-11-13 (épico `epic/importar-assinatura`)

## Pendências

- **Guia `Tabs`/`BottomTabs`, abas da janela inferior** (S5, #1120): com os `pending` da Material 3 no exemplo, o Avisos ganha um contador de 2 dígitos e a faixa de 6 abas estourava 356 px a 900 px com a fonte do CI (359 px); o `padding` da `.tab` na janela inferior vai de 1 px para 0 e o do `tab-badge` de `--space-0-5` para `--space-px`. O restante da etapa não cria nem muda tela, componente, token ou ícone: a importação é do agente, pelo MCP e pela skill.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-13: versão 84 (um único publish, com o índice por último). `components/Tabs/README.md`: as medidas das abas da janela inferior passam a refletir o CSS (`.tab` com padding `0` e fonte `t-text-small`; `tab-badge` com `padding: 0 space-px`, fonte `t-kbd` e `margin-left: space-1`; `tab-alert` com `margin-left: space-1`; faixa de 360 px a 900 px e 417 px a 1280 px, cabendo as seis abas com o contador de 2 dígitos no Avisos). `project/design-system.json`: `lastChange` preenchido (by, at, via, note). Contraste: só mudam espaço e fonte, nenhuma cor, então os pares dos temas claro e escuro seguem os de antes. Nenhum arquivo do DS foi apagado.

## Ficou sem gravar

Nada.
