// v9 · grupo revisao: o modo revisão de propostas do app (src/ui/review/*, src/theme/review.css, mcp-v0.25.0).
// Medidas de src/theme/review.css (e editor.css para o .popover), tokens de src/theme/tokens.ts.
// Átomos (DecisionMark, ChangeKind, Flag, ChangeMark, DiffValue) desenham tudo; os compostos (ReviewBar,
// ReviewRow, ReviewHeader, ProposalRow, ChangePopover, ImageCompare) só a moldura; DecisionControl,
// ChangeBelow, NoteField e OtherChanges só agrupam (estruturais: não têm fundo nem borda no app).
export function build(h) {
  const { C, tok, eq, sw, fr, text, font, fieldText, base, NONE, YES, SHADOW_POPUP } = h;
  const COMPONENTS = {};
  const DOCS = {};
  const EXAMPLES = {};
  const MONO = (size, weight, lh) => ({ ...font(size, weight, lh), family: tok('font-mono') });
  const ring = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const any = (...c) => ({ $or: c });
  const not = (c) => ({ $not: c });
  const all = (...c) => ({ $and: c });
  const SN = (key, label) => ({ key, label, type: 'enum', options: ['sim', 'não'], default: 'não' });
  const P16 = { viewBox: [16, 16], width: 'fill', height: 'fill' };

  // ---- DecisionMark: o estado pela forma (src/ui/review/DecisionMark.tsx; .decision-mark*).
  // Grade de 16 px, traço 1,25: círculo tracejado (2,1 2,1) = sem decisão; cheio com ✓ / ✕ (traço de 1,5 na cor
  // color-surface) = aceita / rejeitada; contorno com a metade esquerda cheia = parcial.
  const decisionShapes = (key) => [
    { type: 'path', name: 'sem decisão', ...P16, d: ring(8, 8, 5.75), fill: 'none', stroke: { color: C.muted, width: 1.25, align: 'center', dash: [2.1, 2.1], cap: 'round' }, visible: not(any(eq(key, 'aceita'), eq(key, 'rejeitada'), eq(key, 'parcial'))) },
    { type: 'path', name: 'disco', ...P16, d: ring(8, 8, 6.25), fill: sw(key, { aceita: C.success, rejeitada: C.danger }, C.text), visible: any(eq(key, 'aceita'), eq(key, 'rejeitada')) },
    { type: 'path', name: 'visto', ...P16, d: 'M5 8.3l2.2 2.2L11.2 5.9', fill: 'none', stroke: { color: C.surface, width: 1.5, align: 'center', cap: 'round', join: 'round' }, visible: eq(key, 'aceita') },
    { type: 'path', name: 'xis', ...P16, d: 'M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8', fill: 'none', stroke: { color: C.surface, width: 1.5, align: 'center', cap: 'round', join: 'round' }, visible: eq(key, 'rejeitada') },
    { type: 'path', name: 'contorno parcial', ...P16, d: ring(8, 8, 5.75), fill: 'none', stroke: { color: C.text, width: 1.25, align: 'center' }, visible: eq(key, 'parcial') },
    { type: 'path', name: 'metade', ...P16, d: 'M8 2.25a5.75 5.75 0 0 0 0 11.5Z', fill: C.text, visible: eq(key, 'parcial') },
  ];
  COMPONENTS['decision-mark'] = base(
    'decision-mark',
    'DecisionMark',
    'Estado de decisão de um nível, pela forma: círculo tracejado (sem decisão), cheio com ✓ (aceita, verde), cheio com ✕ (rejeitada, vermelho), metade cheia (parcial). 16 px; 12 px nas contagens.',
    { width: 16, height: 16 },
    { width: 8, height: 8 },
    { width: 16, height: 16 },
    { estado: 'sem-decisao' },
    fr('decisão', { layout: NONE }, decisionShapes('estado')),
  );
  DOCS['decision-mark'] = `# DecisionMark

Estado de decisão de um nível da revisão, só leitura (\`src/ui/review/DecisionMark.tsx\`, classes \`.decision-mark-*\` de \`src/theme/review.css\`). A **forma** diz o estado e a cor reforça:

| \`estado\` | Forma | Cor |
| --- | --- | --- |
| \`sem-decisao\` | círculo tracejado (raio 5,75, traço 1,25, traços de 2,1) | \`color-text-muted\` |
| \`aceita\` | disco cheio (raio 6,25) com ✓ | \`color-success\`, o ✓ em \`color-surface\` (traço 1,5) |
| \`rejeitada\` | disco cheio com ✕ | \`color-danger\`, o ✕ em \`color-surface\` |
| \`parcial\` | contorno com a metade esquerda cheia | \`color-text\` |

O desenho ocupa a marcação (a grade de 16 px escala): 16 px na linha da proposta, na linha dos níveis, no cabeçalho do item e na barra; 12 px nas contagens (\`.review-count\`) e dentro do marcador (ChangeMark, que já o desenha). Quem decide é o DecisionControl.
`;
  EXAMPLES['decision-mark'] = [
    { name: 'Sem decisão', values: { estado: 'sem-decisao' } },
    { name: 'Aceita', values: { estado: 'aceita' } },
    { name: 'Rejeitada', values: { estado: 'rejeitada' } },
    { name: 'Parcial', values: { estado: 'parcial' } },
  ];

  // ---- ChangeKind: selo neutro do tipo (.change-kind: 20 px, 18 px no sm; borda de controle, raio 4, ícone de 12 com traço 1,5).
  const GLYPH = { criada: 'plus', removida: 'minus', movida: 'moved', alterada: 'changed', trocada: 'replaced' };
  const glyphOf = (key) => sw(key, GLYPH, 'changed');
  COMPONENTS['change-kind'] = base(
    'change-kind',
    'ChangeKind',
    'Selo neutro do tipo de mudança: a forma diz o tipo, nunca a cor. Caixa de 20 px (18 px no tamanho sm) com borda de controle e o glifo: + criada, − removida, ⇄ movida, ∿ alterada, duas molduras para imagem trocada.',
    { width: 18, height: 18 },
    { width: 12, height: 12 },
    { width: 18, height: 18 },
    { tipo: 'alterada' },
    fr('tipo', { layout: NONE, cornerRadius: 4, stroke: { color: C.control, width: 1 } }, [
      { type: 'icon', name: glyphOf('tipo'), color: C.text, strokeWidth: 1.5, width: 12, height: 12, anchors: { centerX: true, centerY: true } },
    ]),
  );
  DOCS['change-kind'] = `# ChangeKind

Selo do tipo de mudança (\`src/ui/review/ChangeKind.tsx\`, \`.change-kind\`): neutro, a forma diz o tipo e nunca a cor (verde e vermelho ficam para aceita e rejeitada).

- \`tipo\`: \`criada\` (+), \`removida\` (−), \`movida\` (⇄), \`alterada\` (∿) ou \`trocada\` (imagem trocada, duas molduras).
- Caixa de \`size-icon\` + 4 = 20 px (\`size\` \`md\`) ou + 2 = 18 px (\`sm\`, nas linhas dos níveis, no popover e em Outras mudanças): borda de 1 px \`color-border-control\`, raio 4, ícone de 12 px em \`color-text\` com traço 1,5. O tamanho é o da marcação.
`;
  EXAMPLES['change-kind'] = Object.keys(GLYPH).map((tipo) => ({ name: tipo[0].toUpperCase() + tipo.slice(1), values: { tipo } }));

  // ---- Flag: pílula de 18 px (.flag: padding 0 6, gap 4, t-micro, borda de controle, raio cheio; tons warn/danger/ok/new).
  const TOM_FILL = { aviso: C.warningBg, perigo: C.dangerBg, ok: C.successBg, nova: C.accent };
  const TOM_COR = { aviso: C.warning, perigo: C.danger, ok: C.success, nova: C.accentText };
  const TOM_BORDA = { aviso: C.warning, perigo: C.danger, ok: C.success, nova: C.accent };
  COMPONENTS.flag = base(
    'flag',
    'Flag',
    'Pílula de 18 px com um fato sobre a linha (Nova, Aplicada, Conflito, Trancado, Envolvida, junto): texto t-micro, ícone opcional de 12 px; neutra com borda de controle ou num tom (aviso, perigo, ok, nova).',
    { width: 80, height: 18 },
    { width: 16, height: 14 },
    { width: 'hug', height: 18 },
    { texto: 'Nova', tom: 'nova' },
    fr('pílula', {
      cornerRadius: 999,
      fill: sw('tom', TOM_FILL, C.none),
      stroke: { color: sw('tom', TOM_BORDA, C.control), width: 1 },
      layout: { type: 'row', padding: [0, 6], gap: 4, align: 'center', justify: 'center' },
    }, [
      { type: 'icon', name: h.iconFromField('icone'), color: sw('tom', TOM_COR, C.text), width: 12, height: 12, visible: { $has: 'icone' } },
      text('texto', fieldText('texto', ''), sw('tom', TOM_COR, C.text), font(11, 600, 16, { wrap: 'none' })),
    ]),
  );
  DOCS.flag = `# Flag

Pílula com um fato sobre a linha (\`src/ui/review/Flag.tsx\`, \`.flag\` de \`src/theme/review.css\`): não é interativa e o texto aparece sempre, nunca só o ícone.

- \`texto\`: o fato ("Nova", "Aplicada", "Conflito", "Trancado", "Envolvida", "junto", "igual na nova"…).
- \`tom\`: \`neutro\` (borda \`color-border-control\`, texto \`color-text\`), \`aviso\` (\`warning\`/\`warning-bg\`, substituída e conflito), \`perigo\` (\`danger\`/\`danger-bg\`, envolvida e bloqueia aplicar), \`ok\` (\`success\`/\`success-bg\`, aplicada) ou \`nova\` (\`accent\` cheio, texto \`accent-text\`, a proposta que ninguém abriu).
- \`icone\`: opcional, chave do ícone (12 px) antes do texto (\`warning\`, \`lock\`, \`link\`, \`plus\`, \`minus\`, \`blocked\`).

Altura \`size-icon\` + 2 = 18 px, respiro de 6 px, \`t-micro\` (11/16, 600), raio cheio. A largura é a do texto: dê à marcação a largura medida.
`;
  EXAMPLES.flag = [
    { name: 'Nova', values: { texto: 'Nova', tom: 'nova' } },
    { name: 'Aplicada', values: { texto: 'Aplicada', tom: 'ok' } },
    { name: 'Conflito', values: { texto: 'Conflito', tom: 'aviso', icone: 'warning' } },
    { name: 'Trancado', values: { texto: 'Trancado', tom: 'neutro', icone: 'lock' } },
  ];

  // ---- ChangeMark: marcador do campo alterado (.change-mark: 18 px, padding 0 2, gap 2, borda de controle, raio 4;
  // ícones de 12; o tipo com traço 1,5). Conflito em âmbar com ⚠; parte de uma criação/remoção só com o tipo, tracejada.
  const PARTE = YES('parte');
  const CONF = YES('conflito');
  COMPONENTS['change-mark'] = base(
    'change-mark',
    'ChangeMark',
    'Marcador de um campo alterado na revisão: peça de 18 px com o tipo à esquerda e a decisão à direita (ícones de 12 px); conflito com ⚠ em âmbar, junto com o elo, parte de uma criação ou remoção tracejada e só com o tipo; aberto e alvo com a borda de destaque.',
    { width: 32, height: 18 },
    { width: 16, height: 14 },
    { width: 32, height: 18 },
    { tipo: 'alterada', estado: 'sem-decisao' },
    fr('marcador', { layout: NONE }, [
      fr('peça', {
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        cornerRadius: 4,
        fill: { $if: CONF, then: C.warningBg, else: { $if: YES('aberto'), then: C.selection, else: C.surface } },
        stroke: {
          color: { $if: PARTE, then: 'none', else: { $if: YES('alvo'), then: C.accent, else: { $if: CONF, then: C.warning, else: { $if: YES('aberto'), then: C.accent, else: C.control } } } },
          width: 1,
        },
        layout: { type: 'row', padding: [0, 2], gap: 2, align: 'center', justify: 'center' },
      }, [
        {
          type: 'icon',
          name: { $if: CONF, then: 'warning', else: { $if: YES('junto'), then: 'link', else: glyphOf('tipo') } },
          color: { $if: CONF, then: C.warning, else: { $if: PARTE, then: C.muted, else: C.text } },
          strokeWidth: 1.5,
          width: 12,
          height: 12,
        },
        fr('decisão', { width: 12, height: 12, layout: NONE, visible: not(PARTE) }, decisionShapes('estado')),
      ]),
      // A parte de uma criação ou remoção: a borda tracejada (stroke.dash não aceita expressão).
      { type: 'rect', name: 'parte', anchors: { left: 0, right: 0, top: 0, bottom: 0 }, cornerRadius: 4, fill: 'none', stroke: { color: C.control, width: 1, dash: [3, 3] }, visible: PARTE },
      // Inválido (bloqueia aplicar): o anel de 2 px por fora (box-shadow 0 0 0 2px color-danger).
      { type: 'rect', name: 'inválido', anchors: { left: 0, right: 0, top: 0, bottom: 0 }, cornerRadius: 4, fill: 'none', stroke: { color: C.danger, width: 2, align: 'outside' }, visible: YES('invalido') },
    ]),
  );
  DOCS['change-mark'] = `# ChangeMark

Marcador de um campo alterado, nos Detalhes da revisão e em Outras mudanças (\`src/ui/review/ChangeMark.tsx\`, \`.change-mark\` de \`src/theme/review.css\`). É um botão: abre o ChangePopover (pelo hover, foco ou clique) e, focado, recebe os atalhos A, R e Backspace.

- \`tipo\`: o glifo do ChangeKind à esquerda (\`criada\`, \`removida\`, \`movida\`, \`alterada\`, \`trocada\`), ícone de 12 px com traço 1,5.
- \`estado\`: a forma do DecisionMark à direita (\`sem-decisao\`, \`aceita\`, \`rejeitada\`), 12 px.
- \`conflito\` \`sim\`: o glifo vira ⚠ e a peça fica em \`color-warning\`/\`color-warning-bg\`.
- \`junto\` \`sim\`: o glifo vira o elo (decidida junto, pelas dependências).
- \`parte\` \`sim\`: parte de uma criação ou remoção inteira: só o tipo, em \`color-text-muted\`, com a borda tracejada (18 × 18).
- \`aberto\` \`sim\` (popover aberto): fundo \`color-selection\` e borda \`color-accent\`; \`alvo\` \`sim\` (a mudança selecionada na janela Propostas): borda \`color-accent\`.
- \`invalido\` \`sim\`: o anel de 2 px \`color-danger\` por fora.

Medidas: altura \`size-icon\` + 2 = 18 px, respiro de 2 px, 2 px entre os ícones, borda de 1 px \`color-border-control\`, raio 4, fundo \`color-surface\`. O hover (\`color-hover\`) e o anel de foco não são desenhados. O tracejado da parte é aproximado (3 3; o app usa o \`dashed\` do navegador).
`;
  EXAMPLES['change-mark'] = [
    { name: 'Alterado, sem decisão', values: { tipo: 'alterada', estado: 'sem-decisao' } },
    { name: 'Movido, aceito', values: { tipo: 'movida', estado: 'aceita' } },
    { name: 'Conflito', values: { tipo: 'alterada', estado: 'sem-decisao', conflito: 'sim' } },
    { name: 'Parte de uma criação', values: { tipo: 'criada', parte: 'sim' } },
    { name: 'Aberto', values: { tipo: 'alterada', estado: 'rejeitada', aberto: 'sim' } },
  ];

  // ---- DiffValue: grade de duas colunas (72 px | 1fr, gap 2 8), rótulo t-small muted; o valor numa pílula mono
  // (t-code, padding 2 6, raio 4): antes em color-bg/muted, depois em color-selection/600, atual em warning-bg com borda.
  const KIND_FILL = { antes: C.bg, depois: C.selection, atual: C.warningBg };
  COMPONENTS['diff-value'] = base(
    'diff-value',
    'DiffValue',
    'Valores de um campo, um por linha (Atual, Proposto; no conflito Antes, Depois e Atual): o rótulo à esquerda e o valor em fonte mono numa pílula, sem vermelho nem verde: o que muda se destaca por peso e fundo.',
    { width: 300, height: 46 },
    { width: 80, height: 22 },
    { width: 'fill', height: 'hug' },
    { linhas: [{ tipo: 'antes', rotulo: 'Atual', valor: 'Salvar' }, { tipo: 'depois', rotulo: 'Proposto', valor: 'Salvar alterações' }] },
    fr('valores', { layout: { type: 'column' } }, [
      {
        type: 'repeat',
        name: 'linhas',
        field: 'linhas',
        direction: 'column',
        gap: 2,
        template: fr('linha', { width: 'fill', height: 22, layout: { type: 'row', gap: 8, align: 'center' } }, [
          fr('rótulo', { width: 72, height: 'hug', layout: { type: 'row', gap: 2, align: 'center' } }, [
            { type: 'icon', name: 'warning', color: C.warning, width: 12, height: 12, visible: eq('tipo', 'atual') },
            text('rótulo', fieldText('rotulo', ''), C.muted, font(12, 400, 16, { wrap: 'none' })),
          ]),
          fr('valor', {
            width: 'hug',
            height: 22,
            cornerRadius: 4,
            fill: sw('tipo', KIND_FILL, C.none),
            stroke: { color: { $if: eq('tipo', 'atual'), then: C.warning, else: 'none' }, width: 1 },
            layout: { type: 'row', padding: [2, 6], align: 'center' },
          }, [
            text('valor', fieldText('valor', ''), sw('tipo', { antes: C.muted, igual: C.muted }, C.text), { ...MONO(12, sw('tipo', { depois: 600 }, 400), 18), wrap: 'none' }),
          ]),
        ]),
      },
    ]),
  );
  DOCS['diff-value'] = `# DiffValue

Os valores de um campo alterado (\`src/ui/review/DiffValue.tsx\`, \`.diff-value\` de \`src/theme/review.css\`), no ChangePopover: uma linha por valor, sem vermelho nem verde.

- \`linhas\` (tabela): uma linha por valor, com \`tipo\`, \`rotulo\` e \`valor\`.
  - \`antes\` (o valor atual, que sai): texto \`color-text-muted\` em \`color-bg\`.
  - \`depois\` (o proposto): peso 600 em \`color-selection\`.
  - \`atual\` (o valor de agora, no conflito): fundo \`color-warning-bg\` com borda \`color-warning\` e o ⚠ antes do rótulo.
  - \`igual\`: sem fundo, \`color-text-muted\`.
- Rótulo em \`t-small\` \`color-text-muted\` numa coluna de 72 px (\`3 × space-6\`), 8 px até o valor, 2 px entre as linhas; o valor em \`t-code\` (12/18, mono) numa pílula de raio 4 com respiro 2 × 6 (22 px de altura).

Não desenhado: o negrito só no número que muda (na Posição, \`x 392 → 404\`), a quebra de um valor longo (o app quebra em qualquer ponto e corta em 6 linhas no popover; o desenho mostra uma linha) e as linhas de tabela (\`ol\`) de um campo \`table\`.
`;

  // ---- ReviewBar: faixa de 40 px (size-stripe) em color-selection com a borda de baixo color-accent.
  COMPONENTS['review-bar'] = base(
    'review-bar',
    'ReviewBar',
    'Moldura da faixa do modo revisão: 40 px em color-selection com a divisória color-accent embaixo. O selo REVISÃO, o título, a origem, o progresso, as contagens e as ações são marcações filhas.',
    { width: 1440, height: 40 },
    { width: 120, height: 24 },
    { width: 'fill', height: 40 },
    {},
    fr('faixa', { layout: NONE, fill: C.selection }, [
      { type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.accent },
    ]),
  );
  DOCS['review-bar'] = `# ReviewBar

Faixa do modo revisão, logo abaixo da barra principal (\`src/ui/review/ReviewBar.tsx\`, \`.review-bar\` de \`src/theme/review.css\`): 40 px (\`size-stripe\`), fundo \`color-selection\`, divisória de 1 px \`color-accent\` embaixo, respiro 0 8 0 12, 12 px entre os blocos.

**Filhos esperados** (marcações):
- o selo **REVISÃO** (\`.review-badge\`): Caixa \`fundo\` \`accent\`, \`raio\` \`xs\`, 20 px de altura, com o Ícone \`proposal\` e o Texto \`t-micro\` em \`accent-text\`;
- o título (Texto \`t-body-strong\`, com reticências) e a origem (Texto \`t-small\` \`muted\`);
- o progresso (\`.review-progress\`, 120 × 6): Caixa \`surface\` com borda \`control\` e raio cheio, e as partes aceitas e rejeitadas em Caixas \`success-bg\`/\`danger-bg\` (a Caixa não tem o verde nem o vermelho cheios do app);
- as contagens: DecisionMark + número (Texto \`t-body-strong\`) + rótulo (Texto \`t-small\` \`muted\`), e o ⚠ dos conflitos;
- as ações: Button Rejeitar tudo, Aceitar tudo, Aplicar aceitas · N (\`primary\`) e Sair da revisão (\`ghost\`). Abaixo de 1200 px o lote vira um menu "Em lote" e as contagens ficam só com o ícone.
`;

  // ---- ReviewRow: linha de 28 px (row-height), raio 4; selecionada em color-selection; inválida em danger-bg com a barra de 2 px.
  COMPONENTS['review-row'] = base(
    'review-row',
    'ReviewRow',
    'Moldura da linha dos níveis da revisão (28 px, raio 4): fundo color-selection na selecionada, color-danger-bg com a barra de 2 px à esquerda na inválida. Chevron, decisão, tipo, rótulo, resumo e o DecisionControl são marcações filhas.',
    { width: 720, height: 28 },
    { width: 120, height: 20 },
    { width: 'fill', height: 28 },
    { selecionada: 'não', invalida: 'não' },
    fr('linha', {
      layout: NONE,
      cornerRadius: 4,
      fill: { $if: YES('invalida'), then: C.dangerBg, else: { $if: YES('selecionada'), then: C.selection, else: C.none } },
    }, [
      { type: 'rect', name: 'barra de inválida', width: 2, anchors: { left: 0, top: 0, bottom: 0 }, fill: C.danger, visible: YES('invalida') },
    ]),
  );
  DOCS['review-row'] = `# ReviewRow

Linha dos níveis da revisão, na janela Propostas (\`src/ui/review/ReviewRow.tsx\`, \`.review-row\` de \`src/theme/review.css\`): grade de três colunas (nome, mínimo 208 px; resumo até 232 px; decisão, 60 px) com 8 px entre elas, 28 px de altura (\`row-height\`), respiro lateral de 8 px e raio 4.

- \`selecionada\` \`sim\`: fundo \`color-selection\` (o rótulo vai a 600).
- \`invalida\` \`sim\` (faz parte do conjunto que bloqueia Aplicar): fundo \`color-danger-bg\` com a barra de 2 px \`color-danger\` à esquerda.

**Filhos esperados:** o chevron (Ícone \`chevronDown\`/\`chevronRight\` \`muted\`; recuo de 16 px por nível), o DecisionMark, o ChangeKind (\`sm\`), o rótulo (Texto), os sinalizadores (Flag), o resumo (contagens com DecisionMark de 12 px, ou "antes → depois" em Texto \`t-code\` \`muted\`) e o DecisionControl (dois IconButton \`sm\` \`accept\`/\`reject\`). O hover (\`color-hover\`) não é desenhado.
`;

  // ---- ReviewHeader: caixa color-bg, borda color-border, raio 6 (.review-header, padding 8 12, gap 8).
  COMPONENTS['review-header'] = base(
    'review-header',
    'ReviewHeader',
    'Moldura do cabeçalho do item nos Detalhes da revisão: caixa color-bg com borda color-border e raio 6. O estado, a decisão, a nota, as dicas e os avisos são marcações filhas.',
    { width: 334, height: 120 },
    { width: 120, height: 40 },
    { width: 'fill', height: 'hug' },
    {},
    fr('cabeçalho', { layout: NONE, fill: C.bg, cornerRadius: 6, stroke: { color: C.border, width: 1 } }),
  );
  DOCS['review-header'] = `# ReviewHeader

Cabeçalho do item selecionado nos Detalhes da revisão (\`src/ui/review/ReviewHeader.tsx\`, \`.review-header\` de \`src/theme/review.css\`): caixa \`color-bg\` com borda de 1 px \`color-border\`, raio 6, respiro 8 × 12 e 8 px entre as linhas.

**Filhos esperados**, de cima para baixo:
- o estado: DecisionMark, o tipo do item em Texto \`t-body-strong\` ("Marcação alterada", "Proposta", "Grupo Projeto"…) e as contagens em Texto \`t-small\` \`muted\`;
- a decisão: o DecisionControl em texto (Button \`accept\` "Aceitar marcação" e \`reject\` "Rejeitar marcação") e o IconButton \`note\` (\`sm\`);
- as dicas (Texto \`t-small\` \`muted\`), a NoteField, a lista do que é criado ou removido junto e os avisos (Notice \`sm\`: conjunto inválido, trancado, junto, proposta aplicada ou substituída).
`;

  // ---- ProposalRow: linha da lista com a divisória de baixo (padding 6 12, gap 6 12).
  COMPONENTS['proposal-row'] = base(
    'proposal-row',
    'ProposalRow',
    'Moldura da linha da lista de propostas: a divisória color-border embaixo. Estado, título, status, contexto, contagens e a ação são marcações filhas.',
    { width: 736, height: 49 },
    { width: 120, height: 28 },
    { width: 'fill', height: 49 },
    {},
    fr('linha', { layout: NONE }, [
      { type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.border },
    ]),
  );
  DOCS['proposal-row'] = `# ProposalRow

Linha da lista de propostas, na janela Propostas (\`src/ui/review/ProposalRow.tsx\`, \`.proposal-row\` de \`src/theme/review.css\`): flex que quebra (as contagens e a ação descem em janela estreita), respiro 6 × 12, 6 px na vertical e 12 na horizontal entre os blocos, divisória de 1 px \`color-border\` embaixo.

**Filhos esperados:**
- o DecisionMark do conjunto (16 px);
- o título (Texto \`t-body-strong\` com reticências) e a Flag do status (\`nova\` "Nova", \`ok\` "Aplicada", \`aviso\` "Substituída", neutra "Em revisão" ou "Retirada");
- o contexto "origem · autor · data" (Texto \`t-small\` \`muted\`, com reticências);
- as contagens (coluna de 236 px): DecisionMark de 12 px + número, para sem decisão, aceitas e rejeitadas; ou "N mudança(s) aplicada(s)" (Texto \`muted\`);
- a ação: Button "Revisar" (\`primary\` na proposta nova), "Continuar" ou "Ver".

O hover (\`color-hover\`) não é desenhado.
`;

  // ---- ChangePopover: o painel do Popover (.popover: padding 8, color-surface, borda color-border, raio 6, sombra de popup),
  // 320 px (size-change-popover).
  COMPONENTS['change-popover'] = base(
    'change-popover',
    'ChangePopover',
    'Moldura do popover de um marcador (320 px): painel color-surface com borda color-border, raio 6 e a sombra de popup. Título, valores, ajuda, rodapé com a decisão e a nota são marcações filhas.',
    { width: 320, height: 160 },
    { width: 120, height: 60 },
    { width: 320, height: 'hug' },
    {},
    fr('popover', { layout: NONE, fill: C.surface, cornerRadius: 6, stroke: { color: C.border, width: 1 }, shadow: SHADOW_POPUP }),
  );
  DOCS['change-popover'] = `# ChangePopover

Popover de um marcador (ChangeMark), nos Detalhes da revisão (\`src/ui/review/ChangePopover.tsx\` dentro do \`Popover\` da app; \`.popover\` de \`src/theme/editor.css\` e \`.change-popover*\` de \`src/theme/review.css\`): 320 px (\`size-change-popover\`), respiro 8, fundo \`color-surface\`, borda \`color-border\`, raio 6 e a sombra de popup; o conteúdo é uma coluna com 8 px entre os blocos.

**Filhos esperados:**
- a cabeça: ChangeKind (\`sm\`), o título "Campo · tipo" (Texto \`t-heading\`) e as Flag (Conflito, Envolvida, junto, Aplicada, a comparação com a nova);
- os valores: DiffValue (ou a lista das linhas de uma tabela);
- a ajuda do efeito (Texto \`t-small\`);
- o rodapé, com a divisória de cima (Caixa \`lados\` \`cima\`): DecisionMark + "Decisão: …" (Texto \`t-small\`), os Button \`sm\` Aceitar (\`accept\`) e Rejeitar (\`reject\`), o IconButton \`note\` e a NoteField.

A seta de rolagem e o limite abaixo da ReviewBar são comportamento, não desenho.
`;

  // ---- ImageCompare: a área de comparação (.image-compare-stage: color-canvas-bg, borda de controle, raio 4), a divisória
  // de 2 px (cv-line com o halo cv-halo), a alça de 28 px (color-surface, borda de controle, sombra de popup, ícone compare) e
  // as etiquetas Antes / Depois (t-micro, cv-line sobre cv-badge, raio 2). NÃO conferido numa captura (a fixture não tem imagem trocada).
  const tag = (label, anchors, visible) =>
    fr(`etiqueta ${label}`, {
      width: 'hug',
      height: 18,
      anchors,
      visible,
      fill: tok('cv-badge'),
      cornerRadius: 2,
      stroke: { color: tok('cv-line'), width: 1 },
      layout: { type: 'row', padding: [0, 6], align: 'center' },
    }, [text('texto', label, tok('cv-line'), font(11, 600, 16, { wrap: 'none' }))]);
  const SIDE = eq('modo', 'lado-a-lado');
  const pane = (label) =>
    fr(`lado ${label}`, { width: 'fill', height: 'fill', layout: { type: 'column', gap: 4 } }, [
      fr('imagem', { width: 'fill', height: 'fill', layout: NONE, fill: tok('color-canvas-bg'), cornerRadius: 4, stroke: { color: C.control, width: 1 } }),
      fr('legenda', { width: 'fill', height: 18, layout: { type: 'row', align: 'center' } }, [tag(label, undefined, undefined)]),
    ]);
  COMPONENTS['image-compare'] = base(
    'image-compare',
    'ImageCompare',
    'Comparação antes/depois de uma imagem trocada: a área em color-canvas-bg com as etiquetas Antes e Depois, a divisória e a alça de 28 px (deslizar), só a alça (sobrepor) ou as duas imagens lado a lado.',
    { width: 480, height: 270 },
    { width: 160, height: 96 },
    { width: 'fill', height: 270 },
    { modo: 'deslizar' },
    fr('comparação', { layout: NONE }, [
      fr('área', {
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        visible: not(SIDE),
        layout: NONE,
        fill: tok('color-canvas-bg'),
        cornerRadius: 4,
        stroke: { color: C.control, width: 1 },
      }, [
        tag('Antes', { left: 8, top: 8 }),
        tag('Depois', { right: 8, top: 8 }),
        { type: 'rect', name: 'divisória', width: 2, anchors: { centerX: true, top: 0, bottom: 0 }, fill: tok('cv-line'), stroke: { color: tok('cv-halo'), width: 1, align: 'outside' }, visible: not(eq('modo', 'sobrepor')) },
        fr('alça', {
          width: 28,
          height: 28,
          anchors: { centerX: true, centerY: true },
          layout: { type: 'row', align: 'center', justify: 'center' },
          fill: C.surface,
          cornerRadius: 999,
          stroke: { color: C.control, width: 1 },
          shadow: SHADOW_POPUP,
        }, [h.iconNode('compare', C.text)]),
      ]),
      fr('lado a lado', { anchors: { left: 0, right: 0, top: 0, bottom: 0 }, visible: SIDE, layout: { type: 'row', gap: 8 } }, [pane('Antes'), pane('Depois')]),
    ]),
  );
  DOCS['image-compare'] = `# ImageCompare

Comparação antes/depois de uma imagem trocada (\`src/ui/review/ImageCompare.tsx\`, aberto pelo CompareDialog de \`ReviewCanvasControls.tsx\`; \`.image-compare*\` de \`src/theme/review.css\`).

- \`modo\` \`deslizar\` (o padrão): a área (\`color-canvas-bg\`, borda \`color-border-control\`, raio 4) com o depois por baixo e o antes recortado até a divisória; a divisória de 2 px (\`cv-line\`, halo \`cv-halo\`) e a alça redonda de 28 px (\`color-surface\`, borda de controle, sombra de popup, ícone \`compare\`) no meio; as etiquetas "Antes" e "Depois" (\`t-micro\` em \`cv-line\` sobre \`cv-badge\`, raio 2) nos cantos de cima, a 8 px.
- \`modo\` \`sobrepor\`: a mesma área, sem a divisória; a alça no meio controla a mistura.
- \`modo\` \`lado-a-lado\`: as duas imagens em duas colunas (8 px entre elas), cada uma com a etiqueta embaixo.

O desenho mostra a moldura no ponto de 50% (o padrão do app); as imagens são bitmaps e não são desenhadas. Ficam como marcações filhas o Segmented do modo (Lado a lado / Deslizar / Sobrepor), os nomes "Antes: … · Depois: …" (Texto \`t-small\` \`muted\`) e a decisão da troca (o DecisionControl em texto).

**Não conferido numa captura:** a fixture medida não tem imagem trocada; o desenho saiu do CSS e do código da 0.25.0.
`;
  EXAMPLES['image-compare'] = [
    { name: 'Deslizar', values: { modo: 'deslizar' } },
    { name: 'Sobrepor', values: { modo: 'sobrepor' } },
    { name: 'Lado a lado', values: { modo: 'lado-a-lado' } },
  ];

  // ---- Estruturais: só agrupam (o app não desenha fundo nem borda neles).
  DOCS['decision-control'] = `# DecisionControl

Par ✓ ✕ que decide um nível da revisão (\`src/ui/review/DecisionControl.tsx\`, \`.decision-control\`): nenhum marcado é "sem decisão"; apertar o marcado limpa. Decidir grava na hora, sem confirmação. É **estrutural**: só agrupa, o app não desenha nada nele.

**Filhos esperados:**
- versão de ícone (linhas dos níveis): dois IconButton \`sm\`, \`check\` com \`variant\` \`accept\` e \`close\` com \`variant\` \`reject\`, 2 px entre eles; o marcado fica com \`pressionado\` \`sim\`;
- versão de texto (cabeçalho do item, decisão da imagem): dois Button, \`accept\` ("Aceitar marcação") e \`reject\` ("Rejeitar marcação"), 6 px entre eles, que dividem a largura.

Atalhos: A aceita, R rejeita, Backspace limpa.
`;
  DOCS['change-below'] = `# ChangeBelow

A linha embaixo do controle de um campo alterado nos Detalhes da revisão (\`src/ui/review/ChangeBelow.tsx\`, \`.change-below\`): coluna com 4 px entre as linhas, 4 px abaixo do controle. Sem nota e sem comparação, não aparece. É **estrutural**: só agrupa, o app não desenha nada nele.

**Filhos esperados:**
- numa proposta que substitui outra: a Flag da comparação ("igual na nova", "diferente na nova"; \`perigo\` em "não consta na nova");
- cada nota da mudança: o Ícone \`note\` (12 px, \`muted\`) e o texto (Texto \`t-small\` \`muted\`), 4 px entre eles.
`;
  DOCS['note-field'] = `# NoteField

Nota para o agente (\`src/ui/review/NoteField.tsx\`, \`.review-note-field\`): no cabeçalho do item (a nota do item) e no popover de uma mudança (a nota da mudança). Grava ao sair do campo; texto vazio apaga a nota. É **estrutural**: coluna com 4 px entre as linhas, sem fundo nem borda.

**Filhos esperados:** o TextField de várias linhas (\`linhas\` \`varias\`, 2 linhas, \`placeholder\` "Ex.: a posição antiga estava certa.") e a dica "Grava ao sair do campo." (Texto \`t-small\` \`muted\`); numa nota que veio de uma mudança retirada, antes, o Texto "Da mudança retirada: …".
`;
  DOCS['other-changes'] = `# OtherChanges

As seções "Outras mudanças" e "Imagens" dos Detalhes da revisão (\`src/ui/review/OtherChanges.tsx\`: \`OtherChangesSection\`, \`OtherChangeRow\` e \`ImagesSection\`): o que não tem campo no painel normal (origem, trava, troca de imagem, posição da imagem, camadas, especializações e repositórios) e as imagens com mudanças. É **estrutural**: a seção recolhível (\`.details-section\`) não tem fundo nem borda.

**Filhos esperados:**
- a cabeça da seção: Ícone \`chevronDown\` (\`muted\`), o título (Texto \`t-heading\`) e a contagem (Texto \`t-small\` \`muted\`);
- uma linha por mudança (\`.other-change-row\`, 4 px entre elas): Caixa com borda \`border\`, raio \`sm\`, 28 px de altura mínima e respiro 2 × 6 (na mudança selecionada na janela Propostas, \`fundo\` \`selection\` e borda \`accent\`); dentro, o ChangeKind (\`sm\`), o título (Texto \`t-body-strong\`), o resumo (Texto \`t-small\` \`muted\`, com reticências) e o ChangeMark;
- na seção Imagens, cada linha leva o nome da imagem (Texto \`t-body-strong\`), as contagens (DecisionMark de 12 px + número) e o Button \`sm\` "Abrir".
`;
  const STRUCTURAL = ['decision-control', 'change-below', 'note-field', 'other-changes'];

  const TIPOS = ['criada', 'removida', 'movida', 'alterada', 'trocada'];
  const NEW_FIELDS = {
    'decision-mark': [{ key: 'estado', label: 'estado', type: 'enum', options: ['sem-decisao', 'aceita', 'rejeitada', 'parcial'], default: 'sem-decisao' }],
    'change-kind': [{ key: 'tipo', label: 'tipo', type: 'enum', options: TIPOS, default: 'alterada' }],
    flag: [
      { key: 'texto', label: 'texto', type: 'string' },
      { key: 'tom', label: 'tom', type: 'enum', options: ['neutro', 'aviso', 'perigo', 'ok', 'nova'], default: 'neutro' },
      { key: 'icone', label: 'ícone', type: 'string' },
    ],
    'change-mark': [
      { key: 'tipo', label: 'tipo', type: 'enum', options: TIPOS, default: 'alterada' },
      { key: 'estado', label: 'estado', type: 'enum', options: ['sem-decisao', 'aceita', 'rejeitada'], default: 'sem-decisao' },
      SN('conflito', 'conflito'),
      SN('junto', 'junto'),
      SN('parte', 'parte de criação/remoção'),
      SN('aberto', 'aberto'),
      SN('alvo', 'alvo'),
      SN('invalido', 'inválido'),
    ],
    'diff-value': [
      {
        key: 'linhas',
        label: 'linhas',
        type: 'table',
        columns: [
          { key: 'tipo', label: 'tipo', type: 'enum', options: ['antes', 'depois', 'atual', 'igual'], default: 'antes' },
          { key: 'rotulo', label: 'rótulo', type: 'string' },
          { key: 'valor', label: 'valor', type: 'string' },
        ],
      },
    ],
    'review-row': [SN('selecionada', 'selecionada'), SN('invalida', 'inválida')],
    'image-compare': [{ key: 'modo', label: 'modo', type: 'enum', options: ['deslizar', 'sobrepor', 'lado-a-lado'], default: 'deslizar' }],
  };
  return { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL };
}
