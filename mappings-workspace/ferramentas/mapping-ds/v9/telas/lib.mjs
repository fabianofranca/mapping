// Grupo "telas" da v9: tela inicial, janela estreita, catálogo (tela, janela e página), janela Avisos,
// linha da Árvore, minimapa e campo de zoom. Medidas do CSS do repo Mapping em mcp-v0.25.0
// (src/theme/layout.css, catalog.css, panels.css, editor.css e tokens.ts), conferidas na captura real.
export function build(h) {
  const { C, tok, eq, sw, fr, text, font, fieldText, base, NONE } = h;
  const COMPONENTS = {};
  const DOCS = {};
  const EXAMPLES = {};
  const NEW_FIELDS = {};
  const STRUCTURAL = ['catalog-window', 'catalog-page'];

  // ---- Home: o fundo da tela (color-bg do body) e a coluna lateral de 240 px (size-home-side), em
  // color-surface com a divisória color-border à direita (.home-side, layout.css).
  COMPONENTS.home = base(
    'home',
    'Home',
    'Moldura da tela inicial: o fundo color-bg e a coluna lateral de 240 px em color-surface, com a divisória à direita. A marca, a navegação, os botões e a tabela de projetos são filhos.',
    { width: 1440, height: 900 },
    { width: 480, height: 240 },
    { width: 1440, height: 900 },
    {},
    fr('tela', { layout: NONE, fill: C.bg }, [
      fr('lateral', { layout: NONE, width: 240, anchors: { left: 0, top: 0, bottom: 0 }, fill: C.surface }, [
        { type: 'rect', name: 'divisória', width: 1, anchors: { right: 0, top: 0, bottom: 0 }, fill: C.border },
      ]),
    ]),
  );
  DOCS.home = `# Home

Tela inicial da app (\`src/app/Home.tsx\`, \`.home-desktop\` em \`src/theme/layout.css\`), antes de abrir um projeto. Desenha **só a moldura** da tela:

- o fundo \`color-bg\` (o do \`body\`);
- a coluna lateral de 240 px (\`size-home-side\`), em \`color-surface\`, com a divisória \`color-border\` de 1 px à direita, na altura toda.

Dê à marcação o tamanho da janela (a tela medida tem 1440 × 900). **Filhos esperados:**

- na coluna, com 16 × 12 px de margem e 16 px entre os blocos: a marca (Ícone do logo em \`accent\` e o Texto "Mapping" \`t-title\`) e a navegação (cada item tem 28 px; o atual é uma Caixa \`fundo\` \`selection\` com raio \`sm\`, mais o Ícone e o Texto \`t-body-strong\`; os outros, só Ícone e Texto \`t-body\`);
- na área principal, centrada com no máximo 960 px (\`size-home-main\`) e 24 px de margem: o título "Começar" (Texto \`t-title\`), os Buttons (Novo projeto é \`primary\`; Abrir pasta, Abrir zip e Abrir biblioteca), a dica (Texto \`t-small\` \`muted\`), o aviso de arquivo (Caixa \`warning-bg\` com Texto \`warning\`), "Projetos recentes", a busca (TextField) e a tabela de projetos (Caixas da tabela e das linhas, Textos, Selo da origem e os Buttons \`sm\` Abrir e Excluir).

Não desenha o estado de carregamento ("Carregando…") nem os diálogos iniciais (Novo projeto, pasta), que são Dialogs à parte.
`;

  // ---- NarrowWindow: o aviso ocupa a tela inteira, sobre o fundo color-bg.
  COMPONENTS['narrow-window'] = base(
    'narrow-window',
    'NarrowWindow',
    'Moldura do aviso "Abra numa janela maior": a tela inteira em color-bg; o título e o texto, centrados, são filhos.',
    { width: 800, height: 600 },
    { width: 240, height: 160 },
    { width: 800, height: 600 },
    {},
    fr('tela', { layout: NONE, fill: C.bg }, []),
  );
  DOCS['narrow-window'] = `# NarrowWindow

Aviso mostrado **no lugar** da tela quando a janela fica abaixo de 900 × 720 px (\`BREAKPOINTS\` em \`src/theme/breakpoints.ts\`): a app é só desktop. O editor (ou a tela inicial, ou o catálogo) continua montado, só escondido, e volta como estava ao alargar a janela.

O desenho é a tela inteira em \`color-bg\`: dê à marcação o tamanho da janela (a tela medida tem 800 × 600). **Filhos esperados**, centrados na altura e na largura (\`.narrow-window\` em \`src/theme/layout.css\`: coluna, 8 px entre eles, 24 px de margem):

- o título "Abra numa janela maior" (Texto \`t-title\`, centrado);
- o texto que dá o tamanho mínimo (Texto \`t-body\` \`muted\`, centrado, quebra em até 480 px, \`size-dialog\`).
`;

  // ---- CatalogScreen: a tela do catálogo sem projeto, com a barra de 44 px (8 + 28 + 8) e a divisória.
  COMPONENTS['catalog-screen'] = base(
    'catalog-screen',
    'CatalogScreen',
    'Moldura da tela do catálogo de uma biblioteca: o fundo color-bg e a divisória color-border sob a barra de 44 px. Voltar, nome, versão e o catálogo são filhos.',
    { width: 1440, height: 900 },
    { width: 480, height: 120 },
    { width: 1440, height: 900 },
    {},
    fr('tela', { layout: NONE, fill: C.bg }, [
      { type: 'rect', name: 'divisória da barra', height: 1, anchors: { left: 0, right: 0, top: 44 }, fill: C.border },
    ]),
  );
  DOCS['catalog-screen'] = `# CatalogScreen

Tela cheia do catálogo de uma biblioteca aberta pela tela inicial (**Abrir biblioteca**, pasta ou zip do pacote), sem projeto (\`src/app/CatalogScreen.tsx\`; \`.catalog-screen\` em \`src/theme/layout.css\`). Desenha a moldura: o fundo \`color-bg\` e a divisória \`color-border\` de 1 px sob a barra, que tem 44 px (8 px de margem em cima e embaixo de um Button de 28 px).

Dê à marcação o tamanho da janela (a tela medida tem 1440 × 900). **Filhos esperados:**

- na barra, com 16 px de margem lateral e 12 px entre eles: o Button "Voltar à tela inicial" (com o ícone \`arrowLeft\`), o nome da biblioteca (Texto \`t-title\`) e a versão ("versão 4", Texto \`t-body\` \`muted\`);
- o catálogo, com 16 px de margem: a validação ("Pacote válido, sem erros nem avisos.", Texto \`muted\`), a lista (360 px, \`size-tw-right\`: a busca TextField, o nome da camada em Texto \`t-small\` \`muted\` e uma linha por componente, a atual numa Caixa \`fundo\` \`selection\` raio \`sm\`) e, ao lado, a página do componente (CatalogPage).

Sem projeto não há "Adicionar à tela" nem links para o repositório.
`;

  // ---- CatalogWindow e CatalogPage: agrupadores.
  DOCS['catalog-window'] = `# CatalogWindow

Conteúdo da janela Catálogo (Ctrl+Shift+9, à esquerda; \`src/ui/CatalogWindow.tsx\`). É um **agrupador**: no app o \`.catalog-window\` é só uma coluna com 8 px entre os itens, sem fundo nem borda; a moldura é a da janela (ToolWindow "Catálogo").

**Filhos esperados:** as abas Componentes e Paleta (Tabs com as Abas); na aba Componentes, o Select "Biblioteca" (quando há mais de um pacote aplicado), a validação (Texto \`muted\`), a busca (TextField), o nome da camada (Texto \`t-small\` \`muted\`) e uma linha por componente (Texto; a escolhida tem a Caixa \`fundo\` \`selection\`; o ícone de container e o NoticeBadge à direita). A página do componente abre num Dialog \`lg\` (CatalogPage). Na aba Paleta, a paleta de componentes para arrastar ao canvas.
`;
  DOCS['catalog-page'] = `# CatalogPage

Página de um componente no catálogo (\`src/ui/catalog/CatalogPage.tsx\`): à direita da lista na tela do catálogo, ou dentro do Dialog \`lg\` na janela Catálogo. É um **agrupador**: o \`.catalog-page\` é só uma coluna com 16 px entre as seções, sem fundo nem borda.

**Filhos esperados**, de cima para baixo: o cabeçalho (nome em Texto \`t-title\`, "id · camada" em \`muted\`, a descrição em Texto e, com projeto, o Button "Adicionar à tela"); o documento (título "Documento" em \`t-heading\` e o markdown: títulos, parágrafos, código em linha, tabelas em Caixas com borda e raio \`lg\`); Propriedades (a tabela dos campos); Código (por plataforma); Origens; a galeria de exemplos (o desenho de cada um numa Caixa) e o playground (os campos, o tamanho e o palco). Só apresentação: nada aqui altera o projeto.
`;

  // ---- NoticesView: a moldura da janela Avisos; a barra de filtros tem 38 px (4 + Segmented 30 + 4).
  COMPONENTS['notices-view'] = base(
    'notices-view',
    'NoticesView',
    'Moldura da janela Avisos: a divisória color-border sob a barra de filtros de 38 px. Filtros, cabeçalhos dos grupos e linhas são filhos.',
    { width: 736, height: 176 },
    { width: 240, height: 48 },
    { width: 736, height: 176 },
    {},
    fr('avisos', { layout: NONE }, [
      { type: 'rect', name: 'divisória dos filtros', height: 1, anchors: { left: 0, right: 0, top: 38 }, fill: C.border },
    ]),
  );
  DOCS['notices-view'] = `# NoticesView

Conteúdo da janela Avisos (Ctrl+Shift+8, embaixo; \`src/ui/NoticesView.tsx\`, \`.list-view\` e \`.list-filters\` em \`src/theme/panels.css\`): os avisos (\`notices\`) das especializações aplicadas, agrupados por aviso, do mais grave ao menos. A moldura é a divisória \`color-border\` de 1 px sob a barra de filtros, que tem 38 px (4 px de margem em cima e embaixo do Segmented); o fundo é o da janela (ToolWindow, \`posicao\` \`bottom\`). Se a janela for estreita e os filtros quebrarem linha, a barra cresce e o desenho não acompanha.

**Filhos esperados:**

- na barra, com 12 px de margem lateral e 16 px entre eles: o Segmented do tipo (Opções "Todos 21", "Obsoleto 5"…), os Choices "Só avisos em uso" e "Só camadas visíveis";
- a tabela: o cabeçalho (Marcação, Camada, Anotação, Valor; Textos \`t-small\` \`muted\`) e, por grupo, a linha de cabeçalho (NoticeBadge, o lugar em Texto \`t-body-strong\`, o escopo, a mensagem, "Desde…" e "N anotação(ões)") e uma linha por anotação afetada (o caminho da marcação, a camada com o ponto, o título da anotação e o valor).

Sem avisos, só a mensagem "Nenhuma especialização aplicada tem avisos." (Texto \`muted\`). A aba com a contagem é uma Aba da janela inferior.
`;

  // ---- TreeRow: 28 px (size-row), raio 6 (radius-md); o fundo vem do estado (.tree-row, panels.css).
  const ESTADO = { atual: C.accent, 'atual-sem-foco': C.selectionMuted, selecionada: tok('color-pressed') };
  COMPONENTS['tree-row'] = base(
    'tree-row',
    'TreeRow',
    'Moldura da linha da Árvore de marcações: 28 px, raio 6; a atual em color-accent, a selecionada junto (seleção múltipla) em color-pressed. Chevron, ícone, nome, pontos das camadas, cadeado e menu são filhos.',
    { width: 248, height: 28 },
    { width: 24, height: 16 },
    { width: 248, height: 28 },
    { estado: 'normal' },
    fr('linha', { layout: NONE, cornerRadius: 6, fill: sw('estado', ESTADO, C.none) }, []),
  );
  DOCS['tree-row'] = `# TreeRow

Linha da Árvore de marcações (janela Árvore, Ctrl+Shift+1; \`src/ui/MarkingTree.tsx\`, \`.tree-row\` em \`src/theme/panels.css\`). Desenha **só a moldura**: 28 px de altura (\`size-row\`), raio 6 (\`radius-md\`), na largura da árvore, com o fundo do estado:

| \`estado\` | Fundo | Quando |
| --- | --- | --- |
| \`normal\` | nenhum | a linha comum (o hover \`color-hover\` não é desenhado) |
| \`atual\` | \`color-accent\` | o item selecionado; o texto, o ícone e o chevron ficam em \`color-accent-text\` |
| \`atual-sem-foco\` | \`color-selection-muted\` | o item selecionado com o foco fora da árvore (o texto fica em \`color-text\`) |
| \`selecionada\` | \`color-pressed\` | os outros itens de uma seleção múltipla |

**Filhos esperados**, com 2 px entre eles e o recuo de 16 px por nível (4 px + 16 × profundidade): o chevron de abrir e recolher (Ícone \`chevronDown\`/\`chevronRight\` num quadrado de 24 px, ou nada numa folha); o ícone do item (Ícone \`arrow\` na seta); o nome (Texto \`t-body\`, \`t-body-strong\` no container; \`reticencias\` \`sim\` quando corta); os pontos das camadas (Caixas de 8 × 8 px, raio \`full\`, borda \`control\`), encostados à direita do nome; e, na linha atual, com o mouse ou trancado, o cadeado (Ícone \`lock\`/\`unlock\`) e o menu ⋯ (IconButton \`sm\`).

A cor de cada ponto é a da camada (dado do projeto): a Caixa aproxima pela cor do tema mais próxima.
`;
  NEW_FIELDS['tree-row'] = [{ key: 'estado', label: 'estado', type: 'enum', options: ['normal', 'atual', 'atual-sem-foco', 'selecionada'], default: 'normal' }];
  EXAMPLES['tree-row'] = [
    { name: 'Atual', values: { estado: 'atual' } },
    { name: 'Selecionada junto', values: { estado: 'selecionada' } },
  ];

  // ---- Minimap: a moldura (.minimap: color-card, borda color-border-control, raio 4) e as partes
  // (.minimap-image: color-text-muted a 0,75, opacity-ancestor; .minimap-view: color-selection com a
  // borda color-accent, tudo a 0,25, opacity-grabbed), editor.css.
  const PARTE = (p) => eq('parte', p);
  const MOLDURA = { $not: { $or: [PARTE('imagem'), PARTE('vista')] } };
  COMPONENTS.minimap = base(
    'minimap',
    'Minimap',
    'Minimapa do canvas: a moldura (color-card, borda color-border-control, raio 4) e, como filhas do mesmo tipo, cada imagem (color-text-muted a 0,75) e a área visível (color-selection com borda color-accent, a 0,25).',
    { width: 132, height: 96 },
    { width: 1, height: 1 },
    { width: 132, height: 96 },
    { parte: 'moldura' },
    fr('minimapa', { layout: NONE }, [
      { type: 'rect', name: 'moldura', visible: MOLDURA, cornerRadius: 4, fill: tok('color-card'), stroke: { color: C.control, width: 1 } },
      { type: 'rect', name: 'imagem', visible: PARTE('imagem'), fill: C.muted, opacity: 0.75 },
      { type: 'rect', name: 'vista', visible: PARTE('vista'), fill: C.selection, stroke: { color: C.accent, width: 1 }, opacity: 0.25 },
    ]),
  );
  DOCS.minimap = `# Minimap

Minimapa no canto de baixo à direita do canvas (\`src/ui/Minimap.tsx\`, contas em \`src/canvas/minimap.ts\`, \`.minimap\` em \`src/theme/editor.css\`): a visão geral dos containers; clicar move a vista. Desenhado em DOM, sem Konva, numa caixa de no máximo 132 × 96 px, a 8 px das bordas do canvas.

Um tipo, três partes (\`parte\`), porque as posições são do app e cada peça é uma marcação:

| \`parte\` | Desenho | No app |
| --- | --- | --- |
| \`moldura\` | \`color-card\`, borda \`color-border-control\` de 1 px, raio 4 | \`.minimap\` |
| \`imagem\` | \`color-text-muted\` a 0,75 (\`opacity-ancestor\`) | \`.minimap-image\`, um por container |
| \`vista\` | \`color-selection\` com borda \`color-accent\`, tudo a 0,25 (\`opacity-grabbed\`) | \`.minimap-view\`, a área visível |

A moldura é a mãe; as imagens e a vista são filhas, no lugar e no tamanho que o app calcula (a vista cobre o minimapa inteiro quando tudo está à vista). As opacidades são literais: os tokens \`opacity-ancestor\` e \`opacity-grabbed\` não estão nos \`tokens\` da especialização.
`;
  NEW_FIELDS.minimap = [{ key: 'parte', label: 'parte', type: 'enum', options: ['moldura', 'imagem', 'vista'], default: 'moldura' }];
  EXAMPLES.minimap = [
    { name: 'Imagem', values: { parte: 'imagem' } },
    { name: 'Área visível', values: { parte: 'vista' } },
  ];

  // ---- ZoomField: átomo. min-width 56, altura do controle (28; 24 na barra de status), texto t-small
  // color-text-muted centrado, sem fundo em repouso (.zoom-field, editor.css).
  COMPONENTS['zoom-field'] = base(
    'zoom-field',
    'ZoomField',
    'Campo de zoom: a porcentagem em t-small color-text-muted, centrada num botão sem fundo de 56 × 28 px (24 px na barra de status).',
    { width: 56, height: 28 },
    { width: 24, height: 16 },
    { width: 56, height: 28 },
    { valor: '100%' },
    fr('zoom', { layout: NONE, cornerRadius: 4 }, [
      text('valor', fieldText('valor', '100%'), C.muted, font(12, 400, 16), { anchors: { centerX: true, centerY: true } }),
    ]),
  );
  DOCS['zoom-field'] = `# ZoomField

Campo de zoom (\`src/ui/ZoomField.tsx\`, \`.zoom-field\` em \`src/theme/editor.css\`): mostra o zoom atual e, ao clicar, volta a 100%. Fica na barra do canvas (28 px, \`control-height\`) e na barra de status (24 px). Átomo: desenha tudo.

- \`valor\`: o texto, como o app mostra ("11%", "100%"), em \`t-small\` \`color-text-muted\`, centrado.
- Sem fundo nem borda em repouso; largura mínima de 56 px com 8 px de margem lateral, raio 4. O hover (\`color-hover\`, texto \`color-text\`) não é desenhado.
`;
  NEW_FIELDS['zoom-field'] = [{ key: 'valor', label: 'valor', type: 'string', default: '100%' }];

  return { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL };
}
