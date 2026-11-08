# LayerGroup

A camada onde ela aparece na interface. A cor (`cor`, `#RRGGBB`) é dado da camada e não muda com o tema.

| `forma` | Onde | O que o desenho mostra |
| --- | --- | --- |
| `grupo` | o grupo de uma camada na seção Anotações dos Detalhes (`LayerGroup` de `src/ui/AnnotationsPanel.tsx`, `.layer-group`) | borda `color-border` com raio 6; o cabeçalho de 28 px em `color-bg` com a faixa de 3 px na cor da camada à esquerda (o `box-shadow` inset de `.layer-group-head`); com `aberto` `sim`, o cabeçalho arredonda só em cima, a faixa desce reta e a divisória do corpo vem logo abaixo |
| `linha` | a linha da lista de camadas (`LayersPanel`, `.layer-row`) | a borda esquerda de 3 px na cor, com os cantos de raio 6 |
| `ponto` | o ponto da cor (`.layer-dot`): no cabeçalho do grupo (12 px), na lista de camadas (16 px, no botão da cor), no painel Mostrar no canvas e em Ligado por seta | o círculo na cor, com a borda de controle; ocupa a marcação |

**Filhos do grupo** (no cabeçalho, 8 px de margem): o Ícone `chevronDown` (só quando a camada tem anotações; recolhe o grupo), o ponto (LayerGroup `ponto`, 12 px, 30 px da borda esquerda), o nome (Texto `t-body-strong`; no app o peso é 700), o Selo `tag` da especialização, o resumo quando não há anotação ("Nenhuma anotação nesta camada.", Texto `t-small` `muted` com `reticencias`) e o IconButton **+** (Adicionar anotação). O corpo (6 × 8 px de margem) traz as anotações: o cabeçalho de cada uma (o tipo numa Caixa `selection`, o HelpTip, o rótulo da instância e o IconButton de excluir, `danger`), a **PropertyGrid** da tipada ou a **KeyValueGrid** da livre.

**Filhos da linha** (28 px, 54 com o selo): a caixa de mostrar (Choice só com o quadrado), o ponto (16 px), o nome (TextField `sm`; a camada de especialização tem fundo `selection-muted`), o Selo da especialização e o IconButton ⋯.

Não desenhado: o hover e o arraste da linha.
