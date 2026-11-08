// Gera especializacoes/mapping-ds.json a partir do mapa de docs/DESIGN-SYSTEM.md do repo Mapping
// e confere, para cada tipo, que o arquivo existe e que o símbolo aparece nele.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyLibrary, ICON_SET, MIGRATIONS, themeTokens } from './lib.mjs';

const REPO = 'C:/Pessoal/mapping/repo';
// PKG=<pasta>: grava o pacote noutra pasta (a prévia de um grupo, sem tocar no pacote de verdade).
const PKG = process.env.PKG ?? 'C:/Pessoal/mapping/workspace/especializacoes/mapping-ds';
const OUT = `${PKG}/mapping-ds.spec.json`;
const write = (rel, text) => {
  const p = `${PKG}/${rel}`;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
const json = (rel, obj) => write(rel, JSON.stringify(obj, null, 2) + '\n');
// O repositório em que os símbolos e caminhos foram conferidos (e de onde saem tokens e ícones).
const REF = 'mcp-v0.28.1';

const SIM_NAO = ['sim', 'não'];
const yes = { sim: 'true', não: 'false' };
const f = {
  str: (key, label, extra = {}) => ({ key, ...(label ? { label } : {}), type: 'string', ...extra }),
  en: (key, options, def, extra = {}) => ({ key, type: 'enum', options, ...(def ? { default: def } : {}), ...extra }),
  bool: (key, label, def = 'não') => ({ key, ...(label ? { label } : {}), type: 'enum', options: SIM_NAO, default: def }),
};

// [id, name, description, symbol, path, { fields, labelField, params, values, notes }]
const T = [];
const add = (id, name, description, symbol, path, o = {}) => T.push({ id, name, description, symbol, path, ...o });

// ---- Primitivos: o que não é componente no código, mas é item da tela (tokens de tipografia, cor,
// raio e sombra, os ícones, as iniciais e as pílulas do CSS). Só o Ícone tem código.
add('text', 'Texto', 'Texto solto da interface com um estilo de tipografia do DS (t-* de src/theme/tokens.ts) e uma cor dos tokens: títulos, rótulos, nomes, mensagens, células. O texto de um controle é campo do próprio controle.', 'span', null, {
  params: { texto: 'children' },
  notes: 'Elemento JSX com o texto traduzido por t(). O estilo e a cor vêm do CSS da classe do elemento: font: var(--t-text…) (os papéis t-text, t-text-small, t-text-heading, t-text-title ou a escala t-*) e color: var(--color-…); a classe muted dá color-text-muted. Nenhum valor literal de fonte ou cor (regra do projeto).',
});
add('icon', 'Ícone', 'Ícone decorativo do app (Icon de src/ui/icons.tsx): 16 px, traço 1,25, na cor do texto em volta. Ícone clicável é IconButton.', 'Icon', 'src/ui/icons.tsx', {
  params: { icone: 'name' },
  notes: 'A cor vem do currentColor do elemento em volta: aplique a cor no pai.',
});
add('avatar', 'Iniciais', 'As iniciais do autor num círculo: .thread-avatar (24 px, mensagem e lista de conversas) e .comments-avatar (16 px, coluna Por da janela Comentários).', 'span', 'src/ui/comments/ThreadMessage.tsx', {
  params: { iniciais: 'children' },
  values: { estilo: { conversa: 'class="thread-avatar"', tabela: 'class="comments-avatar"' } },
  notes: 'As iniciais vêm de initials(author) (src/model/threadUsers.ts); o span leva aria-hidden="true".',
});
add('badge', 'Selo', 'Pílula de texto curto, cada estilo uma classe do CSS: .tag, .thread-message-agent, .thread-state-*, .tab-badge, .comments-badge-* e .badge-warning.', 'span', null, {
  params: { texto: 'children' },
  values: {
    estilo: {
      tag: 'class="tag"',
      agente: 'class="thread-message-agent"',
      'estado-agente': 'class="thread-state thread-state-agent"',
      'estado-humano': 'class="thread-state thread-state-human"',
      'estado-resolvida': 'class="thread-state thread-state-resolved"',
      contagem: 'class="tab-badge"',
      'contagem-info': 'class="tab-badge tab-badge-info"',
      status: 'class="comments-badge"',
      'status-agente': 'class="comments-badge comments-badge-agent"',
      'status-resolvida': 'class="comments-badge comments-badge-resolved"',
      preview: 'class="badge badge-warning"',
    },
  },
  notes: 'Elemento JSX com a classe do estilo; o texto vem de t(). O contador de aba é o badge do TabItem, não um span solto.',
});
add('box', 'Caixa', 'Região com fundo, borda, raio e sombra dos tokens, para o que não é componente: barras, faixas, linhas de tabela, divisórias, fundo de linha selecionada.', 'div', null, {
  notes: 'Elemento JSX (div, header, nav, tr…) com uma classe cujo CSS usa só tokens: background: var(--color-…), border: 1px solid var(--color-border) ou var(--color-border-control), border-radius: var(--radius-…), box-shadow: var(--shadow-popup). Nenhum valor literal (regra do projeto; tests/theme/tokenLiterals.test.ts confere).',
});

// ---- Controles e moldura da app
add('button', 'Button', 'Botão com texto. Use para uma ação da tela; o estado (hover, pressionado, foco, desabilitado) vem do CSS e dos tokens, não do componente. As variantes accept e reject são os botões de decisão da revisão.',
  'Button', 'src/ui/controls/Button.tsx', {
    labelField: 'texto',
    fields: [
      f.str('texto', 'texto', { required: true }),
      f.en('variant', ['default', 'primary', 'danger', 'accept', 'reject', 'ghost'], 'default'),
      f.en('size', ['md', 'sm'], 'md'),
      f.bool('desabilitado', 'desabilitado'),
    ],
    params: { variant: 'variant', size: 'size', desabilitado: 'disabled' },
    values: { desabilitado: yes },
    notes: 'O texto vai como filho (children), não como prop. Para um link com a aparência de botão, use LinkButton, do mesmo arquivo (prop href).',
  });
add('icon-button', 'IconButton', 'Botão só com ícone. O rótulo é obrigatório porque vira o nome acessível e o texto do Tooltip; não use onde cabe um Button com texto.',
  'IconButton', 'src/ui/controls/IconButton.tsx', {
    labelField: 'rotulo',
    fields: [
      f.str('icone', 'ícone', { required: true }),
      f.str('rotulo', 'rótulo', { required: true }),
      f.str('tooltip'),
      f.en('variant', ['default', 'danger', 'accept', 'reject'], 'default'),
      f.en('size', ['md', 'sm'], 'md'),
      f.str('atalho', 'atalho'),
      f.bool('pressionado', 'pressionado'),
      f.bool('alerta', 'alerta'),
      f.str('selo', 'selo'),
    ],
    params: { icone: 'icon', rotulo: 'label', tooltip: 'tooltip', variant: 'variant', size: 'size', atalho: 'shortcut', pressionado: 'pressed', alerta: 'alert', selo: 'badge' },
    values: { pressionado: yes, alerta: yes },
    notes: 'O ícone é o nome (chave camelCase) de um ícone de src/ui/icons.tsx. Para um link com a aparência de IconButton, use IconLink, do mesmo arquivo (prop href).',
  });
add('text-field', 'TextField', 'Campo de texto de uma linha. Com onCommit (CommitInput) só grava ao confirmar; sem ele é controlado por value/onInput. Para várias linhas, use TextArea.',
  'TextField', 'src/ui/controls/TextField.tsx', {
    labelField: 'rotulo',
    fields: [f.str('rotulo', 'rótulo'), f.str('valor', 'valor'), f.en('size', ['md', 'sm'], 'md'), f.bool('invalido', 'inválido')],
    params: { rotulo: 'label', valor: 'value', size: 'size', invalido: 'invalid' },
    values: { invalido: yes },
    notes: 'TextArea (mesmo arquivo) é a versão de várias linhas. O onCommit vem de CommitInput (src/ui/CommitInput.tsx).',
  });
add('select', 'Select', 'Seleção de uma opção numa lista. Use para conjuntos fechados; as opções entram como filhos.',
  'Select', 'src/ui/controls/Select.tsx', {
    labelField: 'rotulo',
    fields: [f.str('rotulo', 'rótulo'), f.en('size', ['md', 'sm'], 'md'), f.bool('invalido', 'inválido')],
    params: { rotulo: 'label', size: 'size', invalido: 'invalid' },
    values: { invalido: yes },
  });
add('choice', 'Choice', 'Caixa de seleção ou botão de rádio, com rótulo e dica opcional.',
  'Choice', 'src/ui/controls/Choice.tsx', {
    labelField: 'rotulo',
    fields: [f.en('tipo', ['checkbox', 'radio'], 'checkbox'), f.str('rotulo', 'rótulo', { required: true }), f.str('dica', 'dica')],
    params: { tipo: 'type', rotulo: 'label', dica: 'hint' },
  });
add('segmented', 'Segmented', 'Controle segmentado: um grupo de opções exclusivas lado a lado, cada uma com rótulo e, se quiser, ícone.',
  'Segmented', 'src/ui/controls/Segmented.tsx', {
    labelField: 'rotulo',
    fields: [f.str('rotulo', 'rótulo'), f.bool('desabilitado', 'desabilitado'), f.bool('invalido', 'inválido')],
    params: { rotulo: 'label', desabilitado: 'disabled', invalido: 'invalid' },
    values: { desabilitado: yes, invalido: yes },
    notes: 'As opções vão em items (SegmentedItem: id, label, icon, showLabel, shortcut, disabled).',
  });
add('tabs', 'Tabs', 'Abas de uma região. O rótulo do conjunto é obrigatório (nome acessível); cada aba aceita ícone, selo e alerta.',
  'Tabs', 'src/ui/controls/Tabs.tsx', {
    labelField: 'rotulo',
    fields: [f.str('rotulo', 'rótulo', { required: true })],
    params: { rotulo: 'label' },
    notes: 'As abas vão em tabs (TabItem: id, label, icon, badge, badgeTone, alert, disabled). BottomTabs (src/ui/BottomTabs.tsx) é o uso na janela inferior.',
  });
add('segmented-item', 'Opção', 'Uma opção do Segmented: o rótulo ou só o ícone; a selecionada fica cheia de color-accent.', 'SegmentedItem', 'src/ui/controls/Segmented.tsx', {
  params: { rotulo: 'label', icone: 'icon' },
  notes: 'Um objeto SegmentedItem no array items do Segmented (id, label, icon?, showLabel?, shortcut?, disabled?); a opção selecionada é o value do Segmented.',
});
add('tab', 'Aba', 'Uma aba do Tabs: o rótulo, o contador e o sublinhado da selecionada.', 'TabItem', 'src/ui/controls/Tabs.tsx', {
  params: { rotulo: 'label', selo: 'badge' },
  notes: 'Um objeto TabItem no array tabs do Tabs (id, label, icon?, badge?, badgeTone?, alert?); a aba selecionada é o value do Tabs, não um campo do item.',
});
add('tooltip', 'Tooltip', 'Dica que aparece ao pairar ou focar o filho, com atalho opcional. É o que dá nome visível ao IconButton.',
  'Tooltip', 'src/ui/controls/Tooltip.tsx', {
    labelField: 'rotulo',
    fields: [f.str('rotulo', 'rótulo', { required: true }), f.str('atalho', 'atalho'), f.en('posicao', ['bottom', 'top', 'end'], 'bottom', { label: 'posição' })],
    params: { rotulo: 'label', atalho: 'shortcut', posicao: 'placement' },
  });
add('help-tip', 'HelpTip', 'Ícone de ajuda com dica: o padrão da app para uma explicação, no lugar de um parágrafo de texto.',
  'HelpTip', 'src/ui/controls/HelpTip.tsx', {
    labelField: 'nome',
    fields: [f.str('nome', 'nome', { required: true }), f.str('texto', 'texto', { required: true })],
    params: { nome: 'name', texto: 'text' },
  });
add('tags', 'Tags', 'Etiqueta (chip) alternável, com contagem opcional. Na lista de anotações marca a camada.',
  'Chip', 'src/ui/controls/Chip.tsx', {
    labelField: 'texto',
    fields: [f.str('texto', 'texto', { required: true }), f.bool('pressionado', 'pressionado'), { key: 'contagem', label: 'contagem', type: 'number' }],
    params: { pressionado: 'pressed', contagem: 'count' },
    values: { pressionado: yes },
    notes: 'O texto vai como filho. A etiqueta de camada é feita em src/ui/ListView.tsx.',
  });
add('menu', 'Menu', 'Menus da app: de ações (ActionMenu), de contexto do canvas (CanvasContextMenu) e de cópia (CopyActions), sobre a base de posicionamento Popover.',
  'MenuPopover', 'src/ui/MenuPopover.tsx', {
    notes: 'O guia do DS cobre três menus: ActionMenu (src/ui/ActionMenu.tsx), CanvasContextMenu (src/ui/CanvasContextMenu.tsx) e CopyActions (src/ui/CopyActions.tsx); Popover (src/ui/Popover.tsx) é a base.',
  });
add('dialog', 'Dialog', 'Diálogo modal com título, conteúdo e ações. O tamanho vai de sm a lg; alert usa o papel de alerta para diálogos que exigem resposta.',
  'Dialog', 'src/ui/Dialog.tsx', {
    labelField: 'titulo',
    fields: [f.str('titulo', 'título', { required: true }), f.en('size', ['sm', 'md', 'lg'], 'md'), f.bool('alerta', 'alerta')],
    params: { titulo: 'title', size: 'size', alerta: 'alert' },
    values: { alerta: yes },
    notes: 'As ações vão em actions e o conteúdo em children. Fechável por padrão; closable: false exige que a pessoa escolha uma ação.',
  });
add('confirm-dialogs', 'ConfirmDialogs', 'Diálogos de confirmação do editor: ConfirmDialog e ExternalChangeDialog ("Projeto alterado fora da app").',
  'EditorDialogs', 'src/app/EditorDialogs.tsx', {
    notes: 'ConfirmDialog e ExternalChangeDialog moram neste arquivo; o estado de abertura vem de src/app/useEditorDialogs.ts.',
  });
add('banner', 'Banner', 'Faixa de aviso no topo da região, com tom de atenção ou informação, ação e dispensa opcionais.',
  'Banner', 'src/ui/Banner.tsx', {
    fields: [f.en('tom', ['warning', 'info'], 'info', { required: true })],
    params: { tom: 'tone' },
    notes: 'Usos prontos: PreviewBanner (src/ui/PreviewBanner.tsx) e UpdateBanner (src/ui/UpdateBanner.tsx).',
  });
add('notice', 'Notice', 'Aviso em caixa, com tom (informação, atenção, erro, sucesso), título, dica e ações.',
  'Notice', 'src/ui/Notice.tsx', {
    labelField: 'titulo',
    fields: [f.en('tom', ['info', 'warning', 'error', 'success'], 'info', { required: true }), f.en('tamanho', ['md', 'sm', 'line'], 'md'), f.str('titulo', 'título'), f.str('dica', 'dica')],
    params: { tom: 'tone', tamanho: 'size', titulo: 'title', dica: 'hint' },
    notes: 'O .notice de parágrafo também existe em src/ui/InstallHint.tsx.',
  });
add('notice-badge', 'NoticeBadge', 'Selo, bloco e linha dos quatro tipos de aviso de uma especialização (pending, deprecated, diverges, removed). A cor sempre vem com ícone e texto.',
  'NoticeBadge', 'src/ui/NoticeBadge.tsx', {
    fields: [f.en('kind', ['pending', 'deprecated', 'diverges', 'removed'], 'pending', { required: true })],
    notes: 'Recebe o aviso inteiro em notice (SpecNotice); o kind decide cor e ícone. Variantes no mesmo arquivo: TypeNoticeBadge, NoticeBlock, NoticeLines.',
  });
add('breadcrumbs', 'Breadcrumbs', 'Trilha do caminho até o item selecionado, na barra do editor, com os controles de zoom à direita.',
  'Breadcrumbs', 'src/ui/Breadcrumbs.tsx', { notes: 'Os controles à direita da barra estão em src/app/EditorTools.tsx e src/ui/ZoomField.tsx.' });
add('status-bar', 'StatusBar', 'Barra de status do editor: posição, zoom e o item do modo de visualização.',
  'StatusBar', 'src/ui/StatusBar.tsx');
add('tool-window', 'ToolWindow', 'Moldura das janelas de ferramenta (Camadas, Árvore, Avisos, Comentários…), com título, ações e empilhamento.',
  'ToolWindow', 'src/ui/ToolWindow.tsx', {
    fields: [f.str('janela', 'janela', { required: true })],
    params: { janela: 'id' },
    notes: 'A janela é o ToolWindowId (src/ui/toolWindowMeta.ts). Tamanhos em src/ui/toolWindowLayout.ts; montagem em src/app/EditorWindows.tsx.',
  });
add('tool-strip-button', 'ToolStripButton', 'Botão da faixa lateral que abre ou fecha uma janela de ferramenta.',
  'ToolStrip', 'src/ui/ToolStrip.tsx', { notes: 'O botão é o StripButton, função interna não exportada; chame o ToolStrip. Metadados das janelas em src/ui/toolWindowMeta.ts.' });
add('narrow-window', 'NarrowWindow', 'Aviso "Abra numa janela maior", mostrado no lugar da tela abaixo de 900×720 px; a app é só desktop.',
  'NarrowWindowNotice', 'src/app/NarrowWindow.tsx', { notes: 'O limite vem de src/theme/breakpoints.ts. O mesmo arquivo exporta o hook useNarrowWindow.' });
add('home', 'Home', 'Tela inicial: abrir ou criar projeto e a lista de recentes.',
  'Home', 'src/app/Home.tsx', { notes: 'As linhas dos recentes vêm de src/app/recentRows.ts.' });
add('help-dialog', 'HelpDialog', 'Diálogo de ajuda com os atalhos, o guia das propostas e o guia interativo.',
  'HelpDialog', 'src/ui/HelpDialog.tsx', { notes: 'Os atalhos listados vêm de src/ui/shortcutList.ts.' });

// ---- Canvas, marcações e painéis de detalhes
add('arrow', 'Arrow', 'Seta no canvas: uma marcação que aponta de um item a outro, fora da árvore de pertencimento. Desenhada no Konva.',
  'ArrowRenderer', 'src/canvas/renderers/arrows.ts', { notes: 'Não há componente Preact: o desenho é o ArrowRenderer; a geometria está em src/canvas/arrowGeometry.ts e o realce em src/canvas/renderers/overlay.ts.' });
add('arrow-panel', 'ArrowPanel', 'Painel de detalhes da seta selecionada: origem, destino, rota e anotações.',
  'ArrowPanel', 'src/ui/ArrowPanel.tsx');
add('canvas-marking', 'CanvasMarking', 'Marcação retangular no canvas, com o contorno, o rótulo e os selos de trava e de revisão. Especificação do desenho no Konva.',
  'MarkingRenderer', 'src/canvas/renderers/markings.ts', { notes: 'Não é componente Preact. Contorno e realce em src/canvas/renderers/overlay.ts, selo de trava em lockBadge.ts, revisão em review.ts, cores em src/canvas/theme.ts; geometria em src/canvas/markingGeometry.ts.' });
add('container', 'Container', 'Container no canvas: a área de topo (com imagem ou só tamanho e cor de fundo) que recebe as marcações. Desenhado no Konva.',
  'ImageRenderer', 'src/canvas/renderers/images.ts', { notes: 'Sem .tsx. Contorno e estados em src/canvas/renderers/overlay.ts e review.ts.' });
add('container-dialog', 'ContainerDialog', 'Diálogo para criar ou editar um container: tamanho, cor de fundo e os tamanhos prontos das especializações.',
  'ContainerDialog', 'src/ui/ContainerDialog.tsx', { notes: 'A lógica do formulário está em src/ui/containerForm.ts.' });
add('component-drawing', 'ComponentDrawing', 'Desenho de um componente de biblioteca dentro de uma marcação, calculado do template e dos valores da anotação.',
  'ComponentLayerRenderer', 'src/canvas/components/componentLayer.ts', { notes: 'Desenhado no Konva. Cena em renderScene.ts e screenRenderer.ts (mesma pasta); o nó image usa imageLoader.ts e remoteImages.ts.' });
add('minimap', 'Minimap', 'Minimapa do canvas, em DOM, com o retângulo da área visível.',
  'Minimap', 'src/ui/Minimap.tsx', { notes: 'As contas de layout ficam em src/canvas/minimap.ts.' });
add('zoom-field', 'ZoomField', 'Campo de zoom em porcentagem, usado na barra de status e na trilha.',
  'ZoomField', 'src/ui/ZoomField.tsx');
add('view-mode-panel', 'ViewModePanel', 'Painel "Mostrar no canvas" do modo de visualização, e o botão que o reabre.',
  'ViewModePanel', 'src/ui/ViewModePanel.tsx', { notes: 'O botão Visualizar (ViewModeButton) mora em src/app/EditorTools.tsx; o item de modo na barra de status é o ViewModeItem, em src/ui/StatusBar.tsx.' });
add('marking-panel', 'MarkingPanel', 'Painel de detalhes da marcação selecionada: identidade, retângulo, camadas e anotações. Mostra o estado trancado.',
  'MarkingPanel', 'src/ui/MarkingPanel.tsx');
add('marking-picker', 'MarkingPicker', 'Seletor de uma marcação do projeto, usado onde um campo aponta para outra marcação.',
  'MarkingPicker', 'src/ui/MarkingPicker.tsx');
add('multi-selection-panel', 'MultiSelectionPanel', 'Painel de detalhes quando há mais de um item selecionado.',
  'MultiSelectionPanel', 'src/ui/MultiSelectionPanel.tsx');
add('layer-group', 'LayerGroup', 'Grupo de uma camada na lista de anotações: cabeçalho com o selo da camada e as anotações dela. Cobre também a lista de camadas.',
  'AnnotationsPanel', 'src/ui/AnnotationsPanel.tsx', { notes: 'LayerGroup é função interna de AnnotationsPanel.tsx (outra, homônima, está em src/ui/LinkedAnnotations.tsx). A lista de camadas é o LayersPanel (src/ui/LayersPanel.tsx), na janela de src/ui/LayersWindow.tsx.' });
add('tree-row', 'TreeRow', 'Linha da Árvore de marcações: recuo por pertencimento, pontos das camadas e seleção.',
  'MarkingTree', 'src/ui/MarkingTree.tsx', { notes: 'A janela da Árvore está em src/ui/TreeWindow.tsx.' });
add('key-value-grid', 'KeyValueGrid', 'Grade editável de pares chave-valor das anotações livres, com reordenação por arraste.',
  'KeyValueGrid', 'src/ui/KeyValueGrid.tsx');
add('property-grid', 'PropertyGrid', 'Grade de propriedades de uma anotação tipada: um campo por linha, com rótulo e editor.',
  'PropertyGrid', 'src/ui/PropertyGrid.tsx');
add('data-grid', 'DataGrid', 'Grade de dados: o campo table nos Detalhes e a Lista em tabela.',
  'TableField', 'src/ui/TableField.tsx', { notes: 'Dois usos sob um nome: TableField (campo table) e ListView (src/ui/ListView.tsx, a Lista em tabela).' });
add('ref-cell', 'RefCell', 'Célula de referência: mostra o alvo de um campo ref e abre o seletor em modo compacto.',
  'RefCell', 'src/ui/RefCell.tsx', { notes: 'O seletor é o RefPicker (src/ui/RefPicker.tsx), em modo compact.' });
add('reference-field', 'ReferenceField', 'Campo de referência (ref) dos Detalhes: escolhe o alvo entre as etiquetas aceitas.',
  'RefPicker', 'src/ui/RefPicker.tsx', { notes: 'O RefField, que monta o campo, é função interna de src/ui/TypedFields.tsx; o seletor exportado é o RefPicker.' });
add('inconsistent-project-dialog', 'InconsistentProjectDialog', 'Diálogo que lista as inconsistências de um projeto ao abrir e oferece o reparo.',
  'InconsistentProjectDialog', 'src/ui/InconsistentProjectDialog.tsx', { notes: 'Aberto por src/app/Home.tsx.' });

// ---- Revisão, propostas, catálogo e configurações
const R = (id, name, description, symbol, file, notes) =>
  add(id, name, description, symbol, `src/ui/review/${file}.tsx`, notes ? { notes } : {});
R('change-below', 'ChangeBelow', 'Indicação de que há mudanças abaixo da área visível, na revisão.', 'ChangeBelow', 'ChangeBelow');
R('change-kind', 'ChangeKind', 'Rótulo do tipo de mudança de um item da revisão (criado, alterado, removido…).', 'ChangeKind', 'ChangeKind');
R('change-mark', 'ChangeMark', 'Marca de mudança sobre um item, na visão Proposto ou Atual.', 'ChangeMark', 'ChangeMark');
R('change-popover', 'ChangePopover', 'Popover com o detalhe de uma mudança: o que era, o que ficou e a decisão.', 'ChangePopover', 'ChangePopover');
R('decision-control', 'DecisionControl', 'Controle de decisão de um item da revisão: aceitar ou rejeitar, com atalhos.', 'DecisionControl', 'DecisionControl', 'Também exporta REVIEW_KEYS (atalhos A, R e Backspace).');
R('decision-mark', 'DecisionMark', 'Marca da decisão tomada sobre um item (aceito, rejeitado, pendente).', 'DecisionMark', 'DecisionMark');
R('diff-value', 'DiffValue', 'Valor antes e depois de uma mudança, lado a lado.', 'DiffValue', 'DiffValue');
R('flag', 'Flag', 'Bandeira de estado de um item da revisão.', 'Flag', 'Flag');
R('image-compare', 'ImageCompare', 'Comparação da imagem atual com a proposta.', 'ImageCompare', 'ImageCompare', 'Aberto pelo CompareDialog, em src/ui/review/ReviewCanvasControls.tsx.');
R('note-field', 'NoteField', 'Campo de nota da pessoa que revisa, por item ou na proposta inteira.', 'NoteField', 'NoteField');
R('other-changes', 'OtherChanges', 'Seção "Outras mudanças" da revisão: as que não são marcações nem anotações, e as imagens.', 'OtherChangesSection', 'OtherChanges', 'O mesmo arquivo exporta OtherChangeRow e ImagesSection.');
R('proposal-row', 'ProposalRow', 'Linha de uma proposta na lista, com o estado e a contagem de decisões.', 'ProposalRow', 'ProposalRow', 'Usada em ProposalList.tsx; o mesmo arquivo exporta DecisionCounts.');
R('review-bar', 'ReviewBar', 'Barra da revisão: progresso, navegação entre itens e o botão de aplicar.', 'ReviewBar', 'ReviewBar');
R('review-header', 'ReviewHeader', 'Cabeçalho da revisão de uma proposta: identidade, decisão do todo e avisos.', 'ReviewHeader', 'ReviewHeader', 'O mesmo arquivo exporta IdentityFlags e WholeDecision.');
R('review-row', 'ReviewRow', 'Linha de um nível da revisão, com a linha de filtros recolhida e o painel aberto.', 'ReviewRow', 'ReviewRow', 'Usada em src/ui/review/ReviewLevels.tsx.');
add('update-impact', 'UpdateImpact', 'Impacto de atualizar uma especialização aplicada: o que muda, o que se perde e a migração.',
  'UpdateImpact', 'src/ui/UpdateImpact.tsx');
add('catalog-page', 'CatalogPage', 'Página do catálogo de uma biblioteca: componentes, variantes, documento e playground.',
  'CatalogPage', 'src/ui/catalog/CatalogPage.tsx', { notes: 'Também CatalogView.tsx, Playground.tsx e renderer.ts (mesma pasta) e src/ui/markdown/Markdown.tsx.' });
add('catalog-screen', 'CatalogScreen', 'Tela cheia do catálogo de uma biblioteca.',
  'CatalogScreen', 'src/app/CatalogScreen.tsx', { notes: 'Usa src/store/libraryPreview.ts.' });
add('catalog-window', 'CatalogWindow', 'Janela de ferramenta do catálogo, com a paleta de componentes para arrastar ao canvas.',
  'CatalogWindow', 'src/ui/CatalogWindow.tsx', { notes: 'Também src/ui/LibraryPalette.tsx e src/ui/useAddComponent.ts.' });
add('code-definitions', 'CodeDefinitions', 'Definições de código de um tipo por plataforma: símbolo, arquivo e ações de copiar.',
  'CodeDefinitions', 'src/ui/CodeDefinitions.tsx', { notes: 'Resolve a variante por typeCodeDefinitions (src/model/codeVariants.ts).' });
add('specs-dialog', 'SpecsDialog', 'Diálogo de especializações: importar, aplicar e atualizar.',
  'SpecsDialog', 'src/ui/SpecsDialog.tsx', { notes: 'Importação de pacote em src/ui/specPackageImport.ts.' });
add('library-issue-list', 'LibraryIssueList', 'Lista de erros e avisos da validação de uma biblioteca.',
  'LibraryIssueList', 'src/ui/LibraryIssueList.tsx');
add('notices-view', 'NoticesView', 'Janela Avisos: filtros, grupos por aviso e a aba com contagem.',
  'NoticesView', 'src/ui/NoticesView.tsx', { notes: 'A aba com contagem está em src/ui/BottomTabs.tsx; atalho Ctrl+Shift+8.' });
add('settings-dialog', 'SettingsDialog', 'Diálogo de configurações: identidade, repositórios das plataformas e privacidade.',
  'SettingsDialog', 'src/ui/SettingsDialog.tsx', { notes: 'Também SettingsBar.tsx, PlatformRepos.tsx e PrivacySettings.tsx (mesma pasta).' });

// ---- Sistema de comentários (épico epic/comentarios, mcp-v0.25.0). O mapa de DESIGN-SYSTEM.md é
// anterior a ele; os componentes abaixo vêm dos comentários de cabeçalho de src/ui/comments/,
// src/ui/IdentitySettings.tsx e src/canvas/.
add('comment-pin', 'CommentPin', 'Pino de conversa no canvas: pílula de 20 px de tela com as iniciais e o número de mensagens (ou a contagem, se há várias conversas), na cor do estado mais urgente (aguardando humano, aguardando agente, resolvida), com anel de selecionado e ponto de não lida.',
  'CommentPinRenderer', 'src/canvas/renderers/commentPins.ts', {
    notes: 'Desenhado no Konva, sem .tsx. Onde cada grupo de pinos fica e o acerto do clique estão em src/canvas/commentPins.ts; o clique e o menu Comentar, em src/canvas/input/commentPointer.ts.',
  });
add('citation-chip', 'CitationChip', 'Chip de citação em texto corrido: mostra o nome de agora do alvo de um link mapping://; riscado e cinza quando o alvo some. Clicar leva ao alvo.',
  'CitationChip', 'src/ui/comments/CitationChip.tsx');
add('thread-message', 'ThreadMessage', 'Uma mensagem da conversa: iniciais, nome, selo de agente, hora relativa e o texto em markdown.',
  'ThreadMessage', 'src/ui/comments/ThreadMessage.tsx');
add('composer', 'Composer', 'Compositor da conversa: campo de texto com o editor de citação (chips), seletor do @ e o botão Enviar (Ctrl+Enter); sem identidade mostra o aviso e leva às Configurações.',
  'Composer', 'src/ui/comments/Composer.tsx', { notes: 'O editor de citação é o CitationEditor (src/ui/comments/CitationEditor.tsx) e o seletor do @ é o CitePicker (src/ui/comments/CitePicker.tsx).' });
add('threads-section', 'ThreadsSection', 'Seção Conversas dos Detalhes: lista de conversas do item (iniciais, assunto, nº de mensagens e "em <onde>"), botão Nova e o estado vazio com o compositor.',
  'ThreadsSection', 'src/ui/comments/ThreadsSection.tsx', { notes: 'A conversa escolhida é o ThreadView (src/ui/comments/ThreadView.tsx); a conversa sem item para selecionar, o StandaloneThreadPanel; a linha Citada em, o CitedIn.' });
add('comments-window', 'CommentsWindow', 'Janela Comentários (Ctrl+Shift+0): todas as conversas numa tabela (Por, Âncora, Última mensagem, Msgs, Status, Quando), com filtros de status, usuário e texto, e a contagem. Só leitura durante a revisão.',
  'CommentsWindow', 'src/ui/comments/CommentsWindow.tsx');
add('proposal-card', 'ProposalCard', 'Cartão da proposta numa conversa: título, quantas mudanças faltam revisar e o botão Revisar.',
  'ProposalCard', 'src/ui/comments/ProposalCard.tsx');
add('delete-thread-dialogs', 'DeleteThreadDialogs', 'Diálogos de apagar conversa (alerta, com autores e contagens quando há mensagem de outra pessoa ou de agente) e de apagar em lote (Só as resolvidas, data, contagem).',
  'BulkDeleteDialog', 'src/ui/comments/BulkDeleteDialog.tsx', { notes: 'O diálogo de apagar uma conversa vem do hook useDeleteThread (src/ui/comments/useDeleteThread.tsx).' });
add('identity-settings', 'IdentitySettings', 'Seção Identidade do diálogo Configurações: Nome e E-mail, Salvar e Esquecer. A identidade fica no dispositivo, nunca no projeto; sem ela a pessoa só lê as conversas.',
  'IdentitySettings', 'src/ui/IdentitySettings.tsx');

const LABEL_FIELDS = { text: 'texto', badge: 'texto', avatar: 'iniciais', icon: 'icone', tab: 'rotulo', 'segmented-item': 'rotulo' };
for (const [id, f] of Object.entries(LABEL_FIELDS)) T.find((t) => t.id === id).labelField = f;

// ---- Descrições conferidas contra os comentários do código (sobrescrevem as do mapa)
const DESC = {
  breadcrumbs: 'Caminho da seleção acima do canvas (Imagem › Marcação › Marcação). Clicar num nível seleciona aquele item; Alt+↑ e Alt+↓ andam no caminho.',
  'status-bar': 'Barra de status do editor: salvamento, destino e "não exportado" à esquerda; seleção, cursor, zoom, schema, canal e build à direita.',
  'tool-window': 'Janela de ferramenta encaixada: cabeçalho de 32px com título (ou, na inferior, as abas) e ações, corpo com rolagem e divisória de arraste.',
  'tool-strip-button': 'Botão da faixa de 40px nas laterais: um por janela de ferramenta, com o atalho na dica.',
  'arrow-panel': 'Detalhes da seta selecionada: identidade e a seção Seta (nome, origem e destino, estilo), mais as anotações.',
  minimap: 'Minimapa no canto do canvas: visão geral das imagens; clicar move a vista. Desenhado em DOM, sem Konva.',
  'zoom-field': 'Campo de zoom: mostra o zoom atual e, ao clicar, volta a 100%.',
  'marking-picker': 'Seletor de marcação ("Ligar a…"): o mesmo popup do RefPicker, com a lista das marcações do projeto, nunca as setas e sem a própria marcação.',
  'multi-selection-panel': 'Detalhes com mais de um item selecionado: só o resumo e as ações da seleção inteira.',
  'key-value-grid': 'Grade de pares chave-valor da anotação livre, com edição na célula, alça de arraste e menu ⋯ por linha.',
  'property-grid': 'Grade de propriedades: rótulo à esquerda e controle à direita; os estados vêm dos controles.',
  'data-grid': 'Grade do campo table dos Detalhes (coluna # numerada, alça de arraste, edição na célula, menu ⋯ por linha) e a Lista em tabela.',
  'ref-cell': 'Célula de uma coluna ref de tabela: versão compacta do campo de referência. Mostra o alvo (ou "Escolher…"), abre o seletor compacto e tem ✕ para limpar; é dado, nenhuma seta é desenhada.',
  'view-mode-panel': 'Painel "Mostrar no canvas" do modo visualização: o botão que o reabre e o popover com os elementos, as camadas com desenho e os atalhos do rodapé.',
  'container-dialog': 'Diálogo Novo container: nome, tamanho (Personalizado, Tamanho da seleção e os tamanhos prontos das especializações aplicadas) e cor de fundo.',
  'code-definitions': 'Definição de uma anotação tipada: o arquivo que define o símbolo do code do tipo em cada plataforma, com "Abrir no repositório" e "Copiar caminho".',
  'catalog-page': 'Página de um componente do catálogo: cabeçalho, documento, propriedades, código por plataforma, origens, galeria e playground. Só apresentação.',
  'catalog-screen': 'Tela do catálogo de uma biblioteca aberta pela tela inicial, sem projeto: barra com Voltar, nome e versão, e o catálogo com lista e página lado a lado.',
  'catalog-window': 'Janela Catálogo, à esquerda: a aba Componentes mostra o catálogo dos pacotes aplicados ao projeto e a aba Paleta é a paleta de componentes.',
  'notices-view': 'Janela Avisos: os avisos das especializações aplicadas, com filtros, agrupados por aviso, e cada um leva à anotação.',
  'change-below': 'Linha embaixo do controle de um campo alterado na revisão: a nota da mudança (ícone e texto) e, numa proposta substituída, o selo igual / diferente / não consta na nova.',
  'change-kind': 'Selo neutro do tipo de mudança: a forma diz o tipo, nunca a cor. Criada (+), removida (−), movida (⇄), alterada (∿) e imagem trocada.',
  'change-mark': 'Marcador de um campo alterado na revisão: peça de 18 px com o tipo à esquerda e a decisão à direita; conflito com ⚠ em âmbar.',
  'change-popover': 'Conteúdo do popover de um marcador: título com o tipo e o campo, os valores, a ajuda do efeito e o rodapé com a decisão do campo.',
  'decision-control': 'Par ✓ ✕ que decide um nível da revisão: nenhum marcado é "sem decisão"; apertar o marcado limpa. Decidir grava na hora, sem confirmação.',
  'decision-mark': 'Estado de decisão de um nível, só leitura: círculo tracejado = sem decisão; cheio com ✓ = aceita; cheio com ✕ = rejeitada; metade cheia = parcial.',
  'diff-value': 'Valor atual, antes e depois de um campo, em fonte mono, sem vermelho nem verde: o que muda se destaca por peso e fundo.',
  flag: 'Pílula de 18px com um fato sobre a linha (Conflito, Trancado, Envolvida, o status da proposta). Não é interativa; o texto aparece sempre.',
  'image-compare': 'Comparação antes/depois de uma imagem trocada: lado a lado, deslizar (padrão) e sobrepor; a alça é um slider.',
  'note-field': 'Nota para o agente: campo de texto que grava ao sair, no cabeçalho do item e no popover de uma mudança. Texto vazio apaga a nota.',
  'other-changes': 'Seção "Outras mudanças" da revisão: o que não tem campo no painel normal (origem, trava, troca de imagem, camadas, especializações e repositórios), numa linha com o tipo e o resumo.',
  'proposal-row': 'Linha da lista de propostas: estado do conjunto, título com o status, contexto (origem · autor · data), contagens e a ação Revisar, Continuar ou Ver.',
  'review-bar': 'Faixa do modo revisão: selo REVISÃO, título, origem, progresso, contagens e as ações Rejeitar tudo, Aceitar tudo, Aplicar aceitas e Sair da revisão.',
  'review-header': 'Cabeçalho do item selecionado nos Detalhes da revisão: o que é, a decisão de três estados com as contagens e a criação ou remoção por inteiro.',
  'review-row': 'Linha dos níveis da revisão, em três colunas: nome (chevron, decisão, tipo, rótulo e sinalizadores), resumo (contagens ou "antes → depois") e o DecisionControl.',
  'update-impact': 'Impacto de atualizar uma especialização aplicada: o que muda por passo da migração, as perdas e as contagens.',
  'library-issue-list': 'Problemas de uma biblioteca (erros e avisos) em lista compacta: um grupo por arquivo, com o caminho e a mensagem; a lista rola sozinha.',
};
Object.assign(DESC, {
  'marking-panel': 'Painel de Detalhes da marcação selecionada (inclui o estado trancado). A seção Marcação recolhida resume a posição e o tamanho ("X 112 · Y 236 · 346 × 84 px").',
  'specs-dialog': 'Diálogo de especializações do projeto, com a importação de pacote de biblioteca.',
  home: 'Tela inicial da app, antes de abrir um projeto: a lista de projetos recentes e os diálogos iniciais.',
  'tree-row': 'Linha da Árvore de marcações, na janela Árvore.',
});
for (const t of T) if (DESC[t.id]) t.description = DESC[t.id];
for (const id of Object.keys(DESC)) if (!T.some((t) => t.id === id)) throw new Error(`DESC sem tipo: ${id}`);

// ---- Desenhos, documentos e exemplos (lib.mjs)
mkdirSync(PKG, { recursive: true });
for (const n of readdirSync(PKG)) rmSync(join(PKG, n), { recursive: true, force: true });
const drawn = applyLibrary(T, json, write);
json('icons/icons.json', ICON_SET);
for (const id of drawn) if (!T.some((t) => t.id === id)) throw new Error('desenho sem tipo: ' + id);

// ---- Monta e confere
const problems = [];
const annotationTypes = T.map((t) => {
  let code = null;
  if (t.symbol && !t.path) code = { symbol: t.symbol };
  else if (t.symbol) {
    const file = join(REPO, t.path);
    if (!existsSync(file)) problems.push(`falta o arquivo: ${t.path}`);
    else if (!readFileSync(file, 'utf8').includes(t.symbol)) problems.push(`símbolo ${t.symbol} não aparece em ${t.path}`);
    code = { symbol: t.symbol, path: t.path };
  } else code = {};
  if (t.params) code.params = t.params;
  if (t.values) code.values = t.values;
  if (t.notes) code.notes = t.notes;
  const type = { id: t.id, name: t.name, description: t.description };
  if (t.labelField) type.labelField = t.labelField;
  type.fields = t.fields ?? [];
  if (code.symbol) type.code = { web: code };
  for (const k of ['structural', 'component', 'doc', 'examples']) if (t[k]) type[k] = t[k];
  return type;
});

const ids = annotationTypes.map((a) => a.id);
if (new Set(ids).size !== ids.length) problems.push('ids repetidos');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const spec = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'mapping-ds',
  name: 'Mapping DS',
  version: 9,
  description: 'Design system do Mapping (o app): os componentes do artefato "Mapping" do Claude Design, ligados ao código Preact/Konva do repositório. Os controles e avisos simples têm desenho, com os tokens claro e escuro do tema.',
  platforms: [
    {
      id: 'web',
      name: 'Web (Preact)',
      language: 'typescript',
      repo: {
        url: 'https://github.com/fabianofranca/mapping',
        urlTemplate: `https://github.com/fabianofranca/mapping/blob/${REF}/{path}`,
        ref: REF,
      },
    },
  ],
  tokens: themeTokens(),
  icons: 'icons/icons.json',
  containers: [{ id: 'janela-minima', name: 'Janela mínima da app', width: 900, height: 720 }],
  layers: [{ id: 'mapping', name: 'Mapping', color: '#1A63CC', annotationTypes }],
  migrations: MIGRATIONS,
};

json('mapping-ds.spec.json', spec);
console.log('ok: ' + annotationTypes.length + ' tipos, ' + drawn.length + ' componentes -> ' + PKG);
