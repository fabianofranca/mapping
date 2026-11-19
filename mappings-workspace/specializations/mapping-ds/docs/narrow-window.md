# NarrowWindow

Aviso mostrado **no lugar** da tela quando a janela fica abaixo de 900 × 720 px (`BREAKPOINTS` em `src/theme/breakpoints.ts`): a app é só desktop. O editor (ou a tela inicial, ou o catálogo) continua montado, só escondido, e volta como estava ao alargar a janela.

O desenho é a tela inteira em `color-bg`: dê à marcação o tamanho da janela (a tela medida tem 800 × 600). **Filhos esperados**, centrados na altura e na largura (`.narrow-window` em `src/theme/layout.css`: coluna, 8 px entre eles, 24 px de margem):

- o título "Abra numa janela maior" (Texto `t-title`, centrado);
- o texto que dá o tamanho mínimo (Texto `t-body` `muted`, centrado, quebra em até 480 px, `size-dialog`).
