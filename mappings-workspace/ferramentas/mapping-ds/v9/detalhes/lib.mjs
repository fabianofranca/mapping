// Grupo "detalhes" da v9: os painéis e campos da janela Detalhes e do modo visualização.
// Medidas de src/theme/details.css, panels.css e controls.css (mcp-v0.25.0), conferidas no DOM do app
// 0.25.0 (ferramentas/mapping-ds/app25) com a fixture aberta.
//
// Decisões:
// - MarkingPanel, ArrowPanel e MultiSelectionPanel (.panel-details, .details-empty), PropertyGrid (.props)
//   e CodeDefinitions (.code-definitions) não têm fundo, borda nem divisória própria no app (o fundo é o da
//   janela Detalhes; a divisória da identidade é do bloco .identity, uma Caixa filha): são agrupadores
//   estruturais.
// - LayerGroup desenha a camada nas três formas em que ela aparece: o grupo dos Detalhes (borda, cabeçalho
//   color-bg com a faixa de 3 px na cor da camada e a divisória do corpo), a linha da lista de camadas
//   (a borda esquerda de 3 px na cor) e o ponto da cor (o .layer-dot, em qualquer lugar). A cor é dado
//   da camada (`cor`, #RRGGBB), igual nos dois temas.
// - KeyValueGrid e DataGrid desenham a caixa da grade (.grid): borda de controle, raio 4 e a faixa do
//   cabeçalho; os títulos das colunas, as linhas (Caixa com a divisória) e as células são filhos.
// - ReferenceField e RefCell são átomos do controle (.ref-control: caixa, ícone, alvo e camada); os
//   IconButtons Ir para e Limpar ficam à direita, como marcações filhas.
// - MarkingPicker e ViewModePanel são molduras de popup com o título (dado do próprio composto).
export function build(h) {
  const { C, fr, text, font, fieldText, base, NONE, eq, YES, sw, SHADOW_POPUP, ICON_KEY } = h;
  const COMPONENTS = {};
  const DOCS = {};
  const EXAMPLES = {};
  const NEW_FIELDS = {};
  const SIM_NAO = (key, label, def) => ({ key, label, type: 'enum', options: ['sim', 'não'], default: def });
  const COR_CAMADA = { $field: 'cor', default: '#1A63CC' };

  // ===========================================================================================
  // Agrupadores (sem desenho)
  // ===========================================================================================
  const STRUCTURAL = ['marking-panel', 'arrow-panel', 'multi-selection-panel', 'property-grid', 'code-definitions'];
  for (const id of STRUCTURAL) NEW_FIELDS[id] = [];

  DOCS['marking-panel'] = `# MarkingPanel

Os Detalhes da marcação selecionada (\`src/ui/MarkingPanel.tsx\`, \`.panel-details\`). No app o painel não tem fundo nem borda: o fundo é o da janela Detalhes (ToolWindow), então a marcação só agrupa os filhos, numa coluna de 335 px (a janela de 360 menos 12 px de cada lado e a divisória), com 12 px entre as seções.

O que esperar dentro, de cima para baixo:

- **Identidade** (\`.identity\`): Caixa com a divisória embaixo (\`lados\` \`baixo\`); dentro, o Ícone \`marking\`, o nome (Texto \`t-title\`), o ID numa Caixa com borda de controle e raio 4 (Texto \`t-code\` \`muted\` com \`reticencias\` e Ícone \`copy\`), o IconButton de trava (\`lock\`/\`unlock\`, \`pressionado\` quando trancada) e o "Em …" (Texto \`t-small\` \`muted\`).
- **Seção Marcação**: o cabeçalho (Ícone \`chevronDown\`, Texto \`t-heading\`; recolhida, o resumo "X 112 · Y 236 · 346 × 84 px" em Texto \`t-small\` \`muted\` à direita) e a **PropertyGrid** com Nome, Container, Pertence a, Flutuante, Ordem, Posição e Tamanho.
- **Anotações**: o cabeçalho com a contagem e um **LayerGroup** por camada visível.
- **Conversas** (ThreadsSection), **Ligado por seta** e a linha de ações: Buttons **Ligar a…** e **Excluir marcação** (\`danger\`) e, quando dá, o IconButton **Arrumar**.

**Estado trancado:** o IconButton da trava fica \`pressionado\`, aparece o HelpTip do aviso ao lado dele e os campos da Marcação ficam desabilitados (cada controle com o próprio \`desabilitado\`). A pendência "Incompleta" aparece como Notice no topo. Nada disso é desenho do painel.
`;
  DOCS['arrow-panel'] = `# ArrowPanel

Os Detalhes da seta selecionada (\`src/ui/ArrowPanel.tsx\`, o mesmo \`.panel-details\` do MarkingPanel). Sem fundo nem borda no app: a marcação só agrupa os filhos.

- **Identidade**: como a da marcação, com o nome da seta (Texto \`t-title\`, que quebra o ID e a trava para a linha de baixo quando é longo) e o "Liga A a B" (Texto \`t-small\` \`muted\`).
- **Seção Seta** (PropertyGrid): Nome (TextField \`sm\`), Origem e Destino (Button \`ghost\` \`sm\`, que seleciona a ponta) e Estilo (Segmented Reta, Curva, Canto).
- **Anotações** (LayerGroup por camada; os tipos com \`appliesTo\` \`arrow\`), **Conversas** e o Button **Excluir seta** (\`danger\`).
`;
  DOCS['multi-selection-panel'] = `# MultiSelectionPanel

Os Detalhes com mais de um item selecionado (\`src/ui/MultiSelectionPanel.tsx\`, \`.details-empty\` com \`.multi-actions\`). Sem fundo nem borda: o conteúdo fica centrado, com 24 px de margem.

Filhos: o Ícone de informação, "2 itens selecionados" (Texto \`t-body-strong\`), o resumo por tipo ("2 marcação(ões)", Texto \`t-body\` \`muted\`) e as ações da seleção inteira, Buttons **Envolver**, **Trancar**, **Destrancar** e **Excluir** (\`danger\`), com 4 px entre eles.
`;
  DOCS['property-grid'] = `# PropertyGrid

A grade de propriedades (\`src/ui/PropertyGrid.tsx\`, \`.props\`): duas colunas, o rótulo com 92 px e o valor no resto, 8 px entre as colunas e entre as linhas. Usada na seção Marcação, na seção Seta e no corpo de uma anotação tipada. Não tem fundo nem borda: a marcação agrupa.

Cada linha (\`Property\`) é feita de filhos:

- o rótulo: Texto \`t-small\` \`muted\` (4 px abaixo do topo da linha) e, quando o campo tem descrição, o HelpTip (IconButton \`sm\` \`info\`) e o menu ⋯ do campo (IconButton);
- o controle: TextField \`sm\`, Select \`sm\`, Segmented, Choice, Texto \`t-body\` (o valor só de leitura, \`.props-text\`), **ReferenceField**, **DataGrid** (o campo \`table\` ocupa as duas colunas, com o cabeçalho "Linhas · 5 linhas · + Linha" em cima) ou **CodeDefinitions**.

Os estados (desabilitado, inválido, alterado na revisão) vêm dos controles.
`;
  DOCS['code-definitions'] = `# CodeDefinitions

A linha **Definição** de uma anotação tipada (\`src/ui/CodeDefinitions.tsx\`, \`.code-definitions\`): o arquivo que define o símbolo do \`code\` do tipo, uma entrada por plataforma. Sem fundo nem borda: a marcação agrupa a coluna do valor (o rótulo "Definição" e o HelpTip ficam na PropertyGrid).

Cada entrada é: o texto "<plataforma> · <arquivo>" (Texto \`t-body\`, "Web (Preact) · Segmented.tsx"; a dica tem o caminho e o símbolo), o IconButton **Abrir no repositório** (\`externalLink\`, só quando o \`repo\` da plataforma tem \`urlTemplate\`) e o IconButton **Copiar caminho** (\`copy\`). As entradas ficam em coluna, 2 px entre elas; os botões quebram para a linha de baixo quando não cabem.
`;

  // ===========================================================================================
  // LayerGroup: o grupo, a linha da lista de camadas e o ponto
  // ===========================================================================================
  const GRUPO = { $or: [eq('forma', 'grupo'), { $not: { $has: 'forma' } }] };
  // A faixa do cabeçalho é um box-shadow inset de 3 px no cabeçalho de raio 6: a região entre o canto
  // redondo e o mesmo canto deslocado 3 px para a direita (28 px de altura, sempre).
  // Aberto, o cabeçalho só arredonda em cima (radius-md radius-md 0 0) e a faixa desce reta até o corpo.
  const FAIXA_GRUPO = 'M9 0L6 0A6 6 0 0 0 0 6L0 22A6 6 0 0 0 6 28L9 28A6 6 0 0 1 3 22L3 6A6 6 0 0 1 9 0Z';
  const FAIXA_ABERTO = 'M9 0L6 0A6 6 0 0 0 0 6L0 28L3 28L3 6A6 6 0 0 1 9 0Z';
  // A linha da lista é border-left de 3 px com raio 6: os cantos de dentro são elipses de 3 × 6.
  const CANTO_CIMA = 'M6 0A6 6 0 0 0 0 6L3 6A3 6 0 0 1 6 0Z';
  const CANTO_BAIXO = 'M0 0A6 6 0 0 0 6 6A3 6 0 0 1 3 0Z';
  COMPONENTS['layer-group'] = base(
    'layer-group',
    'LayerGroup',
    'A camada como aparece nos Detalhes e na lista de camadas: o grupo (borda, cabeçalho com a faixa da cor e a divisória do corpo), a linha da lista (borda esquerda de 3 px na cor) e o ponto da cor.',
    { width: 335, height: 30 },
    { width: 8, height: 8 },
    { width: 335, height: 30 },
    { forma: 'grupo', cor: '#1A63CC', aberto: 'não' },
    fr('camada', { layout: NONE }, [
      fr('grupo', { visible: GRUPO, anchors: { left: 0, right: 0, top: 0, bottom: 0 }, cornerRadius: 6, stroke: { color: C.border, width: 1 }, layout: NONE }, [
        fr('cabeçalho', { anchors: { left: 1, right: 1, top: 1 }, height: 28, cornerRadius: { $if: YES('aberto'), then: [6, 6, 0, 0], else: 6 }, fill: C.bg, layout: NONE }, [
          { type: 'path', name: 'faixa da cor', width: 9, height: 28, anchors: { left: 0, top: 0 }, viewBox: [9, 28], d: { $if: YES('aberto'), then: FAIXA_ABERTO, else: FAIXA_GRUPO }, fill: COR_CAMADA },
        ]),
        { type: 'rect', name: 'divisória do corpo', height: 1, anchors: { left: 1, right: 1, top: 29 }, fill: C.border, visible: YES('aberto') },
      ]),
      fr('linha', { visible: eq('forma', 'linha'), anchors: { left: 0, right: 0, top: 0, bottom: 0 }, layout: NONE }, [
        { type: 'path', name: 'canto de cima', width: 6, height: 6, anchors: { left: 0, top: 0 }, viewBox: [6, 6], d: CANTO_CIMA, fill: COR_CAMADA },
        { type: 'rect', name: 'borda esquerda', width: 3, anchors: { left: 0, top: 6, bottom: 6 }, fill: COR_CAMADA },
        { type: 'path', name: 'canto de baixo', width: 6, height: 6, anchors: { left: 0, bottom: 0 }, viewBox: [6, 6], d: CANTO_BAIXO, fill: COR_CAMADA },
      ]),
      { type: 'ellipse', name: 'ponto', visible: eq('forma', 'ponto'), anchors: { left: 0, right: 0, top: 0, bottom: 0 }, fill: COR_CAMADA, stroke: { color: C.control, width: 1 } },
    ]),
  );
  NEW_FIELDS['layer-group'] = [
    { key: 'forma', label: 'forma', type: 'enum', options: ['grupo', 'linha', 'ponto'], default: 'grupo' },
    { key: 'cor', label: 'cor da camada', type: 'string', default: '#1A63CC' },
    SIM_NAO('aberto', 'aberto', 'sim'),
  ];
  DOCS['layer-group'] = `# LayerGroup

A camada onde ela aparece na interface. A cor (\`cor\`, \`#RRGGBB\`) é dado da camada e não muda com o tema.

| \`forma\` | Onde | O que o desenho mostra |
| --- | --- | --- |
| \`grupo\` | o grupo de uma camada na seção Anotações dos Detalhes (\`LayerGroup\` de \`src/ui/AnnotationsPanel.tsx\`, \`.layer-group\`) | borda \`color-border\` com raio 6; o cabeçalho de 28 px em \`color-bg\` com a faixa de 3 px na cor da camada à esquerda (o \`box-shadow\` inset de \`.layer-group-head\`); com \`aberto\` \`sim\`, o cabeçalho arredonda só em cima, a faixa desce reta e a divisória do corpo vem logo abaixo |
| \`linha\` | a linha da lista de camadas (\`LayersPanel\`, \`.layer-row\`) | a borda esquerda de 3 px na cor, com os cantos de raio 6 |
| \`ponto\` | o ponto da cor (\`.layer-dot\`): no cabeçalho do grupo (12 px), na lista de camadas (16 px, no botão da cor), no painel Mostrar no canvas e em Ligado por seta | o círculo na cor, com a borda de controle; ocupa a marcação |

**Filhos do grupo** (no cabeçalho, 8 px de margem): o Ícone \`chevronDown\` (só quando a camada tem anotações; recolhe o grupo), o ponto (LayerGroup \`ponto\`, 12 px, 30 px da borda esquerda), o nome (Texto \`t-body-strong\`; no app o peso é 700), o Selo \`tag\` da especialização, o resumo quando não há anotação ("Nenhuma anotação nesta camada.", Texto \`t-small\` \`muted\` com \`reticencias\`) e o IconButton **+** (Adicionar anotação). O corpo (6 × 8 px de margem) traz as anotações: o cabeçalho de cada uma (o tipo numa Caixa \`selection\`, o HelpTip, o rótulo da instância e o IconButton de excluir, \`danger\`), a **PropertyGrid** da tipada ou a **KeyValueGrid** da livre.

**Filhos da linha** (28 px, 54 com o selo): a caixa de mostrar (Choice só com o quadrado), o ponto (16 px), o nome (TextField \`sm\`; a camada de especialização tem fundo \`selection-muted\`), o Selo da especialização e o IconButton ⋯.

Não desenhado: o hover e o arraste da linha.
`;
  EXAMPLES['layer-group'] = [
    { name: 'Grupo aberto (Notas)', values: { forma: 'grupo', cor: '#F5C400', aberto: 'sim' } },
    { name: 'Grupo vazio (Camada 1)', values: { forma: 'grupo', cor: '#D32F2F', aberto: 'não' } },
    { name: 'Linha da lista', values: { forma: 'linha', cor: '#1A63CC', aberto: 'não' } },
    { name: 'Ponto da cor', values: { forma: 'ponto', cor: '#F5C400', aberto: 'não' } },
  ];

  // ===========================================================================================
  // KeyValueGrid e DataGrid: a caixa da grade (.grid) com a faixa do cabeçalho
  // ===========================================================================================
  // .grid: borda color-border-control, raio 4. .grid-head: 24 px (23 de fundo color-bg + a divisória
  // color-border), raio 4 só em cima (3 por dentro da borda).
  const gridFrame = (name) =>
    fr(name, { layout: NONE, cornerRadius: 4, stroke: { color: C.control, width: 1 } }, [
      { type: 'rect', name: 'cabeçalho', height: 23, anchors: { left: 1, right: 1, top: 1 }, cornerRadius: [3, 3, 0, 0], fill: C.bg, visible: { $not: eq('cabecalho', 'não') } },
      { type: 'rect', name: 'divisória do cabeçalho', height: 1, anchors: { left: 1, right: 1, top: 24 }, fill: C.border, visible: { $not: eq('cabecalho', 'não') } },
    ]);
  const GRID_FIELDS = () => [SIM_NAO('cabecalho', 'cabeçalho', 'sim')];
  COMPONENTS['key-value-grid'] = base(
    'key-value-grid',
    'KeyValueGrid',
    'Caixa da grade de pares da anotação livre: borda de controle, raio 4 e a faixa do cabeçalho (Chave, Valor). Títulos, linhas e células são filhos.',
    { width: 317, height: 124 },
    { width: 80, height: 26 },
    { width: 317, height: 124 },
    { cabecalho: 'sim' },
    gridFrame('grade'),
  );
  NEW_FIELDS['key-value-grid'] = GRID_FIELDS();
  DOCS['key-value-grid'] = `# KeyValueGrid

A grade de pares da anotação livre (\`src/ui/KeyValueGrid.tsx\`, \`.grid.kv-grid\`). O desenho é a caixa da grade: borda \`color-border-control\`, raio 4, e a faixa do cabeçalho (\`cabecalho\` \`sim\`): 23 px de \`color-bg\` com a divisória \`color-border\` embaixo (\`.grid-head\`).

**Filhos:**

- os títulos das colunas, **Chave** e **Valor** (Texto \`t-micro\` \`muted\`: 12 px, peso 600; a coluna da alça e a do menu não têm título);
- cada par é uma linha de 33 px (Caixa com a divisória embaixo, \`lados\` \`baixo\`; a última sem): a alça de arraste (Ícone \`grip\` \`muted\`), a chave e o valor (Texto \`t-body\`: o campo na célula não tem fundo nem borda até receber o foco) e o IconButton ⋯ do par;
- embaixo do par que é alvo de uma referência, o link de volta ("← Tabela …", Texto \`accent\`).

O **+ Par** fica fora da grade, 4 px abaixo (Texto \`accent\`: no app é um Button com a classe \`button-link\`, sem fundo nem borda). Sem pares, só ele aparece (a grade some).

Não desenhado: o foco da célula (o campo ganha a borda de controle), a linha arrastada e a linha removida na revisão (riscada).
`;
  EXAMPLES['key-value-grid'] = [{ name: 'Com cabeçalho', values: { cabecalho: 'sim' } }];

  COMPONENTS['data-grid'] = base(
    'data-grid',
    'DataGrid',
    'Caixa da grade de dados (o campo table dos Detalhes): borda de controle, raio 4 e a faixa do cabeçalho. Títulos, linhas e células são filhos.',
    { width: 317, height: 190 },
    { width: 80, height: 26 },
    { width: 317, height: 190 },
    { cabecalho: 'sim' },
    gridFrame('grade'),
  );
  NEW_FIELDS['data-grid'] = GRID_FIELDS();
  DOCS['data-grid'] = `# DataGrid

A grade do campo \`table\` nos Detalhes (\`src/ui/TableField.tsx\`, \`.grid.data-grid\`). O desenho é a caixa da grade, igual à da KeyValueGrid: borda \`color-border-control\`, raio 4, e a faixa do cabeçalho (\`cabecalho\` \`sim\`, 23 px de \`color-bg\` e a divisória \`color-border\`).

**Filhos:**

- os títulos (Texto \`t-micro\` \`muted\`): **#** e um por coluna, com " *" na obrigatória;
- cada linha (Caixa com a divisória embaixo; a última sem): a alça (Ícone \`grip\`), o número (Texto \`t-small\` \`muted\`, à direita), uma célula por coluna e o IconButton ⋯ da linha. A célula é o controle da coluna sem moldura: Texto \`t-body\` (string e número: o campo na célula não tem fundo nem borda até o foco), Segmented (enum curto), Select \`sm\` ou **RefCell** (coluna \`ref\`). A linha tem 33 px com campos de texto e 35 com o Segmented;
- em cima da grade, fora dela, o cabeçalho do campo: o rótulo (Texto \`t-micro\` em \`text\`), o HelpTip, a contagem ("5 linhas", Texto \`t-small\` \`muted\`) e o **+ Linha** (Texto \`accent\`; no app, Button \`button-link\`).

A grade larga rola por dentro (as colunas têm no mínimo \`size-grid-col-min\`): a marcação é a caixa visível, e a célula cortada pela rolagem não vira marcação.

A **Lista em tabela** (\`src/ui/ListView.tsx\`) usa a mesma grade; não foi conferida nesta medição.
`;
  EXAMPLES['data-grid'] = [{ name: 'Com cabeçalho', values: { cabecalho: 'sim' } }];

  // ===========================================================================================
  // ReferenceField e RefCell: o controle .ref-control
  // ===========================================================================================
  // .ref-control: 24 px (control-height-sm), padding 0 6, gap 4, fundo color-bg, borda de controle, raio 4.
  // O ícone é accent (search e muted no vazio, warning no quebrado); o texto é t-text-input (13/20) com
  // reticências; a camada, t-micro sem peso (11/16) muted. Quebrado: texto e borda warning, peso 600.
  const refControl = (right, withLayer) =>
    fr('controle', {
      anchors: { left: 0, right, centerY: true },
      height: 24,
      cornerRadius: 4,
      fill: C.bg,
      stroke: { color: sw('estado', { quebrado: C.warning, invalido: C.danger }, C.control), width: 1 },
      layout: { type: 'row', padding: [0, 6], gap: 4, align: 'center' },
    }, [
      h.iconNode(sw('estado', { vazio: ICON_KEY.search, quebrado: ICON_KEY.warning }, ICON_KEY.arrowRight), sw('estado', { vazio: C.muted, quebrado: C.warning }, C.accent)),
      text('alvo', fieldText('valor', 'Escolher…'), sw('estado', { vazio: C.muted, quebrado: C.warning }, C.text), font(13, sw('estado', { quebrado: 600 }, 400), 20, { verticalAlign: 'middle', wrap: 'none', ellipsis: true }), { width: 'fill', height: 20 }),
      ...(withLayer ? [text('camada', fieldText('camada', ''), C.muted, font(11, 400, 16, { wrap: 'none' }), { visible: { $has: 'camada' }, maxWidth: 100 })] : []),
    ]);
  const ESTADOS = { key: 'estado', label: 'estado', type: 'enum', options: ['valor', 'vazio', 'quebrado', 'invalido'], default: 'valor' };
  COMPONENTS['reference-field'] = base(
    'reference-field',
    'ReferenceField',
    'Campo ref dos Detalhes: o controle de 24 px (ícone, alvo e camada) que abre o seletor, com 60 px à direita para os IconButtons Ir para e Limpar.',
    { width: 217, height: 28 },
    { width: 100, height: 24 },
    { width: 217, height: 28 },
    { valor: 'Arquivos.pasta', camada: 'Camada 1', estado: 'valor' },
    fr('campo', { layout: NONE }, [refControl(60, true)]),
  );
  NEW_FIELDS['reference-field'] = [
    { key: 'valor', label: 'alvo', type: 'string' },
    { key: 'camada', label: 'camada do alvo', type: 'string' },
    ESTADOS,
  ];
  DOCS['reference-field'] = `# ReferenceField

O campo \`ref\` de uma anotação tipada nos Detalhes (o \`RefField\` de \`src/ui/TypedFields.tsx\`, \`.ref-field\`): um botão com cara de campo que abre o seletor (RefPicker, o mesmo popup do MarkingPicker), seguido dos IconButtons **Ir para** (\`externalLink\`) e **Limpar** (\`close\`).

O desenho é o controle (\`.ref-control\`): 24 px de altura, centrado na marcação, fundo \`color-bg\`, borda de controle, raio 4, 6 px de margem e 4 px entre as partes. Ele termina 60 px antes da direita da marcação: ali ficam os dois IconButtons de 28 px (2 px entre eles), que são **marcações filhas**.

| \`estado\` | Ícone | Texto | Borda |
| --- | --- | --- | --- |
| \`valor\` | \`arrowRight\` em \`accent\` | o rótulo do alvo (\`valor\`), com reticências, e a camada dele (\`camada\`, 11 px \`muted\`) | controle |
| \`vazio\` | \`search\` em \`muted\` | "Escolher…" em \`muted\` | controle |
| \`quebrado\` | \`warning\` | "(referência quebrada)" em \`warning\`, peso 600 | \`warning\` |
| \`invalido\` | \`arrowRight\` | o rótulo | \`danger\` (obrigatório vazio, alvo não aceito) |

Não desenhado: o hover (borda \`muted\`) e o foco com o seletor aberto (contorno de 2 px). Desabilitado é a opacidade do tema no controle inteiro, como nos outros campos.
`;
  EXAMPLES['reference-field'] = [
    { name: 'Com alvo', values: { valor: 'Arquivos.pasta', camada: 'Camada 1', estado: 'valor' } },
    { name: 'Vazio', values: { valor: 'Escolher…', estado: 'vazio' } },
    { name: 'Quebrada', values: { valor: '(referência quebrada)', estado: 'quebrado' } },
  ];

  COMPONENTS['ref-cell'] = base(
    'ref-cell',
    'RefCell',
    'Célula de uma coluna ref: o controle compacto (ícone e alvo) que abre o seletor, com 30 px à direita para o IconButton Limpar.',
    { width: 160, height: 28 },
    { width: 60, height: 24 },
    { width: 160, height: 28 },
    { valor: 'Arquivos.formato', estado: 'valor' },
    fr('célula', { layout: NONE }, [refControl(30, false)]),
  );
  NEW_FIELDS['ref-cell'] = [{ key: 'valor', label: 'alvo', type: 'string' }, ESTADOS];
  DOCS['ref-cell'] = `# RefCell

A célula de uma coluna \`ref\` numa tabela (\`src/ui/RefCell.tsx\`, \`.ref-field.ref-cell\`, dentro da DataGrid): a versão compacta do ReferenceField. O alvo é **dado**: nenhuma seta é desenhada.

O desenho é o controle (\`.ref-control\`), igual ao do ReferenceField sem a camada: 24 px, centrado, fundo \`color-bg\`, borda de controle, raio 4, o ícone e o texto do alvo com reticências. Ele termina 30 px antes da direita: ali fica o IconButton **Limpar** (\`close\`, 28 px), **marcação filha**. Clicar abre o RefPicker compacto; Ctrl+clique vai ao alvo.

\`estado\`: \`valor\` (\`arrowRight\` \`accent\` e o rótulo do alvo), \`vazio\` ("Escolher…" com \`search\`, \`muted\`), \`quebrado\` ("(referência quebrada)" em \`warning\`, peso 600, borda \`warning\`) e \`invalido\` (borda \`danger\`).
`;
  EXAMPLES['ref-cell'] = [
    { name: 'Com alvo', values: { valor: 'Arquivos.formato', estado: 'valor' } },
    { name: 'Vazia', values: { valor: 'Escolher…', estado: 'vazio' } },
    { name: 'Quebrada', values: { valor: '(referência quebrada)', estado: 'quebrado' } },
  ];

  // ===========================================================================================
  // MarkingPicker: o popup "Ligar a…" (dialog.picker)
  // ===========================================================================================
  // .picker: color-surface, borda de controle, raio 8 (radius-lg), sombra de popup. Cabeçalho com 8 px em
  // cima e 12 à esquerda (o título t-heading centrado nos 28 px do fechar). Rodapé: 30 px de color-bg com a
  // divisória color-border em cima.
  COMPONENTS['marking-picker'] = base(
    'marking-picker',
    'MarkingPicker',
    'Moldura do seletor de marcação ("Ligar a…"): popup color-surface com borda de controle, raio 8, sombra, o título e a faixa do rodapé. Busca, opções e dicas são filhos.',
    { width: 600, height: 656 },
    { width: 200, height: 120 },
    { width: 600, height: 656 },
    { titulo: 'Ligar Filtro Status a…', rodape: 'sim' },
    fr('seletor', { layout: NONE, cornerRadius: 8, fill: C.surface, stroke: { color: C.control, width: 1 }, shadow: SHADOW_POPUP }, [
      fr('cabeçalho', { anchors: { left: 1, right: 1, top: 1 }, height: 36, layout: { type: 'row', padding: [8, 4, 0, 12], align: 'center' } }, [
        text('título', fieldText('titulo', 'Ligar a…'), C.text, font(13, 600, 20), { width: 'hug' }),
      ]),
      { type: 'rect', name: 'rodapé', height: 30, anchors: { left: 1, right: 1, bottom: 1 }, cornerRadius: [0, 0, 7, 7], fill: C.bg, visible: { $not: eq('rodape', 'não') } },
      { type: 'rect', name: 'divisória do rodapé', height: 1, anchors: { left: 1, right: 1, bottom: 31 }, fill: C.border, visible: { $not: eq('rodape', 'não') } },
    ]),
  );
  NEW_FIELDS['marking-picker'] = [
    { key: 'titulo', label: 'título', type: 'string', default: 'Ligar a…' },
    SIM_NAO('rodape', 'rodapé', 'sim'),
  ];
  DOCS['marking-picker'] = `# MarkingPicker

O seletor de marcação do **Ligar a…** dos Detalhes (\`src/ui/MarkingPicker.tsx\`): o mesmo popup do RefPicker (\`dialog.picker\`, no topo da tela, sem fundo escurecido), com a lista das marcações do projeto, sem as setas e sem a própria marcação. Escolher cria a seta e a seleciona.

O desenho é a moldura: \`color-surface\`, borda de controle, raio 8, a sombra de popup; o título (\`titulo\`, "Ligar Filtro Status a…", \`t-heading\`, 12 px da esquerda e 8 px abaixo do topo, centrado nos 28 px do fechar) e, com \`rodape\` \`sim\`, a faixa do rodapé (30 px de \`color-bg\` com a divisória \`color-border\` em cima). A largura é \`size-picker\` (600 px; 400 no compacto da RefCell) e a altura vai até a janela menos 32 px em cima e embaixo.

**Filhos:**

- o IconButton **Fechar** (\`close\`), à direita do título;
- a busca: TextField de 28 px (12 px de margem dos lados), com o foco;
- as opções (28 px, raio 4, 24 px de recuo à esquerda): a escolhida é uma Caixa \`accent\`; dentro, o Ícone \`marking\` (\`accent-text\` na escolhida), o rótulo (Texto \`t-code\`, com \`reticencias\`) e o caminho à direita ("Container › Marcação", Texto \`t-kbd\` \`muted\`; \`accent-text\` na escolhida);
- no rodapé, as dicas: cada tecla é uma Caixa com borda e raio 2 com o Texto \`t-kbd\` (↑ ↓, Enter, Esc) e a ação é Texto \`t-small\` \`muted\` (navegar, escolher, fechar).

No RefPicker (campo e célula \`ref\`) entram ainda a linha das etiquetas aceitas, as abas e os grupos por anotação; não foram conferidos nesta medição.

Não desenhado: o trecho que casa com a busca (em negrito \`accent\` dentro do rótulo) e a rolagem.
`;

  // ===========================================================================================
  // ViewModePanel: o popover "Mostrar no canvas" do modo visualização
  // ===========================================================================================
  // .popover (controls.css): color-surface, borda color-border, raio 6, sombra de popup, 8 px de margem.
  COMPONENTS['view-mode-panel'] = base(
    'view-mode-panel',
    'ViewModePanel',
    'Moldura do popover "Mostrar no canvas" do modo visualização: color-surface, borda color-border, raio 6, sombra de popup e o título. Os grupos e as opções são filhos.',
    { width: 280, height: 382 },
    { width: 120, height: 60 },
    { width: 280, height: 382 },
    { titulo: 'Mostrar no canvas' },
    fr('popover', { layout: NONE, cornerRadius: 6, fill: C.surface, stroke: { color: C.border, width: 1 }, shadow: SHADOW_POPUP }, [
      text('título', fieldText('titulo', 'Mostrar no canvas'), C.text, font(13, 600, 20), { anchors: { left: 9, top: 9 }, width: 'hug', height: 20 }),
    ]),
  );
  NEW_FIELDS['view-mode-panel'] = [{ key: 'titulo', label: 'título', type: 'string', default: 'Mostrar no canvas' }];
  DOCS['view-mode-panel'] = `# ViewModePanel

O painel **Mostrar no canvas** do modo visualização (\`src/ui/ViewModePanel.tsx\`; Alt+H entra no modo e abre o painel). Só para ver: nada se seleciona nem se edita.

O desenho é a moldura do popover (\`.popover.view-panel-popover\`, 280 px): \`color-surface\`, borda \`color-border\`, raio 6, sombra de popup, 8 px de margem, e o título (\`titulo\`, "Mostrar no canvas", \`t-heading\`).

**Filhos**, em coluna com 8 px entre os blocos:

- a dica "Só para ver: nada se seleciona nem se edita." (Texto \`t-body\` \`muted\`);
- **Elementos** (título do grupo em Texto \`t-small\` \`muted\`) e os Choices Containers, Imagens, Contorno das marcações, Nome das marcações e Setas (com a \`dica\` "continuam ligando os mesmos pontos");
- **Camadas com desenho**: um Choice por camada com componente, com o ponto da cor (LayerGroup \`ponto\`, 12 px) antes do nome (no rótulo do Choice, o lugar do ponto é um U+2060 e espaços não separáveis);
- o rodapé, à direita: Buttons \`sm\` **Mostrar tudo** e **Só as telas**.

O botão que reabre o painel na barra do canvas é um IconButton (Mostrar no canvas, ao lado do Visualizar \`pressionado\`); o aviso do modo na barra de status é Ícone e Texto. Não desenhado: o foco.
`;

  return { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL };
}
