# CR da interface — [Não lançado] (épico `epic/cr-ui`)

## Pendências

- Fase 1 (`InstallHint`): a dica de instalação passou a usar o componente `Notice` (tom `info`, `title` e `actions`) em vez da caixa montada à mão; mesma aparência, sem mudança de token. Só a origem de código do `InstallHint` no mapa componente → origem muda de lugar.
- Fase 2: o tamanho do minimapa (132×96, antes fixo no componente) vira os tokens `size-minimap-width` (132px) e `size-minimap-height` (96px) em `src/theme/tokens.ts`, na seção Tamanhos; a medida não muda.
- Fase 2: o selo de pendência da anotação (`IssueBadge`, em `AnnotationSummary`) e o da camada (`LayerGroup`, em `AnnotationsPanel`) usam o ícone `warning` no lugar do glifo `⚠`, com o mesmo nome acessível; o `.issue-badge` ganhou `display: inline-flex` para alinhar o ícone. Fica a pendência da fase 3 só para a lista de exceções dos botões.
- Fase 2: `LayerCell` e `MarkingCell` (botão da primeira coluna) saem de `ListView.tsx` e são usados pela Lista, pelas Incompletas e pelos Avisos; mesma aparência, só a origem de código muda no mapa componente → origem.
- Fase 3: a lista de exceções dos botões avulsos de papel próprio (link de texto, segmento da barra de status, cara de select, campo de zoom, opção de lista, alça de arraste) está em `docs/DESIGN-SYSTEM.md`, seção "Botões avulsos"; nenhum botão mudou de aparência nem de componente. No mapa componente → origem do artefato, os botões `Button`/`IconButton` seguem como estavam; as exceções não têm componente no DS (nada a gravar além de anotar a lista). Também: o rótulo de tecla do seletor de referência (`↑`, `Enter`, `Ctrl+Enter`, `Esc`) e os marcadores `#` e `*` da tabela passam por chaves de tradução, com o mesmo texto.

## Sincronização

_(preenchida no fechamento do épico)_

## Ficou sem gravar

_(preenchida no fechamento do épico)_
