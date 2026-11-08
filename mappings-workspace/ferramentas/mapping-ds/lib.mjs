// Desenhos dos componentes do Mapping DS. Valores do tema CLARO de src/theme/tokens.ts e medidas de
// src/theme/controls.css, details.css, dialogs.css, layout.css e review.css (repo Mapping, mcp-v0.25.0).
import { readFileSync } from 'node:fs';
import { PATHS } from './paths.mjs';

const REPO = PATHS.repo;

// ---- Tokens (tema claro). C_LIGHT são os literais (o extrator casa as cores do DOM com eles);
// C são os mesmos nomes como { $token } da especialização (v8: tokens claro e escuro de tokens.ts).
const C_LIGHT = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  border: '#dfe3e8',
  control: '#7d8590', // color-border-control
  text: '#1b1f24',
  muted: '#5b6470',
  accent: '#1a63cc',
  accentText: '#ffffff',
  selection: '#dce8fb',
  selectionMuted: '#eceff3',
  danger: '#c62828',
  dangerBg: '#fdecea',
  warning: '#8a5a00',
  warningBg: '#fff4d6',
  success: '#1e7a46',
  successBg: '#e3f4ea',
  tooltip: '#1b1f24',
  tooltipText: '#ffffff',
  none: 'rgba(0, 0, 0, 0)',
};
const tok = (name) => ({ $token: name });
const TOKEN_OF = {
  bg: 'color-bg',
  surface: 'color-surface',
  border: 'color-border',
  control: 'color-border-control',
  text: 'color-text',
  muted: 'color-text-muted',
  accent: 'color-accent',
  accentText: 'color-accent-text',
  selection: 'color-selection',
  selectionMuted: 'color-selection-muted',
  danger: 'color-danger',
  dangerBg: 'color-danger-bg',
  warning: 'color-warning',
  warningBg: 'color-warning-bg',
  success: 'color-success',
  successBg: 'color-success-bg',
  tooltip: 'color-tooltip',
  tooltipText: 'color-tooltip-text',
};
const C = { ...Object.fromEntries(Object.entries(TOKEN_OF).map(([k, name]) => [k, tok(name)])), none: C_LIGHT.none };
// A sombra de popup do tema (shadow-popup: 0 8px 24px <cor>); só a cor é token (x, y e blur são literais no formato).
const SHADOW_POPUP = { color: tok('shadow-popup-color'), x: 0, y: 8, blur: 24 };
const OPACITY_DISABLED = tok('opacity-disabled');

// ---- Ícones (src/ui/icons.tsx, grade de 16 px, traço 1,25)
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const dot = (cx, cy) => circle(cx, cy, 0.6);
// Os 86 ícones reais de src/ui/icons.tsx, avaliados do próprio fonte (grade de 16 px, traço de 1,25).
function loadShapes() {
  const glyphs =
    readFileSync(`${REPO}/src/utils/reviewGlyphs.ts`, 'utf8') +
    readFileSync(`${REPO}/src/utils/lockGlyph.ts`, 'utf8');
  const code = glyphs
    .replace(/export const ([A-Z_]+): readonly string\[\] =/g, 'const $1 =')
    .replace(/ as string/g, '');
  const iconSrc = readFileSync(`${REPO}/src/ui/icons.tsx`, 'utf8');
  const from = iconSrc.indexOf('const SHAPES = ') + 'const SHAPES = '.length;
  const body = iconSrc.slice(from, iconSrc.indexOf(' as const satisfies'));
  return new Function('circle', `${code}
return (${body});`)(circle);
}
const SHAPES = loadShapes();
// Um único traço por ícone: todo subcaminho começa em coordenada absoluta; os pontos viram círculos mínimos.
// O app desenha o ícone com stroke-linecap e stroke-linejoin "round" e pontos cheios de raio 0,9.
// O formato de componente não tem ponta nem canto de traço; um círculo cheio de meio traço (0,625)
// em cada ponta e vértice desenha o mesmo resultado.
function vertices(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const N = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const pts = [];
  let i = 0;
  let cmd = 'M';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'Z' || cmd === 'z') {
        x = sx;
        y = sy;
        continue;
      }
    }
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = N[up];
    const a = tokens.slice(i, i + n).map(Number);
    i += n;
    if (up === 'H') x = rel ? x + a[0] : a[0];
    else if (up === 'V') y = rel ? y + a[0] : a[0];
    else {
      x = rel ? x + a[n - 2] : a[n - 2];
      y = rel ? y + a[n - 1] : a[n - 1];
    }
    if (up === 'M') {
      sx = x;
      sy = y;
      cmd = rel ? 'l' : 'L';
    }
    pts.push([x, y]);
  }
  return pts;
}
const capsOf = (d) => {
  const seen = new Set();
  return vertices(d).filter(([x, y]) => {
    const k = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
// Um subcaminho que começa com "m": o primeiro par é absoluto e os pares seguintes são "l" relativos.
// Trocar só a letra por "M" tornaria os pares seguintes absolutos (o X virava outra figura).
function absoluteStart(d) {
  const m = /^m\s*(-?(?:\d+\.?\d*|\.\d+))[\s,]*(-?(?:\d+\.?\d*|\.\d+))\s*/.exec(d);
  if (!m) return d;
  const rest = d.slice(m[0].length);
  return `M${m[1]} ${m[2]}` + (rest && !/^[A-Za-z]/.test(rest) ? `l${rest}` : rest);
}
// Ícone só de pontos (more, moreVertical, grip) não tem traço: um marcador próprio, para não colidirem (o
// desenho usa o conjunto de ícones; o marcador só identifica o ícone).
const ICONS = Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [name, shape.d.length ? shape.d.map(absoluteStart).join('') : `#pontos:${name}`]));
// Chave para reconhecer o ícone no DOM: os d originais, juntos.
// A chave junta os traços e os pontos (<circle>), como o extrator lê o <svg>.
export const ICON_BY_RAW = Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [`${shape.d.join('')}|${(shape.dots ?? []).map(([x, y]) => `${x},${y}`).join(';')}`, name]));
const PLACEHOLDER_ICON = 'M3 3h10v10H3Z';
const ICON_FILL = Object.fromEntries(
  Object.entries(SHAPES).map(([name, shape]) => [
    name,
    [...capsOf(ICONS[name]).map(([x, y]) => circle(x, y, 0.625)), ...(shape.dots ?? []).map(([x, y]) => circle(x, y, 0.9))].join(''),
  ]),
);
ICON_FILL.__placeholder = capsOf(PLACEHOLDER_ICON).map(([x, y]) => circle(x, y, 0.625)).join('');
const STROKE_TO_NAME = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [v, k]));
STROKE_TO_NAME[PLACEHOLDER_ICON] = '__placeholder';
const fillOfStroke = (d) => ICON_FILL[STROKE_TO_NAME[d]] || ICON_FILL.__placeholder;

export const ICON_NAMES = Object.keys(ICONS);
export const ICON_STROKES = ICONS;
export const TOKEN_COLORS = C_LIGHT;

// ---- Auxiliares de desenho
const eq = (field, value) => ({ $eq: [field, value] });
const sw = (field, cases, def) => ({ $switch: field, cases, ...(def === undefined ? {} : { default: def }) });
// A fonte em que o --font-sans do app (src/theme/tokens.ts) resolve no Windows, onde o layout foi medido.
// Uma família só: o motor põe `family` entre aspas (renderScene.ts e konvaMeasurer.ts: `"${family}", sans-serif`),
// e uma pilha vira nome inválido, que cai em Arial (2,5% mais larga: cortava a última letra dos textos medidos).
// Sem `family` o motor cai na Inter, que o app não carrega.
const FONT_SANS = 'Segoe UI';
const font = (size = 13, weight = 400, lineHeight = 20, extra = {}) => ({ family: FONT_SANS, size, weight, lineHeight, ...extra });
const text = (name, value, color, f, extra = {}) => ({ type: 'text', name, text: value, color, font: f, ...extra });
const fieldText = (key, def) => ({ $field: key, ...(def === undefined ? {} : { default: def }) });
const iconFillOf = (d) =>
  typeof d === 'string'
    ? fillOfStroke(d)
    : {
        $switch: d.$switch,
        cases: Object.fromEntries(Object.entries(d.cases).map(([k, v]) => [k, fillOfStroke(v)])),
        ...(d.default !== undefined ? { default: fillOfStroke(d.default) } : {}),
      };
const icon = (name, d, color, extra = {}) => ({
  type: 'frame',
  name,
  width: 16,
  height: 16,
  layout: { type: 'none' },
  ...extra,
  children: [
    { type: 'path', name: 'traço', width: 16, height: 16, viewBox: [16, 16], d, fill: 'none', stroke: { color, width: 1.25 } },
    { type: 'path', name: 'pontas', width: 16, height: 16, viewBox: [16, 16], d: iconFillOf(d), fill: color },
  ],
});
const disabledOpacity = (field = 'desabilitado') => ({
  $if: eq(field, 'sim'),
  then: OPACITY_DISABLED,
  else: 1,
});
const base = (id, name, description, size, minSize, sizing, preview, template, formatVersion = 1) => ({
  format: 'mapping-component',
  formatVersion,
  id,
  name,
  description,
  size,
  minSize,
  sizing,
  preview,
  template,
});
const iconSwitch = (key) => sw(key, ICONS, PLACEHOLDER_ICON);

// Campo de texto e Select: o rótulo em cima e a caixa de 28 px (24 px no `size="sm"`).
function inputBox(kind, small) {
  const h = small ? 24 : 28;
  const visible = small ? eq('size', 'sm') : { $not: eq('size', 'sm') };
  const children = [
    text('valor', fieldText('valor'), C.text, font(13, 400, 20), { width: 'fill' }),
  ];
  if (kind === 'select') children.push(icon('seta', ICONS.chevronDown, C.muted));
  return {
    type: 'frame',
    name: `caixa ${h}`,
    visible,
    width: 'fill',
    height: h,
    cornerRadius: 4,
    fill: { $if: eq('invalido', 'sim'), then: C.dangerBg, else: C.bg },
    stroke: { color: { $if: eq('invalido', 'sim'), then: C.danger, else: C.control }, width: 1 },
    layout: { type: 'row', padding: [0, 8], gap: 8, align: 'center' },
    children,
  };
}

function field(kind) {
  const label = text('rótulo', fieldText('rotulo'), C.muted, font(12, 400, 16), {
    width: 'fill',
    visible: { $has: 'rotulo' },
  });
  return {
    type: 'frame',
    name: kind,
    layout: { type: 'column', gap: 4 },
    children: [label, inputBox(kind, false), inputBox(kind, true)],
  };
}

const COMPONENTS = {};
const DOCS = {};
const EXAMPLES = {};

COMPONENTS.button = base(
  'button',
  'Button',
  'Botão com texto: 28 px de altura, raio 4, borda de controle. A variante muda fundo, borda e cor do texto.',
  { width: 96, height: 28 },
  { width: 28, height: 24 },
  { width: 'hug', height: 28 },
  { texto: 'Salvar', variant: 'default', size: 'md', desabilitado: 'não' },
  {
    type: 'frame',
    name: 'button',
    cornerRadius: 4,
    opacity: disabledOpacity(),
    fill: sw('variant', { primary: C.accent, ghost: C.none }, C.surface),
    stroke: {
      color: sw('variant', { primary: C.accent, danger: C.danger, ghost: C.none }, C.control),
      width: 1,
    },
    layout: {
      type: 'row',
      gap: 6,
      padding: { $if: eq('size', 'sm'), then: [0, 8], else: [0, 12] },
      align: 'center',
      justify: 'center',
    },
    children: [
      text('texto', fieldText('texto', 'Botão'), sw('variant', { primary: C.accentText, danger: C.danger }, C.text), font()),
    ],
  },
);
DOCS.button = `# Button

Botão com texto, do \`src/ui/controls/Button.tsx\`. Use para uma ação da tela.

## Variantes

| \`variant\` | Aparência |
| --- | --- |
| \`default\` | Fundo \`color-surface\`, borda de controle. |
| \`primary\` | Cheio de \`color-accent\`, texto \`color-accent-text\`. Um por região. |
| \`danger\` | Borda e texto \`color-danger\`. |
| \`ghost\` | Sem borda nem fundo em repouso. |
| \`accept\` e \`reject\` | Os botões de decisão da revisão; em repouso, como o \`default\`. O estado marcado (\`aria-pressed\`) não é desenhado. |

## Tamanho

O desenho segue o retângulo da marcação. A altura é 28 px no \`size="md"\` e 24 px no \`sm\`; no \`sm\` o desenho só troca o espaço lateral, então ajuste a altura da marcação.

## Estados

Hover, pressionado e foco vêm do CSS e não são desenhados. O desabilitado usa \`opacity-disabled\` (0,45).

O texto é o filho (\`children\`) do componente. Para um link com a aparência de botão, use \`LinkButton\`, do mesmo arquivo.
`;
EXAMPLES.button = [
  { name: 'Primário', values: { texto: 'Aplicar', variant: 'primary' } },
  { name: 'Perigo', values: { texto: 'Excluir', variant: 'danger' } },
  { name: 'Desabilitado', values: { texto: 'Salvar', desabilitado: 'sim' } },
];

COMPONENTS['icon-button'] = base(
  'icon-button',
  'IconButton',
  'Botão quadrado de 28 px só com ícone de 16 px; ligado (pressionado) fica cheio de color-accent.',
  { width: 28, height: 28 },
  { width: 24, height: 24 },
  { width: 28, height: 28 },
  { icone: 'plus', rotulo: 'Adicionar', variant: 'default', pressionado: 'não', alerta: 'não', selo: '' },
  {
    type: 'frame',
    name: 'icon-button',
    cornerRadius: 4,
    fill: { $if: { $field: 'pressionado' }, then: C.accent, else: C.none },
    children: [
      icon(
        'ícone',
        iconSwitch('icone'),
        {
          $if: { $field: 'pressionado' },
          then: C.accentText,
          else: sw('variant', { danger: C.danger, accept: C.muted, reject: C.muted }, C.text),
        },
        { anchors: { centerX: true, centerY: true } },
      ),
      {
        type: 'ellipse',
        name: 'alerta',
        width: 6,
        height: 6,
        anchors: { top: 4, right: 4 },
        fill: C.danger,
        visible: { $field: 'alerta' },
      },
      {
        type: 'frame',
        name: 'selo',
        width: 'hug',
        height: 16,
        anchors: { top: 0, right: 0 },
        cornerRadius: 999,
        fill: C.accent,
        visible: { $has: 'selo' },
        layout: { type: 'row', padding: [0, 4], align: 'center', justify: 'center' },
        children: [text('número', fieldText('selo'), C.accentText, font(11, 600, 16))],
      },
    ],
  },
);
DOCS['icon-button'] = `# IconButton

Botão só com ícone, do \`src/ui/controls/IconButton.tsx\`. O \`label\` é obrigatório porque vira o nome acessível e o texto do Tooltip; onde cabe texto, prefira o Button.

## Ícone

O campo \`icone\` é o nome (chave camelCase) de um ícone de \`src/ui/icons.tsx\`. A lista de sugestões traz todos os ícones do app, mas este desenho só traz o traço de alguns: close, plus, minus, check, chevronDown, info, warning, error, compare, blocked, search, copy, trash, edit, refresh, undo, redo, note, text, marking e arrow. Os outros aparecem como um quadrado.

## Estados desenhados

- \`pressionado\`: cheio de \`color-accent\`, ícone em \`color-accent-text\`.
- \`variant\`: \`danger\` pinta o ícone de \`color-danger\`; \`accept\` e \`reject\` o deixam neutro (\`color-text-muted\`).
- \`alerta\`: ponto de 6 px no canto de cima, à direita.
- \`selo\`: contador numérico no canto.

Hover e foco vêm do CSS. O tamanho \`sm\` tem 24 px: reduza a marcação.
`;
EXAMPLES['icon-button'] = [
  { name: 'Fechar', values: { icone: 'close', rotulo: 'Fechar' } },
  { name: 'Ligado', values: { icone: 'marking', rotulo: 'Marcar', pressionado: 'sim' } },
  { name: 'Excluir', values: { icone: 'trash', rotulo: 'Excluir', variant: 'danger' } },
];

COMPONENTS['text-field'] = base(
  'text-field',
  'TextField',
  'Campo de texto de uma linha: rótulo em cima (12 px, muted) e caixa de 28 px com borda de controle.',
  { width: 200, height: 48 },
  { width: 80, height: 28 },
  { width: 'fill', height: 'hug' },
  { rotulo: 'Nome', valor: 'Tela de login', size: 'md', invalido: 'não' },
  field('text-field'),
);
DOCS['text-field'] = `# TextField

Campo de texto de uma linha, do \`src/ui/controls/TextField.tsx\`.

- Com \`rotulo\`, o campo vira \`<label class="field">\`: o texto vai em cima (12 px, \`color-text-muted\`) e a caixa embaixo.
- A caixa tem 28 px (24 px no \`size="sm"\`), fundo \`color-bg\` e borda \`color-border-control\`. O desenho troca a altura entre as duas conforme o \`size\`.
- \`invalido\`: fundo \`color-danger-bg\` e borda \`color-danger\`.

Hover, foco, somente leitura e desabilitado vêm do CSS. O placeholder não é desenhado. Para várias linhas, use o \`TextArea\` do mesmo arquivo.
`;
EXAMPLES['text-field'] = [
  { name: 'Preenchido', values: { rotulo: 'Nome', valor: 'Tela de login' } },
  { name: 'Inválido', values: { rotulo: 'Código', valor: 'ab', invalido: 'sim' } },
  { name: 'Compacto', values: { rotulo: 'Zoom', valor: '100%', size: 'sm' } },
];

COMPONENTS.select = base(
  'select',
  'Select',
  'Seleção de uma opção: rótulo em cima e caixa de 28 px com a seta no canto.',
  { width: 200, height: 48 },
  { width: 80, height: 28 },
  { width: 'fill', height: 'hug' },
  { rotulo: 'Plataforma', valor: 'Android', size: 'md', invalido: 'não' },
  field('select'),
);
DOCS.select = `# Select

Seleção de uma opção numa lista, do \`src/ui/controls/Select.tsx\`. Use para conjuntos fechados; as opções entram como filhos (\`<option>\`).

O desenho mostra o texto da opção selecionada (\`valor\`) e a seta \`chevronDown\` em \`color-text-muted\`. A caixa é igual à do TextField: 28 px (24 px no \`sm\`), \`invalido\` pinta de \`color-danger\`.

A lista aberta é do navegador e não é desenhada.
`;
EXAMPLES.select = [
  { name: 'Selecionado', values: { rotulo: 'Plataforma', valor: 'Android' } },
  { name: 'Inválido', values: { rotulo: 'Camada', valor: '', invalido: 'sim' } },
];

const MARCADO = eq('marcado', 'sim');
const checkStroke = { color: { $if: MARCADO, then: C.accent, else: C.control }, width: 1 };
COMPONENTS.choice = base(
  'choice',
  'Choice',
  'Caixa de seleção ou botão de rádio de 16 px, com o rótulo ao lado (e a dica embaixo).',
  { width: 260, height: 44 },
  { width: 48, height: 28 },
  { width: 'hug', height: 'hug' },
  { tipo: 'checkbox', rotulo: 'Mostrar rótulos', dica: '', marcado: 'sim' },
  {
    type: 'frame',
    name: 'choice',
    layout: { type: 'row', gap: 8, padding: [0, 4], align: 'start' },
    children: [
      {
        type: 'frame',
        name: 'caixa',
        width: 16,
        height: 28,
        visible: { $not: eq('tipo', 'radio') },
        layout: { type: 'column', align: 'center', justify: 'center' },
        children: [
          {
            type: 'frame',
            name: 'quadrado',
            width: 16,
            height: 16,
            cornerRadius: 2,
            fill: { $if: MARCADO, then: C.accent, else: C.surface },
            stroke: checkStroke,
            layout: { type: 'none' },
            children: [icon('✓', ICONS.check, C.accentText, { visible: MARCADO, anchors: { centerX: true, centerY: true } })],
          },
        ],
      },
      {
        type: 'frame',
        name: 'rádio',
        width: 16,
        height: 28,
        visible: eq('tipo', 'radio'),
        layout: { type: 'column', align: 'center', justify: 'center' },
        children: [
          {
            type: 'frame',
            name: 'círculo',
            width: 16,
            height: 16,
            cornerRadius: 8,
            fill: C.surface,
            stroke: checkStroke,
            layout: { type: 'row', align: 'center', justify: 'center' },
            children: [{ type: 'ellipse', name: 'miolo', width: 8, height: 8, fill: C.accent, visible: MARCADO }],
          },
        ],
      },
      {
        type: 'frame',
        name: 'rótulo',
        width: 'hug',
        layout: { type: 'column' },
        children: [
          {
            type: 'frame',
            name: 'linha',
            width: 'hug',
            height: 28,
            layout: { type: 'row', align: 'center' },
            children: [text('rótulo', fieldText('rotulo'), C.text, font())],
          },
          text('dica', fieldText('dica'), C.muted, font(12, 400, 16), { visible: { $has: 'dica' } }),
        ],
      },
    ],
  },
);
DOCS.choice = `# Choice

Caixa de seleção ou botão de rádio com rótulo, do \`src/ui/controls/Choice.tsx\`.

- \`tipo\`: \`checkbox\` (quadrado de 16 px, raio 2) ou \`radio\` (círculo de 16 px).
- \`marcado\`: cheio de \`color-accent\`, com o ✓ (caixa) ou o miolo de 8 px (rádio).
- \`dica\`: texto de apoio de 12 px embaixo do rótulo (\`color-text-muted\`).

O rótulo ocupa uma linha mínima de 28 px, alinhada à caixa. Hover e desabilitado vêm do CSS.
`;
EXAMPLES.choice = [
  { name: 'Caixa marcada', values: { rotulo: 'Mostrar rótulos', marcado: 'sim' } },
  { name: 'Rádio', values: { tipo: 'radio', rotulo: 'Atual', marcado: 'não' } },
  { name: 'Com dica', values: { rotulo: 'Texto no canvas', dica: 'Mostra o nome sobre a marcação', marcado: 'não' } },
];

COMPONENTS.segmented = base(
  'segmented',
  'Segmented',
  'Opções exclusivas unidas numa borda só; a selecionada fica cheia de color-accent.',
  { width: 200, height: 28 },
  { width: 80, height: 24 },
  { width: 'hug', height: 28 },
  {
    rotulo: 'Visão',
    desabilitado: 'não',
    invalido: 'não',
    opcoes: [
      { rotulo: 'Atual', selecionada: 'sim' },
      { rotulo: 'Proposto', selecionada: 'não' },
    ],
  },
  {
    type: 'frame',
    name: 'segmented',
    cornerRadius: 4,
    opacity: disabledOpacity(),
    fill: C.control,
    stroke: { color: { $if: eq('invalido', 'sim'), then: C.danger, else: C.control }, width: 1 },
    layout: { type: 'row', padding: 1 },
    children: [
      {
        type: 'repeat',
        name: 'opções',
        field: 'opcoes',
        direction: 'row',
        gap: 1,
        width: 'hug',
        height: 'fill',
        template: {
          type: 'frame',
          name: 'opção',
          height: 'fill',
          fill: { $if: eq('selecionada', 'sim'), then: C.accent, else: C.surface },
          layout: { type: 'row', padding: [0, 12], align: 'center', justify: 'center' },
          children: [
            text('rótulo', fieldText('rotulo'), { $if: eq('selecionada', 'sim'), then: C.accentText, else: C.text }, font()),
          ],
        },
      },
    ],
  },
  2,
);
DOCS.segmented = `# Segmented

Controle segmentado, do \`src/ui/controls/Segmented.tsx\`: botões unidos numa borda só (\`color-border-control\`, raio 4), um por opção, com uma selecionada.

## Campos

- \`opcoes\`: uma linha por opção do \`items\` (\`rotulo\` e se é a \`selecionada\`). Marque só uma.
- \`rotulo\`: o nome acessível do grupo (não aparece no desenho).
- \`invalido\`: borda de \`color-danger\`; \`desabilitado\`: opacidade 0,45.

A opção selecionada fica cheia de \`color-accent\` com o texto em \`color-accent-text\`. As opções só com ícone (\`icon\`) não são desenhadas: o desenho mostra o rótulo de todas.
`;

COMPONENTS.tabs = base(
  'tabs',
  'Tabs',
  'Abas de uma região, de 28 px, com a linha embaixo; a selecionada tem sublinhado de 2 px em color-accent.',
  { width: 240, height: 28 },
  { width: 80, height: 24 },
  { width: 'fill', height: 28 },
  {
    rotulo: 'Janela inferior',
    abas: [
      { rotulo: 'Avisos', selecionada: 'sim', selo: '3' },
      { rotulo: 'Comentários', selecionada: 'não', selo: '' },
    ],
  },
  {
    type: 'frame',
    name: 'tabs',
    layout: { type: 'none' },
    children: [
      { type: 'rect', name: 'linha', height: 1, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.border },
      {
        type: 'repeat',
        name: 'abas',
        field: 'abas',
        direction: 'row',
        gap: 4,
        width: 'fill',
        height: 'fill',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        template: {
          type: 'frame',
          name: 'aba',
          width: 'fill',
          height: 'fill',
          layout: { type: 'none' },
          children: [
            {
              type: 'frame',
              name: 'conteúdo',
              width: 'hug',
              height: 'hug',
              anchors: { centerX: true, centerY: true },
              layout: { type: 'row', gap: 6, align: 'center' },
              children: [
                text('rótulo', fieldText('rotulo'), { $if: eq('selecionada', 'sim'), then: C.text, else: C.muted }, font(13, { $if: eq('selecionada', 'sim'), then: 600, else: 400 }, 20)),
                {
                  type: 'frame',
                  name: 'selo',
                  width: 'hug',
                  height: 16,
                  cornerRadius: 999,
                  fill: C.selectionMuted,
                  visible: { $has: 'selo' },
                  layout: { type: 'row', padding: [0, 6], align: 'center', justify: 'center' },
                  children: [text('contador', fieldText('selo'), C.muted, font(12, 400, 16))],
                },
              ],
            },
            {
              type: 'rect',
              name: 'sublinhado',
              height: 2,
              anchors: { left: 0, right: 0, bottom: 0 },
              fill: C.accent,
              visible: eq('selecionada', 'sim'),
            },
          ],
        },
      },
    ],
  },
  2,
);
DOCS.tabs = `# Tabs

Abas do \`src/ui/controls/Tabs.tsx\`. O \`rotulo\` do conjunto é obrigatório porque é o nome acessível; ele não aparece no desenho.

- \`abas\`: uma linha por aba do \`tabs\` (\`rotulo\`, se é a \`selecionada\` e um \`selo\` de contagem). Marque só uma.
- A aba selecionada tem texto \`color-text\` em peso 600 e sublinhado de 2 px em \`color-accent\`; as outras usam \`color-text-muted\`.
- A linha de baixo (\`color-border\`) corre por toda a largura.

Ícone, ponto de alerta e aba desabilitada não são desenhados. \`BottomTabs\` é o uso na janela inferior.
`;

COMPONENTS.tooltip = base(
  'tooltip',
  'Tooltip',
  'Dica escura (color-tooltip) com o texto e, se houver, o atalho entre bordas.',
  { width: 120, height: 24 },
  { width: 40, height: 24 },
  { width: 'hug', height: 'hug' },
  { rotulo: 'Marcar', atalho: 'M', posicao: 'bottom' },
  {
    type: 'frame',
    name: 'tooltip',
    cornerRadius: 4,
    fill: C.tooltip,
    shadow: SHADOW_POPUP,
    layout: { type: 'row', gap: 8, padding: [4, 8], align: 'center' },
    children: [
      text('rótulo', fieldText('rotulo', 'Dica'), C.tooltipText, font(12, 400, 16)),
      {
        type: 'frame',
        name: 'atalho',
        width: 'hug',
        height: 'hug',
        cornerRadius: 2,
        opacity: 0.75,
        visible: { $has: 'atalho' },
        stroke: { color: C.tooltipText, width: 1 },
        layout: { type: 'row', padding: [0, 4], align: 'center' },
        children: [text('tecla', fieldText('atalho'), C.tooltipText, font(11, 400, 16))],
      },
    ],
  },
);
DOCS.tooltip = `# Tooltip

Dica que aparece ao pairar ou focar o filho, do \`src/ui/controls/Tooltip.tsx\`. É o que dá nome visível ao IconButton.

O desenho é a dica já aberta: fundo \`color-tooltip\`, texto \`color-tooltip-text\` (12 px), raio 4 e a sombra de popup. O \`atalho\` aparece à direita, numa caixa de borda fina com 75% de opacidade. A \`posicao\` (\`bottom\`, \`top\` ou \`end\`) não muda o desenho; ela define de que lado do alvo a dica abre.
`;
EXAMPLES.tooltip = [
  { name: 'Com atalho', values: { rotulo: 'Marcar', atalho: 'M' } },
  { name: 'Só texto', values: { rotulo: 'Desfazer' } },
];

COMPONENTS['help-tip'] = base(
  'help-tip',
  'HelpTip',
  'Ícone de ajuda discreto (info em color-text-muted), no botão de ícone de 28 px.',
  { width: 28, height: 28 },
  { width: 24, height: 24 },
  { width: 28, height: 28 },
  { nome: 'Ajuda', texto: 'Explica o campo ao lado.' },
  {
    type: 'frame',
    name: 'help-tip',
    layout: { type: 'none' },
    children: [icon('info', ICONS.info, C.muted, { anchors: { centerX: true, centerY: true } })],
  },
);
DOCS['help-tip'] = `# HelpTip

Explicação em ícone com dica, do \`src/ui/controls/HelpTip.tsx\`: o padrão da app no lugar de um parágrafo de texto.

O desenho é só o botão fechado (ícone \`info\` em \`color-text-muted\`). \`nome\` é o nome acessível e \`texto\` é o conteúdo da dica, que abre ao pairar, focar ou clicar; a dica aberta (o \`Tooltip\`, com largura máxima de 320 px) não é desenhada aqui.
`;

COMPONENTS.tags = base(
  'tags',
  'Tags',
  'Etiqueta (Chip) alternável de 24 px, em pílula; ligada fica em color-selection com borda color-accent.',
  { width: 80, height: 24 },
  { width: 32, height: 24 },
  { width: 'hug', height: 24 },
  { texto: 'Camada', pressionado: 'sim', contagem: 3 },
  {
    type: 'frame',
    name: 'chip',
    cornerRadius: 999,
    fill: { $if: eq('pressionado', 'sim'), then: C.selection, else: C.surface },
    stroke: { color: { $if: eq('pressionado', 'sim'), then: C.accent, else: C.control }, width: 1 },
    layout: { type: 'row', gap: 4, padding: [0, 8], align: 'center', justify: 'center' },
    children: [
      text('texto', fieldText('texto', 'Etiqueta'), C.text, font(12, 400, 16)),
      text('contagem', fieldText('contagem'), C.text, font(12, 600, 16), { visible: { $has: 'contagem' } }),
    ],
  },
);
DOCS.tags = `# Tags

Etiqueta alternável (\`Chip\`), do \`src/ui/controls/Chip.tsx\`: filtro compacto com contagem opcional.

- \`pressionado\`: fundo \`color-selection\` e borda \`color-accent\`; desligado, fundo \`color-surface\` e borda de controle.
- \`contagem\`: número em negrito depois do texto.

A etiqueta de camada da lista de anotações é feita em \`src/ui/ListView.tsx\`, não aqui. Hover e desabilitado vêm do CSS.
`;
EXAMPLES.tags = [
  { name: 'Ligada com contagem', values: { texto: 'Camada', pressionado: 'sim', contagem: 3 } },
  { name: 'Desligada', values: { texto: 'Avisos', pressionado: 'não' } },
];

COMPONENTS.dialog = base(
  'dialog',
  'Dialog',
  'Diálogo modal: cabeçalho de 44 px com o título e o fechar, e o corpo (slot) com 16 px de margem.',
  { width: 480, height: 240 },
  { width: 320, height: 120 },
  { width: 480, height: 'hug' },
  { titulo: 'Configurações', size: 'sm', alerta: 'não' },
  {
    type: 'frame',
    name: 'dialog',
    cornerRadius: 8,
    fill: C.surface,
    stroke: { color: C.border, width: 1 },
    shadow: SHADOW_POPUP,
    layout: { type: 'column' },
    children: [
      {
        type: 'frame',
        name: 'cabeçalho',
        width: 'fill',
        height: 44,
        layout: { type: 'row', padding: [0, 4, 0, 16], gap: 8, align: 'center', justify: 'space-between' },
        children: [
          text('título', fieldText('titulo'), C.text, font(15, 600, 22), { width: 'fill' }),
          {
            type: 'frame',
            name: 'fechar',
            width: 28,
            height: 28,
            layout: { type: 'none' },
            children: [icon('×', ICONS.close, C.text, { anchors: { centerX: true, centerY: true } })],
          },
        ],
      },
      { type: 'rect', name: 'divisória', width: 'fill', height: 1, fill: C.border },
      {
        type: 'slot',
        name: 'corpo',
        label: 'Conteúdo',
        width: 'fill',
        height: 'fill',
        layout: { type: 'column', gap: 16, padding: 16 },
      },
    ],
  },
);
DOCS.dialog = `# Dialog

Diálogo modal, do \`src/ui/Dialog.tsx\`.

## O que o desenho mostra

- Cabeçalho de 44 px (\`size-touch\`) com o \`titulo\` (15 px, peso 600) e o botão de fechar, e uma divisória embaixo.
- O corpo é o **slot** *Conteúdo*: as marcações filhas entram nele, com 16 px de margem e 16 px entre elas.
- Fundo \`color-surface\`, borda \`color-border\`, raio 8 e a sombra de popup.

## O que fica de fora

- As **ações** (rodapé com a divisória de cima, botões à direita) não são desenhadas; ponha um Button como filho do conteúdo se quiser mostrá-las.
- O \`size\` (\`sm\` 480 px, \`md\` 560 px, \`lg\` 820 px) não muda o desenho: dê a largura à marcação.
- O fundo escurecido (\`color-backdrop\`) também não.

Com \`alerta\`, o diálogo usa o papel de alerta (acessibilidade); sem efeito visual.
`;
EXAMPLES.dialog = [
  { name: 'Pequeno', values: { titulo: 'Excluir marcação?' } },
  { name: 'Alerta', values: { titulo: 'Projeto alterado fora da app', alerta: 'sim' } },
];

COMPONENTS.banner = base(
  'banner',
  'Banner',
  'Faixa de aviso no topo da região: atenção (color-warning) ou informação.',
  { width: 360, height: 32 },
  { width: 120, height: 24 },
  { width: 'fill', height: 'hug' },
  { tom: 'warning', texto: 'Build de preview: pode haver mudanças.' },
  {
    type: 'frame',
    name: 'banner',
    cornerRadius: 6,
    fill: { $if: eq('tom', 'warning'), then: C.warningBg, else: C.surface },
    stroke: { color: C.border, width: 1 },
    layout: { type: 'row', gap: 8, padding: [4, 4, 4, 12], align: 'center' },
    children: [
      text(
        'texto',
        fieldText('texto'),
        { $if: eq('tom', 'warning'), then: C.warning, else: C.text },
        font(12, { $if: eq('tom', 'warning'), then: 600, else: 400 }, 16),
        { width: 'fill' },
      ),
    ],
  },
);
DOCS.banner = `# Banner

Faixa de aviso, do \`src/ui/Banner.tsx\`: o aviso do canal de preview (\`PreviewBanner\`) e a nova versão (\`UpdateBanner\`).

- \`tom\` \`warning\`: fundo \`color-warning-bg\`, texto \`color-warning\` em peso 600.
- \`tom\` \`info\`: fundo \`color-surface\`, texto \`color-text\`.

A ação opcional e o botão de dispensar não são desenhados. O \`texto\` é o filho (\`children\`) do componente.
`;
EXAMPLES.banner = [
  { name: 'Atenção', values: { tom: 'warning', texto: 'Build de preview: pode haver mudanças.' } },
  { name: 'Informação', values: { tom: 'info', texto: 'Há uma nova versão da app.' } },
];

const NOTICE_ICON = { info: ICONS.info, warning: ICONS.warning, error: ICONS.error, success: ICONS.check };
const SM = eq('tamanho', 'sm');
COMPONENTS.notice = base(
  'notice',
  'Notice',
  'Aviso em caixa, com ícone e título opcional; o tom (info, warning, error, success) escolhe fundo, borda e ícone.',
  { width: 360, height: 64 },
  { width: 120, height: 32 },
  { width: 'fill', height: 'hug' },
  { tom: 'info', tamanho: 'md', titulo: 'Proposta substituída', dica: '', texto: 'Há uma proposta mais nova para este item.' },
  {
    type: 'frame',
    name: 'notice',
    cornerRadius: 6,
    fill: sw('tom', { info: C.selection, warning: C.warningBg, error: C.dangerBg, success: C.successBg }, C.selection),
    stroke: {
      color: sw('tom', { info: C.none, warning: C.warning, error: C.danger, success: C.success }, C.none),
      width: 1,
    },
    layout: { type: 'row', gap: 8, padding: { $if: SM, then: [6, 8], else: [8, 12] }, align: 'start' },
    children: [
      {
        type: 'frame',
        name: 'ícone',
        width: 16,
        height: 'hug',
        layout: { type: 'column', padding: [2, 0, 0, 0] },
        children: [
          icon(
            'ícone',
            sw('tom', NOTICE_ICON, ICONS.info),
            sw('tom', { info: C.accent, warning: C.warning, error: C.danger, success: C.success }, C.accent),
          ),
        ],
      },
      {
        type: 'frame',
        name: 'corpo',
        width: 'fill',
        height: 'hug',
        layout: { type: 'column', gap: 2 },
        children: [
          text('título', fieldText('titulo'), C.text, font({ $if: SM, then: 12, else: 13 }, 600, { $if: SM, then: 16, else: 20 }), {
            width: 'fill',
            visible: { $has: 'titulo' },
          }),
          text('texto', fieldText('texto'), C.text, font({ $if: SM, then: 12, else: 13 }, 400, { $if: SM, then: 16, else: 20 }), {
            width: 'fill',
          }),
        ],
      },
    ],
  },
);
DOCS.notice = `# Notice

Aviso em caixa, do \`src/ui/Notice.tsx\`.

| \`tom\` | Fundo | Borda | Ícone |
| --- | --- | --- | --- |
| \`info\` | \`color-selection\` | nenhuma | \`info\`, em \`color-accent\` |
| \`warning\` | \`color-warning-bg\` | \`color-warning\` | \`warning\` |
| \`error\` | \`color-danger-bg\` | \`color-danger\` | \`error\` |
| \`success\` | \`color-success-bg\` | \`color-success\` | \`check\` |

- \`tamanho\` \`sm\` reduz o espaço e a fonte (12 px).
- \`titulo\` aparece em negrito acima do texto.
- O tamanho \`line\` (uma linha só, com reticências), as ações e o botão de dispensar não são desenhados; \`dica\` só vale no \`line\`.

O \`texto\` é o filho (\`children\`) do componente.
`;
EXAMPLES.notice = [
  { name: 'Informação', values: { tom: 'info', titulo: 'Proposta substituída', texto: 'Há uma proposta mais nova para este item.' } },
  { name: 'Erro', values: { tom: 'error', texto: 'Não foi possível gravar o projeto.' } },
  { name: 'Sucesso compacto', values: { tom: 'success', tamanho: 'sm', texto: 'Proposta aplicada.' } },
];

COMPONENTS['notice-badge'] = base(
  'notice-badge',
  'NoticeBadge',
  'Selo em pílula do aviso de uma especialização: ícone e rótulo, na cor do kind.',
  { width: 104, height: 16 },
  { width: 48, height: 16 },
  { width: 'hug', height: 16 },
  { kind: 'deprecated' },
  {
    type: 'frame',
    name: 'notice-badge',
    cornerRadius: 999,
    fill: sw('kind', { removed: C.dangerBg, deprecated: C.warningBg, diverges: C.warningBg, pending: C.selectionMuted }, C.selectionMuted),
    layout: { type: 'row', gap: 4, padding: [0, 8], align: 'center' },
    children: [
      icon(
        'ícone',
        sw('kind', { removed: ICONS.blocked, deprecated: ICONS.warning, diverges: ICONS.compare, pending: ICONS.info }, ICONS.info),
        sw('kind', { removed: C.danger, deprecated: C.warning, diverges: C.warning, pending: C.muted }, C.muted),
      ),
      text(
        'rótulo',
        sw('kind', { removed: 'Removido', deprecated: 'Obsoleto', diverges: 'Diverge', pending: 'Pendente' }, 'Pendente'),
        sw('kind', { removed: C.danger, deprecated: C.warning, diverges: C.warning, pending: C.muted }, C.muted),
        font(11, 600, 16),
      ),
    ],
  },
);
DOCS['notice-badge'] = `# NoticeBadge

Selo do aviso de uma especialização (\`formatVersion\` 10), do \`src/ui/NoticeBadge.tsx\`: pílula com ícone e rótulo. A cor vem do \`kind\` e sempre vai com ícone e texto.

| \`kind\` | Rótulo | Ícone | Cor |
| --- | --- | --- | --- |
| \`removed\` | Removido | \`blocked\` | \`color-danger\` sobre \`color-danger-bg\` |
| \`deprecated\` | Obsoleto | \`warning\` | \`color-warning\` sobre \`color-warning-bg\` |
| \`diverges\` | Diverge | \`compare\` | \`color-warning\` sobre \`color-warning-bg\` |
| \`pending\` | Pendente | \`info\` | \`color-text-muted\` sobre \`color-selection-muted\` |

No código, o componente recebe o aviso inteiro (\`notice\`); a mensagem vai na dica e não é desenhada. Variantes do mesmo arquivo: \`TypeNoticeBadge\`, \`NoticeBlock\` e \`NoticeLines\`.
`;
EXAMPLES['notice-badge'] = [
  { name: 'Removido', values: { kind: 'removed' } },
  { name: 'Obsoleto', values: { kind: 'deprecated' } },
  { name: 'Diverge', values: { kind: 'diverges' } },
  { name: 'Pendente', values: { kind: 'pending' } },
];

// ===========================================================================================
// Tela do sistema de comentários (CM1–CM5) e moldura do editor. Medidas de editor.css,
// panels.css, threads.css, details.css, layout.css, dialogs.css; pinos de canvas/renderers/commentPins.ts
// e dos tokens cv-pin-* (iguais nos dois temas).
// ===========================================================================================
const PIN = { human: tok('cv-pin-human'), agent: tok('cv-pin-agent'), resolved: tok('cv-pin-resolved'), text: tok('cv-pin-text'), halo: tok('cv-pin-halo'), select: tok('cv-pin-selected'), unread: tok('cv-pin-unread') };
const fr = (name, o = {}, children = []) => ({ type: 'frame', name, ...o, children });
const NONE = { type: 'none' };
const YES = (key) => eq(key, 'sim');
const avatar = (name, size, value) =>
  fr(name, { width: size, height: size, cornerRadius: size / 2, fill: C.selectionMuted, layout: { type: 'row', align: 'center', justify: 'center' } }, [
    text('iniciais', value, C.text, font(11, 600, 16)),
  ]);
const smallButton = (name, label, primary, extra = {}) =>
  fr(name, {
    width: 'hug',
    height: 24,
    cornerRadius: 4,
    fill: primary ? C.accent : C.surface,
    stroke: { color: primary ? C.accent : C.control, width: 1 },
    layout: { type: 'row', padding: [0, 8], align: 'center', justify: 'center' },
    ...extra,
  }, [text('texto', label, primary ? C.accentText : C.text, font(13, 400, 20))]);
const lineBottom = () => ({ type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.border });
const SIM_NAO_COL = (key, label) => ({ key, label, type: 'enum', options: ['sim', 'não'], default: 'não' });

// ---- CommentPin
COMPONENTS['comment-pin'] = base(
  'comment-pin',
  'CommentPin',
  'Pino de conversa: pílula de 20 px com as iniciais e o número de mensagens, na cor do estado mais urgente; anel de selecionado, ponto de não lida e contorno tracejado de rascunho.',
  { width: 56, height: 20 },
  { width: 20, height: 20 },
  { width: 56, height: 20 },
  { estado: 'humano', rotulo: 'MA 3', selecionado: 'não', naoLida: 'não', rascunho: 'não' },
  fr('pino', {
    layout: NONE,
    cornerRadius: 10,
    fill: sw('estado', { agente: PIN.agent, resolvida: PIN.resolved }, PIN.human),
    stroke: { color: PIN.halo, width: 1 },
  }, [
    text('rótulo', fieldText('rotulo', 'MA 1'), PIN.text, font(11, 600, 16), { anchors: { centerX: true, centerY: true } }),
    { type: 'rect', name: 'anel de selecionado', cornerRadius: 10, fill: 'none', stroke: { color: PIN.select, width: 2, align: 'inside' }, visible: YES('selecionado') },
    { type: 'rect', name: 'rascunho', cornerRadius: 10, fill: 'none', stroke: { color: PIN.text, width: 1, dash: [3, 2] }, visible: YES('rascunho') },
    { type: 'ellipse', name: 'não lida', width: 8, height: 8, anchors: { top: 0, right: 0 }, fill: PIN.unread, stroke: { color: PIN.halo, width: 1 }, visible: YES('naoLida') },
  ]),
);
DOCS['comment-pin'] = `# CommentPin

Pino de conversa no canvas, desenhado no Konva por \`src/canvas/renderers/commentPins.ts\`.

- \`estado\`: \`humano\` (aguardando humano, \`cv-pin-human\`, âmbar), \`agente\` (aguardando agente, \`cv-pin-agent\`, teal) ou \`resolvida\` (\`cv-pin-resolved\`, cinza; só aparece enquanto está selecionada).
- \`rotulo\`: as iniciais e o número de mensagens ("MA 3") ou, com várias conversas no mesmo item, a contagem.
- \`selecionado\`: anel de 2 px em \`cv-pin-selected\`. \`naoLida\`: ponto de \`cv-pin-unread\` no canto de cima à direita. \`rascunho\`: contorno tracejado.

O pino real mede 20 px de tela e a largura cresce com o rótulo (7 px por caractere mais 16 de respiro); dê essa largura à marcação. O contorno de halo é aproximado em 1 px. Os pinos ficam sobre a foto, por isso as cores são iguais nos dois temas.
`;

// ---- ToolStripButton
COMPONENTS['tool-strip-button'] = base(
  'tool-strip-button',
  'ToolStripButton',
  'Botão da faixa lateral de 40 px: quadrado de 32 px com o ícone da janela em color-text-muted; ligado fica em color-selection-muted.',
  { width: 32, height: 32 },
  { width: 24, height: 24 },
  { width: 32, height: 32 },
  { icone: 'chat', selecionado: 'não' },
  fr('botão', { layout: NONE, cornerRadius: 6, fill: { $if: YES('selecionado'), then: C.selectionMuted, else: C.none } }, [
    icon('ícone', sw('icone', ICONS, ICONS.chat), { $if: YES('selecionado'), then: C.text, else: C.muted }, { anchors: { centerX: true, centerY: true } }),
  ]),
);
DOCS['tool-strip-button'] = `# ToolStripButton

Botão da faixa lateral (\`src/ui/ToolStrip.tsx\`, o \`StripButton\` interno): um por janela de ferramenta. Fica na faixa de 40 px; na esquerda, as janelas laterais ficam em cima e as da janela inferior embaixo.

\`icone\` é o nome de um ícone de \`src/ui/icons.tsx\` (a janela Comentários usa \`chat\`). \`selecionado\` marca a janela aberta (\`color-selection-muted\`). Hover e pressionado vêm do CSS.
`;

// ---- Breadcrumbs
COMPONENTS.breadcrumbs = base(
  'breadcrumbs',
  'Breadcrumbs',
  'Caminho da seleção acima do canvas: níveis em color-text-muted separados por ›, o último em negrito.',
  { width: 440, height: 28 },
  { width: 80, height: 28 },
  { width: 'fill', height: 28 },
  { caminho: 'Container › Marcação', atual: 'Botão' },
  fr('caminho', { layout: { type: 'row', gap: 2, padding: [0, 6], align: 'center' } }, [
    text('níveis', { $concat: [fieldText('caminho'), '  ›  '] }, C.muted, font(13, 400, 20), { visible: { $has: 'caminho' } }),
    text('atual', fieldText('atual', 'Nada selecionado'), { $if: { $has: 'atual' }, then: C.text, else: C.muted }, font(13, { $if: { $has: 'atual' }, then: 600, else: 400 }, 20)),
  ]),
);
DOCS.breadcrumbs = `# Breadcrumbs

Caminho da seleção (\`src/ui/Breadcrumbs.tsx\`): Imagem › Marcação › Marcação. Clicar num nível o seleciona; Alt+↑ e Alt+↓ andam no caminho.

\`caminho\` traz os níveis de cima já separados por " › " e \`atual\` o nível selecionado, que fica em negrito. Sem seleção, o componente mostra "Nada selecionado". O ícone de cada nível e o hover não são desenhados.
`;

// ---- CanvasMarking
COMPONENTS['canvas-marking'] = base(
  'canvas-marking',
  'CanvasMarking',
  'Marcação no canvas: contorno branco com halo e a etiqueta do nome em cv-name-tag. Com fundo "canvas", pinta a cor de fundo do canvas para mapear a área.',
  { width: 160, height: 96 },
  { width: 48, height: 32 },
  { width: 160, height: 96 },
  { nome: 'Botão', fundo: 'nenhum' },
  fr('marcação', {
    layout: NONE,
    fill: sw('fundo', { canvas: tok('color-canvas-bg') }, C.none),
    stroke: { color: sw('fundo', { canvas: C.border }, tok('cv-line')), width: 1 },
  }, [
    fr('etiqueta', { width: 'hug', height: 16, anchors: { top: 0, left: 0 }, fill: tok('cv-name-tag'), visible: { $has: 'nome' }, layout: { type: 'row', padding: [0, 6], align: 'center' } }, [
      text('nome', fieldText('nome'), tok('cv-name-tag-text'), font(11, 600, 16)),
    ]),
  ]),
);
DOCS['canvas-marking'] = `# CanvasMarking

A marcação como o canvas a desenha (\`src/canvas/renderers/markings.ts\`, cores em \`src/canvas/theme.ts\`): contorno branco (\`cv-line\`) com halo e a etiqueta do nome (\`cv-name-tag\`, \`cv-name-tag-text\`). Não é um componente Preact.

- \`nome\`: o texto da etiqueta.
- \`fundo\` \`canvas\`: pinta o retângulo com \`color-canvas-bg\`. É um recurso deste desenho para mapear a **área do canvas**; a app não tem esse fundo na marcação.

Seleção (\`cv-select\`), áreas de absorção e marcação do canvas tracejada (\`cv-canvas-marking\`) não são desenhadas.
`;

// ---- Menu
COMPONENTS.menu = base(
  'menu',
  'Menu',
  'Menu em popover: itens de 28 px com atalho opcional em caixa fina; item perigoso em color-danger.',
  { width: 200, height: 72 },
  { width: 120, height: 40 },
  { width: 200, height: 'hug' },
  { itens: [{ rotulo: 'Comentar aqui', atalho: '', perigo: 'não' }, { rotulo: 'Copiar referência', atalho: '', perigo: 'não' }] },
  fr('menu', {
    cornerRadius: 6,
    fill: C.surface,
    stroke: { color: C.border, width: 1 },
    shadow: SHADOW_POPUP,
    layout: { type: 'column', padding: 4 },
  }, [
    {
      type: 'repeat',
      name: 'itens',
      field: 'itens',
      direction: 'column',
      gap: 2,
      width: 'fill',
      template: fr('item', { width: 'fill', height: 28, cornerRadius: 4, layout: { type: 'row', gap: 16, padding: [0, 12], align: 'center' } }, [
        text('rótulo', fieldText('rotulo'), { $if: YES('perigo'), then: C.danger, else: C.text }, font(), { width: 'fill' }),
        fr('atalho', { width: 'hug', height: 'hug', cornerRadius: 2, opacity: 0.75, visible: { $has: 'atalho' }, stroke: { color: C.muted, width: 1 }, layout: { type: 'row', padding: [0, 4] } }, [
          text('tecla', fieldText('atalho'), C.muted, font(11, 400, 16)),
        ]),
      ]),
    },
  ]),
  2,
);
DOCS.menu = `# Menu

Menus da app: de ações (\`ActionMenu\`), de contexto do canvas (\`CanvasContextMenu\`) e de cópia (\`CopyActions\`), todos sobre o \`Popover\`.

\`itens\` traz uma linha por item: o \`rotulo\`, o \`atalho\` (caixa fina à direita) e se é \`perigo\` (texto em \`color-danger\`). O desenho segue o menu em popover: \`color-surface\`, borda \`color-border\`, raio 6, sombra de popup e itens de 28 px. O menu de ações tem borda de controle, e o foco e o hover vêm do CSS.
`;

// ---- ToolWindow
COMPONENTS['tool-window'] = base(
  'tool-window',
  'ToolWindow',
  'Janela de ferramenta encaixada: cabeçalho de 32 px com o título e o corpo (slot); a borda fica do lado que toca o canvas.',
  { width: 360, height: 240 },
  { width: 160, height: 80 },
  { width: 360, height: 240 },
  { janela: 'details', titulo: 'Detalhes', posicao: 'right' },
  fr('janela', { layout: { type: 'column' }, fill: C.surface }, [
    fr('cabeçalho', { width: 'fill', height: 32, layout: { type: 'row', padding: [0, 4, 0, 12], align: 'center' } }, [
      text('título', fieldText('titulo'), C.text, font(13, 600, 20), { width: 'fill', visible: { $and: [{ $has: 'titulo' }, { $not: eq('posicao', 'bottom') }] } }),
    ]),
    { type: 'slot', name: 'corpo', label: 'Conteúdo', width: 'fill', height: 'fill', layout: { type: 'column', gap: 12, padding: [0, 12, 12, 12] } },
  ]),
);
DOCS['tool-window'] = `# ToolWindow

Janela de ferramenta encaixada (\`src/ui/ToolWindow.tsx\`): cabeçalho de 32 px (\`size-tw-header\`) com o título e as ações, e o corpo com rolagem. Tamanhos em \`src/ui/toolWindowLayout.ts\` (esquerda 264, direita 360, embaixo 208).

- \`titulo\`: o título do cabeçalho. Na janela **inferior** (\`posicao\` \`bottom\`) o cabeçalho leva as abas no lugar do título; desenhe uma marcação de Tabs sobre ele e deixe o título vazio.
- \`posicao\`: \`left\`, \`right\` ou \`bottom\` (decide o lado da borda no app; o desenho não traça essa borda).
- \`janela\`: o identificador da janela (\`comments\` para a Comentários).
- O corpo é o **slot** *Conteúdo*.
`;

// ---- ThreadsSection
COMPONENTS['threads-section'] = base(
  'threads-section',
  'ThreadsSection',
  'Seção Conversas dos Detalhes: cabeçalho com o botão Nova e a lista de conversas do item (avatar, assunto, onde, nº de mensagens).',
  { width: 352, height: 150 },
  { width: 200, height: 60 },
  { width: 'fill', height: 'hug' },
  {
    conversas: [
      { iniciais: 'AG', assunto: 'A especialização não diz qual variante usar aqui', onde: 'em Button › variant', mensagens: '3 mensagens', naoLida: 'sim', selecionada: 'não' },
      { iniciais: 'MA', assunto: 'Qual tamanho vale para o rótulo?', onde: '', mensagens: '1 mensagem', naoLida: 'não', selecionada: 'sim' },
    ],
  },
  fr('seção', { layout: { type: 'column', gap: 8 } }, [
    fr('cabeçalho', { width: 'fill', height: 28, layout: { type: 'row', gap: 4, align: 'center' } }, [
      icon('seta', ICONS.chevronDown, C.muted),
      text('título', 'Conversas', C.text, font(13, 600, 20), { width: 'fill' }),
      smallButton('nova', 'Nova', false),
    ]),
    {
      type: 'repeat',
      name: 'conversas',
      field: 'conversas',
      direction: 'column',
      gap: 2,
      width: 'fill',
      template: fr('conversa', { width: 'fill', cornerRadius: 4, fill: { $if: YES('selecionada'), then: C.selection, else: C.none }, layout: { type: 'row', gap: 8, padding: [4, 8], align: 'center' } }, [
        avatar('avatar', 24, fieldText('iniciais')),
        fr('texto', { width: 'fill', height: 'hug', layout: { type: 'column' } }, [
          text('assunto', fieldText('assunto'), C.text, font(13, { $if: YES('naoLida'), then: 600, else: 400 }, 20), { width: 'fill' }),
          text('onde', fieldText('onde'), C.muted, font(12, 400, 16), { width: 'fill', visible: { $has: 'onde' } }),
        ]),
        text('mensagens', fieldText('mensagens'), C.muted, font(12, 400, 16)),
      ]),
    },
  ]),
  2,
);
DOCS['threads-section'] = `# ThreadsSection

Seção **Conversas** dos Detalhes (\`src/ui/comments/ThreadsSection.tsx\`): cabeçalho com o título e o botão **Nova**, e a lista de conversas do item.

\`conversas\` traz uma linha por conversa: \`iniciais\` do autor, \`assunto\`, \`onde\` ("em Button › variante", quando a conversa não é do próprio item), \`mensagens\` ("3 mensagens") e se está \`naoLida\` (assunto em negrito) ou \`selecionada\` (fundo \`color-selection\`).

A conversa aberta (\`ThreadView\`) e o estado vazio com o compositor não são desenhados aqui: use as marcações ThreadMessage e Composer.
`;

// ---- ThreadMessage
COMPONENTS['thread-message'] = base(
  'thread-message',
  'ThreadMessage',
  'Uma mensagem da conversa: avatar de 24 px, nome, selo de agente, hora relativa e o texto.',
  { width: 344, height: 72 },
  { width: 160, height: 44 },
  { width: 'fill', height: 'hug' },
  { iniciais: 'MA', autor: 'Marina Alves', agente: 'não', quando: 'há 5 min', texto: 'É outlined. O da tela de login é o principal da página, por isso filled.' },
  fr('mensagem', { layout: { type: 'row', gap: 8, align: 'start' } }, [
    avatar('avatar', 24, fieldText('iniciais', '?')),
    fr('corpo', { width: 'fill', height: 'hug', layout: { type: 'column' } }, [
      fr('cabeçalho', { width: 'fill', height: 'hug', layout: { type: 'row', gap: 8, align: 'center' } }, [
        text('autor', fieldText('autor'), C.text, font(13, 600, 20)),
        fr('agente', { width: 'hug', height: 16, cornerRadius: 999, fill: C.selectionMuted, visible: YES('agente'), layout: { type: 'row', padding: [0, 6], align: 'center' } }, [
          text('agente', 'agente', C.muted, font(11, 600, 16)),
        ]),
        text('quando', fieldText('quando'), C.muted, font(12, 400, 16)),
      ]),
      text('texto', fieldText('texto'), C.text, font(13, 400, 20), { width: 'fill' }),
    ]),
  ]),
);
DOCS['thread-message'] = `# ThreadMessage

Uma mensagem da conversa (\`src/ui/comments/ThreadMessage.tsx\`): iniciais, nome, selo de agente, hora relativa e o texto em markdown.

\`agente\` \`sim\` mostra o selo *agente* e é o que separa a mensagem de agente da de pessoa. O texto aparece sem a formatação do markdown; uma citação dentro dele é o CitationChip, que você desenha como marcação sobre o texto. O cartão da proposta (ProposalCard) vem entre o cabeçalho e o texto, quando a mensagem tem proposta.
`;

// ---- CitationChip
COMPONENTS['citation-chip'] = base(
  'citation-chip',
  'CitationChip',
  'Chip de citação em texto corrido: pílula em color-selection com o nome de agora do alvo; riscado e cinza quando o alvo some.',
  { width: 190, height: 22 },
  { width: 40, height: 22 },
  { width: 'hug', height: 22 },
  { rotulo: 'Botão da tela de login', quebrada: 'não' },
  fr('chip', { cornerRadius: 999, fill: { $if: YES('quebrada'), then: C.selectionMuted, else: C.selection }, layout: { type: 'row', padding: [0, 7], align: 'center', justify: 'center' } }, [
    text('rótulo', fieldText('rotulo', '(sem nome)'), { $if: YES('quebrada'), then: C.muted, else: C.accent }, font(13, 400, 20, { decoration: { $if: YES('quebrada'), then: 'line-through', else: 'none' } })),
  ]),
);
DOCS['citation-chip'] = `# CitationChip

Chip de citação (\`src/ui/comments/CitationChip.tsx\`): o link \`[nome](mapping://…)\` de uma mensagem, mostrado com o nome **de agora** do alvo.

- Alvo existe: fundo \`color-selection\`, texto \`color-accent\`. Clicar leva ao alvo.
- \`quebrada\` \`sim\` (o alvo foi apagado): fundo \`color-selection-muted\`, texto cinza e **riscado**, com o rótulo de reserva.

Mede 22 px: a linha de 20 px mais a borda transparente de 1 px. No texto corrido o chip é \`inline\`; aqui ele é uma peça solta.
`;

// ---- ProposalCard
COMPONENTS['proposal-card'] = base(
  'proposal-card',
  'ProposalCard',
  'Cartão da proposta numa mensagem: ícone, título em negrito, quantas mudanças faltam revisar e o botão Revisar.',
  { width: 344, height: 52 },
  { width: 200, height: 44 },
  { width: 'fill', height: 'hug' },
  { titulo: 'Variantes dos botões', estado: '3 mudanças para revisar', acao: 'Revisar' },
  fr('cartão', { cornerRadius: 6, stroke: { color: C.border, width: 1 }, layout: { type: 'row', gap: 8, padding: [6, 8], align: 'center' } }, [
    icon('proposta', ICONS.proposal, C.text),
    fr('texto', { width: 'fill', height: 'hug', layout: { type: 'column' } }, [
      text('título', fieldText('titulo', 'Proposta'), C.text, font(12, 600, 16), { width: 'fill' }),
      text('estado', fieldText('estado'), C.muted, font(12, 400, 16), { width: 'fill', visible: { $has: 'estado' } }),
    ]),
    fr('ação', {
      width: 'hug',
      height: 24,
      cornerRadius: 4,
      visible: { $has: 'acao' },
      fill: { $if: eq('acao', 'Revisar'), then: C.accent, else: C.surface },
      stroke: { color: { $if: eq('acao', 'Revisar'), then: C.accent, else: C.control }, width: 1 },
      layout: { type: 'row', padding: [0, 8], align: 'center', justify: 'center' },
    }, [text('ação', fieldText('acao'), { $if: eq('acao', 'Revisar'), then: C.accentText, else: C.text }, font(13, 400, 20))]),
  ]),
);
DOCS['proposal-card'] = `# ProposalCard

Cartão da proposta numa mensagem da conversa (\`src/ui/comments/ProposalCard.tsx\`): título, o que falta revisar e a ação.

- \`estado\`: "N mudanças para revisar", "Todas as mudanças com decisão" ou, para a encerrada, o status.
- \`acao\`: **Revisar** (botão primário, proposta aberta) ou **Ver** (botão neutro, proposta encerrada); vazio na proposta retirada.

Borda \`color-border\`, raio 6 e texto de 12 px. O cartão de proposta removida ("Proposta removida") não é desenhado.
`;

// ---- Composer
COMPONENTS.composer = base(
  'composer',
  'Composer',
  'Compositor da conversa: "Comentar como …", o campo de texto, a dica de atalhos e o botão Enviar; sem identidade, o aviso e o botão que leva às Configurações.',
  { width: 344, height: 128 },
  { width: 200, height: 96 },
  { width: 'fill', height: 'hug' },
  { autor: 'Marina Alves', texto: '', semIdentidade: 'não' },
  fr('compositor', { layout: { type: 'column', gap: 8 } }, [
    fr('com identidade', { width: 'fill', height: 'hug', visible: { $not: YES('semIdentidade') }, layout: { type: 'column', gap: 8 } }, [
      text('rótulo', { $concat: ['Comentar como ', fieldText('autor')] }, C.muted, font(12, 400, 16), { width: 'fill', visible: { $has: 'autor' } }),
      fr('campo', { width: 'fill', height: 64, cornerRadius: 4, fill: C.bg, stroke: { color: C.control, width: 1 }, layout: { type: 'column', padding: [6, 8] } }, [
        text('texto', fieldText('texto'), C.text, font(13, 400, 20), { width: 'fill', visible: { $has: 'texto' } }),
      ]),
      fr('ações', { width: 'fill', height: 24, layout: { type: 'row', gap: 8, align: 'center', justify: 'end' } }, [
        text('dica', 'Ctrl+Enter envia; Enter quebra a linha', C.muted, font(12, 400, 16), { width: 'fill' }),
        smallButton('enviar', 'Enviar', true),
      ]),
    ]),
    fr('sem identidade', { width: 'fill', height: 'hug', visible: YES('semIdentidade'), layout: { type: 'column', gap: 8 } }, [
      text('aviso', 'Preencha seu nome e e-mail nas Configurações para comentar.', C.muted, font(12, 400, 16), { width: 'fill' }),
      smallButton('preencher', 'Preencher nas Configurações', false),
    ]),
  ]),
);
DOCS.composer = `# Composer

Compositor da conversa (\`src/ui/comments/Composer.tsx\`).

- Com identidade: "Comentar como {autor}", o campo de texto (\`texto\`, fundo \`color-bg\`, borda de controle), a dica *Ctrl+Enter envia; Enter quebra a linha* e o botão **Enviar**.
- \`semIdentidade\` \`sim\`: o aviso *Preencha seu nome e e-mail nas Configurações para comentar.* e o botão **Preencher nas Configurações** (leva à seção Identidade).

O editor real é o \`CitationEditor\` (citações viram chips) e o \`@\` abre o \`CitePicker\`; nenhum dos dois é desenhado aqui.
`;

// ---- CommentsWindow (a tabela da janela Comentários)
const CW = { por: '16%', ancora: '21%', msgs: '6%', status: '18%', quando: '9%' };
const cwRow = estado => ({ $eq: ['estado', estado] });
COMPONENTS['comments-window'] = base(
  'comments-window',
  'CommentsWindow',
  'Tabela da janela Comentários: resumo, cabeçalho (Por, Âncora, Última mensagem, Msgs, Status, Quando) e uma linha por conversa; não lida em negrito, resolvida riscada e cinza, órfã em color-warning.',
  { width: 812, height: 164 },
  { width: 400, height: 80 },
  { width: 'fill', height: 'hug' },
  {
    resumo: '2 abertas · 1 aguardando agente · 3 resolvidas',
    conversas: [
      { iniciais: 'MA', nome: 'Marina Alves', ancora: 'Button › variant', ultima: 'É outlined, por isso filled', msgs: '3', status: 'Aguardando agente', badge: 'agente', quando: 'há 5 min', estado: 'normal' },
      { iniciais: 'AG', nome: 'Claude Code', ancora: 'Campo Texto', ultima: 'A spec não diz qual variante', msgs: '1', status: 'Aguardando humano', badge: 'humano', quando: 'ontem', estado: 'naoLida' },
      { iniciais: 'MA', nome: 'Marina Alves', ancora: 'Seção Identidade', ultima: 'Resolvido.', msgs: '4', status: 'Resolvida', badge: 'resolvida', quando: '05/11', estado: 'resolvida' },
    ],
  },
  fr('janela', { layout: { type: 'column' }, fill: C.surface }, [
    fr('resumo', { width: 'fill', height: 'hug', visible: { $has: 'resumo' }, layout: { type: 'row', padding: [4, 12] } }, [
      text('resumo', fieldText('resumo'), C.text, font(12, 400, 16), { width: 'fill' }),
    ]),
    fr('cabeçalho', { width: 'fill', height: 28, layout: NONE }, [
      fr('colunas', { layout: { type: 'row', padding: [0, 12], align: 'center' } }, [
        text('Por', 'Por', C.muted, font(12, 400, 16), { width: CW.por }),
        text('Âncora', 'Âncora', C.muted, font(12, 400, 16), { width: CW.ancora }),
        text('Última mensagem', 'Última mensagem', C.muted, font(12, 400, 16), { width: 'fill' }),
        text('Msgs', 'Msgs', C.muted, font(12, 400, 16, { align: 'right' }), { width: CW.msgs }),
        text('Status', 'Status', C.muted, font(12, 400, 16), { width: CW.status }),
        text('Quando', 'Quando', C.muted, font(12, 400, 16), { width: CW.quando }),
        { type: 'rect', name: 'menu', width: 24, height: 1, fill: C.none },
      ]),
      lineBottom(),
    ]),
    {
      type: 'repeat',
      name: 'conversas',
      field: 'conversas',
      direction: 'column',
      gap: 0,
      width: 'fill',
      template: fr('linha', { width: 'fill', height: 28, layout: NONE }, [
        fr('células', { layout: { type: 'row', padding: [0, 12], align: 'center' } }, [
          fr('por', { width: CW.por, height: 'hug', layout: { type: 'row', gap: 4, align: 'center' } }, [
            avatar('avatar', 16, fieldText('iniciais')),
            text('nome', fieldText('nome'), { $if: cwRow('resolvida'), then: C.muted, else: C.text }, font(13, { $if: cwRow('naoLida'), then: 600, else: 400 }, 20), { width: 'fill' }),
          ]),
          text('âncora', fieldText('ancora'),
            sw('estado', { orfa: C.warning, resolvida: C.muted }, C.text),
            font(13, { $if: cwRow('naoLida'), then: 600, else: 400 }, 20, { decoration: { $if: cwRow('resolvida'), then: 'line-through', else: 'none' } }),
            { width: CW.ancora }),
          text('última', fieldText('ultima'), { $if: cwRow('resolvida'), then: C.muted, else: C.text }, font(13, { $if: cwRow('naoLida'), then: 600, else: 400 }, 20), { width: 'fill' }),
          text('msgs', fieldText('msgs'), { $if: cwRow('resolvida'), then: C.muted, else: C.text }, font(13, 400, 20, { align: 'right' }), { width: CW.msgs }),
          fr('status', { width: CW.status, height: 'hug', layout: { type: 'row', align: 'center' } }, [
            fr('selo', { width: 'hug', height: 16, cornerRadius: 999, fill: sw('badge', { agente: C.warningBg }, C.selectionMuted), layout: { type: 'row', padding: [0, 8], align: 'center' } }, [
              text('status', fieldText('status'), sw('badge', { agente: C.warning, resolvida: C.success }, C.muted), font(11, 600, 16)),
            ]),
          ]),
          text('quando', fieldText('quando'), C.muted, font(13, 400, 20), { width: CW.quando }),
          icon('ações', ICONS.more, C.muted),
        ]),
        lineBottom(),
      ]),
    },
  ]),
  2,
);
DOCS['comments-window'] = `# CommentsWindow

A tabela da janela **Comentários** (\`src/ui/comments/CommentsWindow.tsx\`, atalho \`Ctrl+Shift+0\`): todas as conversas do mapeamento, uma por linha.

## O que o desenho mostra

- \`resumo\`: a linha de contagens ("2 abertas · 1 aguardando agente · 3 resolvidas").
- O cabeçalho **Por · Âncora · Última mensagem · Msgs · Status · Quando**, com as larguras do app (16%, 24%, o resto, 7%, 14%, 9% e a coluna do ⋯).
- \`conversas\`: uma linha por conversa. \`estado\` muda o estilo: \`naoLida\` em negrito, \`resolvida\` em cinza com a âncora **riscada**, \`orfa\` com a âncora em \`color-warning\`. \`badge\` colore o selo de status: \`agente\` (aguardando agente, \`color-warning\`), \`humano\` (neutro) ou \`resolvida\` (\`color-success\`).

## O que fica de fora

Os **filtros** (Status, Usuário, busca e "Citam a seleção") ficam acima da tabela e são controles do DS: desenhe-os como marcações Segmented, Select, TextField e Tags. O ponto de não lida, o estado vazio e a janela só leitura durante a revisão também não são desenhados.

**Texto longo:** o app corta nome, âncora e última mensagem com reticências; o desenho não corta, ele quebra a linha e a linha de 28 px fica pequena. Use textos curtos (cerca de 15 caracteres no nome e 25 na última mensagem, numa janela de 812 px) ou aumente a altura da marcação.
`;

// ---- StatusBar
COMPONENTS['status-bar'] = base(
  'status-bar',
  'StatusBar',
  'Barra de status de 26 px: salvamento e destino à esquerda, o item de conversas e as informações do editor à direita.',
  { width: 900, height: 26 },
  { width: 360, height: 26 },
  { width: 'fill', height: 26 },
  { esquerda: 'Salvo · projeto local', conversas: '2 conversas abertas · 1 aguardando agente', direita: '100% · v15' },
  fr('barra', { layout: NONE, fill: C.surface }, [
    { type: 'rect', name: 'borda', height: 1, anchors: { left: 0, right: 0, top: 0 }, fill: C.border },
    fr('itens', { layout: { type: 'row', gap: 2, padding: [0, 8], align: 'center' } }, [
      text('esquerda', fieldText('esquerda'), C.muted, font(12, 400, 16), { width: 'fill' }),
      fr('conversas', { width: 'hug', height: 'hug', visible: { $has: 'conversas' }, layout: { type: 'row', gap: 4, padding: [0, 6], align: 'center' } }, [
        icon('conversa', ICONS.chat, C.accent),
        text('texto', fieldText('conversas'), C.accent, font(12, 400, 16)),
      ]),
      text('direita', fieldText('direita'), C.muted, font(12, 400, 16)),
    ]),
  ]),
);
DOCS['status-bar'] = `# StatusBar

Barra de status do editor (\`src/ui/StatusBar.tsx\`): 26 px, borda de cima \`color-border\`, texto de 12 px em \`color-text-muted\`.

- \`esquerda\`: salvamento, destino e "não exportado".
- \`conversas\`: o item **N conversas abertas · M aguardando agente**, em \`color-accent\` com o ícone de conversa; clicar abre a janela Comentários.
- \`direita\`: seleção, cursor, zoom, schema, canal e build.

O campo de zoom e o item do modo de visualização não são desenhados.
`;

// ---- SettingsDialog
COMPONENTS['settings-dialog'] = base(
  'settings-dialog',
  'SettingsDialog',
  'Diálogo Configurações: cabeçalho de 44 px com o título e o fechar, e o corpo (slot) onde entram as seções.',
  { width: 480, height: 320 },
  { width: 320, height: 160 },
  { width: 480, height: 'hug' },
  { titulo: 'Configurações' },
  fr('configurações', { cornerRadius: 8, fill: C.surface, stroke: { color: C.border, width: 1 }, shadow: SHADOW_POPUP, layout: { type: 'column' } }, [
    fr('cabeçalho', { width: 'fill', height: 44, layout: { type: 'row', padding: [0, 4, 0, 16], gap: 8, align: 'center', justify: 'space-between' } }, [
      text('título', fieldText('titulo', 'Configurações'), C.text, font(15, 600, 22), { width: 'fill' }),
      fr('fechar', { width: 28, height: 28, layout: NONE }, [icon('×', ICONS.close, C.text, { anchors: { centerX: true, centerY: true } })]),
    ]),
    { type: 'rect', name: 'divisória', width: 'fill', height: 1, fill: C.border },
    { type: 'slot', name: 'seções', label: 'Seções', width: 'fill', height: 'fill', layout: { type: 'column', gap: 16, padding: 16 } },
  ]),
);
DOCS['settings-dialog'] = `# SettingsDialog

Diálogo **Configurações** (\`src/ui/SettingsDialog.tsx\`): as seções Repositórios (\`PlatformRepos\`), Identidade (\`IdentitySettings\`) e Privacidade (\`PrivacySettings\`), e a barra \`SettingsBar\`.

O desenho é o cartão do diálogo: cabeçalho de 44 px com o título e o fechar, divisória e o corpo como slot *Seções* (16 px de margem). As seções entram como marcações dentro dele. O rodapé de ações não é desenhado.
`;

// ---- IdentitySettings
COMPONENTS['identity-settings'] = base(
  'identity-settings',
  'IdentitySettings',
  'Seção Identidade das Configurações: título, o texto de apoio e, sem identidade, o aviso de que só dá para ler as conversas.',
  { width: 448, height: 180 },
  { width: 240, height: 120 },
  { width: 'fill', height: 'hug' },
  { semIdentidade: 'não' },
  fr('identidade', { layout: { type: 'column', gap: 8 } }, [
    text('título', 'Identidade', C.text, font(15, 600, 22), { width: 'fill' }),
    text('apoio', 'Seu nome e seu e-mail assinam as mensagens que você escreve nas conversas. Ficam só neste dispositivo, nunca no projeto. Use os mesmos do git config.', C.muted, font(13, 400, 20), { width: 'fill' }),
    text('sem identidade', 'Sem identidade você só lê as conversas: escrever, resolver, reabrir e apagar pedem nome e e-mail.', C.warning, font(12, 400, 16), { width: 'fill', visible: YES('semIdentidade') }),
  ]),
);
DOCS['identity-settings'] = `# IdentitySettings

Seção **Identidade** do diálogo Configurações (\`src/ui/IdentitySettings.tsx\`, etapa Comentários CM2). Nome e e-mail assinam as mensagens; ficam só no dispositivo, nunca no projeto.

O desenho traz o título, o texto de apoio e, com \`semIdentidade\` \`sim\`, o aviso *Sem identidade você só lê as conversas…*. Os campos **Nome** e **E-mail** (TextField), os botões **Salvar** (primário, \`sm\`) e **Esquecer** (\`sm\`) e a confirmação *Identidade salva neste dispositivo.* são marcações do DS sobre esta seção.
`;

// ---- DeleteThreadDialogs
COMPONENTS['delete-thread-dialogs'] = base(
  'delete-thread-dialogs',
  'DeleteThreadDialogs',
  'Conteúdo dos diálogos de apagar conversa: o texto do impacto (quantas mensagens e de quem).',
  { width: 448, height: 60 },
  { width: 200, height: 40 },
  { width: 'fill', height: 'hug' },
  { texto: 'Vão embora 3 mensagens: 2 de Marina Alves, 1 de Claude Code (agente). Não dá para desfazer.' },
  fr('conteúdo', { layout: { type: 'column', gap: 8 } }, [text('texto', fieldText('texto'), C.text, font(13, 400, 20), { width: 'fill' })]),
);
DOCS['delete-thread-dialogs'] = `# DeleteThreadDialogs

Diálogos de apagar conversa (\`src/ui/comments/useDeleteThread.tsx\`) e de apagar em lote (\`src/ui/comments/BulkDeleteDialog.tsx\`).

- **Apagar a conversa?** abre quando há mensagem de outra pessoa ou de agente; lista quantas mensagens vão embora e de quem, e avisa que não dá para desfazer. Conversa só da própria pessoa é apagada direto.
- **Apagar conversas** (em lote): *Só as resolvidas* (marcado), *Com a última mensagem antes de* e a contagem ("2 conversas serão apagadas."). Os critérios são marcações Choice.

O desenho é o texto do conteúdo, para ir dentro de um Dialog.
`;

// ---- Campos novos
const NEW_FIELDS = {
  'comment-pin': [
    { key: 'estado', label: 'estado', type: 'enum', options: ['humano', 'agente', 'resolvida'], default: 'humano' },
    { key: 'rotulo', label: 'rótulo', type: 'string' },
    SIM_NAO_COL('selecionado', 'selecionado'),
    SIM_NAO_COL('naoLida', 'não lida'),
    SIM_NAO_COL('rascunho', 'rascunho'),
  ],
  'tool-strip-button': [{ key: 'icone', label: 'ícone', type: 'string' }, SIM_NAO_COL('selecionado', 'selecionado')],
  breadcrumbs: [{ key: 'caminho', label: 'caminho', type: 'string' }, { key: 'atual', label: 'atual', type: 'string' }],
  'canvas-marking': [{ key: 'nome', label: 'nome', type: 'string' }, { key: 'fundo', label: 'fundo', type: 'enum', options: ['nenhum', 'canvas'], default: 'nenhum' }],
  menu: [
    { key: 'itens', label: 'itens', type: 'table', columns: [{ key: 'rotulo', label: 'rótulo', type: 'string' }, { key: 'atalho', label: 'atalho', type: 'string' }, SIM_NAO_COL('perigo', 'perigo')] },
  ],
  'threads-section': [
    {
      key: 'conversas',
      label: 'conversas',
      type: 'table',
      columns: [
        { key: 'iniciais', label: 'iniciais', type: 'string' },
        { key: 'assunto', label: 'assunto', type: 'string' },
        { key: 'onde', label: 'onde', type: 'string' },
        { key: 'mensagens', label: 'mensagens', type: 'string' },
        SIM_NAO_COL('naoLida', 'não lida'),
        SIM_NAO_COL('selecionada', 'selecionada'),
      ],
    },
  ],
  'thread-message': [
    { key: 'iniciais', label: 'iniciais', type: 'string' },
    { key: 'autor', label: 'autor', type: 'string' },
    SIM_NAO_COL('agente', 'agente'),
    { key: 'quando', label: 'quando', type: 'string' },
    { key: 'texto', label: 'texto', type: 'string' },
  ],
  'citation-chip': [{ key: 'rotulo', label: 'rótulo', type: 'string' }, SIM_NAO_COL('quebrada', 'alvo apagado')],
  'proposal-card': [
    { key: 'titulo', label: 'título', type: 'string' },
    { key: 'estado', label: 'estado', type: 'string' },
    { key: 'acao', label: 'ação', type: 'enum', options: ['Revisar', 'Ver'], },
  ],
  composer: [{ key: 'autor', label: 'autor', type: 'string' }, { key: 'texto', label: 'texto', type: 'string' }, SIM_NAO_COL('semIdentidade', 'sem identidade')],
  'comments-window': [
    { key: 'resumo', label: 'resumo', type: 'string' },
    {
      key: 'conversas',
      label: 'conversas',
      type: 'table',
      columns: [
        { key: 'iniciais', label: 'iniciais', type: 'string' },
        { key: 'nome', label: 'nome', type: 'string' },
        { key: 'ancora', label: 'âncora', type: 'string' },
        { key: 'ultima', label: 'última mensagem', type: 'string' },
        { key: 'msgs', label: 'msgs', type: 'string' },
        { key: 'status', label: 'status', type: 'string' },
        { key: 'badge', label: 'selo', type: 'enum', options: ['humano', 'agente', 'resolvida'], default: 'humano' },
        { key: 'quando', label: 'quando', type: 'string' },
        { key: 'estado', label: 'estado', type: 'enum', options: ['normal', 'naoLida', 'resolvida', 'orfa'], default: 'normal' },
      ],
    },
  ],
  'status-bar': [
    { key: 'esquerda', label: 'esquerda', type: 'string' },
    { key: 'conversas', label: 'conversas', type: 'string' },
    { key: 'direita', label: 'direita', type: 'string' },
  ],
  'settings-dialog': [{ key: 'titulo', label: 'título', type: 'string' }],
  'identity-settings': [SIM_NAO_COL('semIdentidade', 'sem identidade')],
  'delete-thread-dialogs': [{ key: 'texto', label: 'texto', type: 'string' }],
};
// tool-window: janela deixa de ser obrigatória e ganha título e posição.
const FIELD_OVERRIDE = {
  'tool-window': [
    { key: 'janela', label: 'janela', type: 'string' },
    { key: 'titulo', label: 'título', type: 'string' },
    { key: 'posicao', label: 'posição', type: 'enum', options: ['left', 'right', 'bottom'], default: 'right' },
  ],
};

// ---- Campos que o desenho precisa e o tipo ainda não tinha
const EXTRA_FIELDS = {
  select: [{ key: 'valor', label: 'valor', type: 'string' }],
  choice: [{ key: 'marcado', label: 'marcado', type: 'enum', options: ['sim', 'não'], default: 'não' }],
  banner: [{ key: 'texto', label: 'texto', type: 'string', required: true }],
  notice: [{ key: 'texto', label: 'texto', type: 'string', required: true }],
  segmented: [
    {
      key: 'opcoes',
      label: 'opções',
      type: 'table',
      columns: [
        { key: 'rotulo', label: 'rótulo', type: 'string' },
        { key: 'selecionada', label: 'selecionada', type: 'enum', options: ['sim', 'não'], default: 'não' },
      ],
    },
  ],
  tabs: [
    {
      key: 'abas',
      label: 'abas',
      type: 'table',
      columns: [
        { key: 'rotulo', label: 'rótulo', type: 'string' },
        { key: 'selecionada', label: 'selecionada', type: 'enum', options: ['sim', 'não'], default: 'não' },
        { key: 'selo', label: 'selo', type: 'string' },
      ],
    },
  ],
};
const EXTRA_PARAMS = {
  select: { valor: 'value' },
  choice: { marcado: 'checked' },
  segmented: { opcoes: 'items' },
  tabs: { abas: 'tabs' },
};
const EXTRA_VALUES = { choice: { marcado: { sim: 'true', não: 'false' } } };
const EXTRA_NOTES = {
  banner: 'O texto é o filho (children) do Banner.',
  notice: 'O texto é o filho (children) do Notice.',
  segmented: 'Cada linha de opcoes vira um SegmentedItem em items (rotulo → label); a selecionada é o value.',
  tabs: 'Cada linha de abas vira um TabItem em tabs (rotulo → label, selo → badge); a selecionada é o value.',
};

// ===========================================================================================
// Revisão 3: o que o layout real do editor pede (EditorMainBar, EditorTools, ToolStrip, ThreadMessage).
// ===========================================================================================
for (const name of ['pan', 'draw', 'addImage', 'container', 'specialization', 'export', 'help', 'settings', 'fit', 'eye', 'undo', 'redo', 'chat', 'chatAdd', 'tree', 'layers', 'library', 'list', 'checklist', 'warning', 'diagnostics', 'proposal', 'panelRight', 'marking']) {
  if (!ICONS[name]) throw new Error(`ícone ausente em icons.tsx: ${name}`);
}

// IconButton: texto opcional ao lado do ícone (Especializações e Exportar, na barra principal).
COMPONENTS['icon-button'] = base(
  'icon-button',
  'IconButton',
  'Botão de 28 px só com ícone de 16 px, ou com texto ao lado; ligado (pressionado) fica cheio de color-accent.',
  { width: 28, height: 28 },
  { width: 24, height: 24 },
  { width: 'hug', height: 28 },
  { icone: 'plus', rotulo: 'Adicionar', texto: '', variant: 'default', pressionado: 'não', alerta: 'não', selo: '' },
  fr('icon-button', {
    layout: NONE,
    cornerRadius: 4,
    fill: { $if: { $field: 'pressionado' }, then: C.accent, else: C.none },
  }, [
    fr('conteúdo', { layout: { type: 'row', gap: 6, padding: { $if: { $has: 'texto' }, then: [0, 8], else: 0 }, align: 'center', justify: 'center' } }, [
      icon('ícone', iconSwitch('icone'), { $if: { $field: 'pressionado' }, then: C.accentText, else: sw('variant', { danger: C.danger, accept: C.muted, reject: C.muted }, C.text) }),
      text('texto', fieldText('texto'), { $if: { $field: 'pressionado' }, then: C.accentText, else: C.text }, font(13, 400, 20), { visible: { $has: 'texto' } }),
    ]),
    { type: 'ellipse', name: 'alerta', width: 6, height: 6, anchors: { top: 4, right: 4 }, fill: C.danger, visible: { $field: 'alerta' } },
    fr('selo', { width: 'hug', height: 16, anchors: { top: 0, right: 0 }, cornerRadius: 999, fill: C.accent, visible: { $has: 'selo' }, layout: { type: 'row', padding: [0, 4], align: 'center', justify: 'center' } }, [
      text('número', fieldText('selo'), C.accentText, font(11, 600, 16)),
    ]),
  ]),
);
DOCS['icon-button'] = `# IconButton

Botão só com ícone, do \`src/ui/controls/IconButton.tsx\`. O \`label\` é obrigatório porque vira o nome acessível e o texto do Tooltip; onde cabe texto, prefira o Button.

## Ícone e texto

\`icone\` é o nome (chave camelCase) de um ícone de \`src/ui/icons.tsx\`; este desenho traz o traço dos 88 ícones do app. Com \`texto\`, o texto aparece ao lado do ícone (como **Especializações** e **Exportar** na barra principal); sem ele, o botão é só o ícone, e o \`rotulo\` não aparece.

## Estados desenhados

- \`pressionado\`: cheio de \`color-accent\`, ícone e texto em \`color-accent-text\`.
- \`variant\`: \`danger\` pinta o ícone de \`color-danger\`; \`accept\` e \`reject\` o deixam neutro (\`color-text-muted\`).
- \`alerta\`: ponto de 6 px no canto de cima, à direita. \`selo\`: contador numérico no canto.

Hover e foco vêm do CSS. O tamanho \`sm\` tem 24 px: reduza a marcação.
`;

// Segmented: opção só com ícone (Navegar e Desenhar, na barra principal).
COMPONENTS.segmented.template.children[0].template.children = [
  icon('ícone', sw('icone', ICONS, PLACEHOLDER_ICON), { $if: eq('selecionada', 'sim'), then: C.accentText, else: C.text }, { visible: { $has: 'icone' } }),
  text('rótulo', fieldText('rotulo'), { $if: eq('selecionada', 'sim'), then: C.accentText, else: C.text }, font(), { visible: { $not: { $has: 'icone' } } }),
];
COMPONENTS.segmented.template.children[0].template.layout = { type: 'row', gap: 6, padding: { $if: { $has: 'icone' }, then: [0, 6], else: [0, 12] }, align: 'center', justify: 'center' };
DOCS.segmented = DOCS.segmented.replace('A opção selecionada fica cheia', 'Uma opção com `icone` é desenhada só com o ícone (28 px, como Navegar e Desenhar na barra principal) e o `rotulo` fica como nome acessível.\n\nA opção selecionada fica cheia').replace(
  'As opções só com ícone (`icon`) não são desenhadas: o desenho mostra o rótulo de todas.',
  'O `showLabel` e o atalho de cada opção não são desenhados.',
);

// ToolStripButton: é um IconButton de 28 px dentro da faixa de 40 px.
Object.assign(COMPONENTS['tool-strip-button'], {
  description: 'Botão da faixa lateral de 40 px: IconButton de 28 px com o ícone da janela em color-text-muted; ligado fica em color-selection-muted.',
  size: { width: 28, height: 28 },
  minSize: { width: 24, height: 24 },
  sizing: { width: 28, height: 28 },
});
COMPONENTS['tool-strip-button'].template.cornerRadius = 6;

// ThreadMessage: o cartão da proposta fica entre o cabeçalho e o texto, como no app.
const cardNode = (kTitulo, kEstado, kAcao) =>
  fr('cartão da proposta', { width: 'fill', height: 'hug', cornerRadius: 6, visible: { $has: kTitulo }, stroke: { color: C.border, width: 1 }, layout: { type: 'row', gap: 8, padding: [6, 8], align: 'center' } }, [
    icon('proposta', ICONS.proposal, C.text),
    fr('texto', { width: 'fill', height: 'hug', layout: { type: 'column' } }, [
      text('título', fieldText(kTitulo), C.text, font(12, 600, 16), { width: 'fill' }),
      text('estado', fieldText(kEstado), C.muted, font(12, 400, 16), { width: 'fill', visible: { $has: kEstado } }),
    ]),
    fr('ação', {
      width: 'hug',
      height: 24,
      cornerRadius: 4,
      visible: { $has: kAcao },
      fill: { $if: eq(kAcao, 'Revisar'), then: C.accent, else: C.surface },
      stroke: { color: { $if: eq(kAcao, 'Revisar'), then: C.accent, else: C.control }, width: 1 },
      layout: { type: 'row', padding: [0, 8], align: 'center', justify: 'center' },
    }, [text('ação', fieldText(kAcao), { $if: eq(kAcao, 'Revisar'), then: C.accentText, else: C.text }, font(13, 400, 20))]),
  ]);
{
  const body = COMPONENTS['thread-message'].template.children[1];
  body.children.splice(1, 0, cardNode('proposta', 'propostaEstado', 'propostaAcao'));
  COMPONENTS['thread-message'].minSize = { width: 160, height: 44 };
}
DOCS['thread-message'] = DOCS['thread-message'].replace(
  'O cartão da proposta (ProposalCard) vem entre o cabeçalho e o texto, quando a mensagem tem proposta.',
  'Quando a mensagem liga uma proposta (`proposta`, `propostaEstado`, `propostaAcao`), o cartão da proposta aparece entre o cabeçalho e o texto, como no app (veja ProposalCard).',
);

NEW_FIELDS['thread-message'].push(
  { key: 'proposta', label: 'proposta (título)', type: 'string' },
  { key: 'propostaEstado', label: 'proposta (estado)', type: 'string' },
  { key: 'propostaAcao', label: 'proposta (ação)', type: 'enum', options: ['Revisar', 'Ver'] },
);
NEW_FIELDS['icon-button'] = [{ key: 'texto', label: 'texto', type: 'string' }];
EXTRA_FIELDS.segmented[0].columns.push({ key: 'icone', label: 'ícone', type: 'string' });

// ===========================================================================================
// Revisão 5: cada item é uma marcação. Primitivos (Texto, Ícone, Iniciais, Selo, Caixa) e os
// compostos desenham só a própria moldura; o que fica dentro deles são marcações filhas.
// Regra do motor: quadro "hug" mede os filhos com fill/% valendo 0 — nada de texto com largura
// fill dentro de quadro hug.
// ===========================================================================================
// --font-mono do app no Windows (uma família só, pelo mesmo motivo de FONT_SANS).
const FONT_MONO = 'Cascadia Mono';
const COR = { text: C.text, muted: C.muted, accent: C.accent, danger: C.danger, warning: C.warning, success: C.success, 'accent-text': C.accentText };
const corDe = (key) => sw(key, COR, C.text);
// Estilos de texto de src/theme/tokens.ts (TEXT_STYLES): tamanho, peso, altura de linha.
const ESTILOS = {
  't-display': [20, 600, 28],
  't-title': [15, 600, 22],
  't-heading': [13, 600, 20],
  't-body': [13, 400, 20],
  't-body-strong': [13, 600, 20],
  't-small': [12, 400, 16],
  't-label': [12, 400, 16],
  't-micro': [11, 600, 16],
  't-code': [12, 400, 18],
  't-kbd': [11, 400, 16],
};
const estiloDe = (i) => sw('estilo', Object.fromEntries(Object.entries(ESTILOS).map(([k, v]) => [k, v[i]])), ESTILOS['t-body'][i]);

// ---- Texto
COMPONENTS.text = base(
  'text',
  'Texto',
  'Texto solto com um estilo de tipografia do DS (t-*) e uma cor dos tokens; centralizado na altura da marcação.',
  { width: 120, height: 20 },
  { width: 8, height: 12 },
  { width: 120, height: 20 },
  { texto: 'Texto', estilo: 't-body', cor: 'text', alinhamento: 'left', decoracao: 'none' },
  fr('texto', { layout: NONE }, [
    ...['left', 'center', 'right'].map((al) => ({
      type: 'text',
      name: `linha (${al})`,
      text: fieldText('texto', ''),
      color: corDe('cor'),
      font: {
        family: { $if: eq('estilo', 't-code'), then: FONT_MONO, else: FONT_SANS },
        size: estiloDe(0),
        weight: estiloDe(1),
        lineHeight: estiloDe(2),
        decoration: sw('decoracao', { 'line-through': 'line-through', underline: 'underline' }, 'none'),
      },
      width: 'hug',
      height: 'hug',
      anchors: al === 'left' ? { left: 0, centerY: true } : al === 'right' ? { right: 0, centerY: true } : { centerX: true, centerY: true },
      visible: { $and: [{ $not: eq('quebra', 'sim') }, al === 'left' ? { $not: { $or: [eq('alinhamento', 'center'), eq('alinhamento', 'right')] } } : eq('alinhamento', al)] },
    })),
    {
      type: 'text',
      name: 'parágrafo',
      visible: eq('quebra', 'sim'),
      text: fieldText('texto', ''),
      color: corDe('cor'),
      font: {
        family: { $if: eq('estilo', 't-code'), then: FONT_MONO, else: FONT_SANS },
        size: estiloDe(0),
        weight: estiloDe(1),
        lineHeight: estiloDe(2),
        align: sw('alinhamento', { center: 'center', right: 'right' }, 'left'),
        verticalAlign: 'top',
        decoration: sw('decoracao', { 'line-through': 'line-through', underline: 'underline' }, 'none'),
      },
      width: 'fill',
      height: 'fill',
    },
  ]),
);
DOCS.text = `# Texto

Primitivo para todo texto solto da interface: título de janela ou de seção, rótulo, nome do autor, texto de mensagem, célula de tabela, item da barra de status. O texto de um controle (Button, TextField, Select…) continua sendo campo do próprio controle.

- \`estilo\`: um estilo de \`src/theme/tokens.ts\`: \`t-display\` (20/28, 600), \`t-title\` (15/22, 600), \`t-heading\` (13/20, 600), \`t-body\` (13/20), \`t-body-strong\` (13/20, 600), \`t-small\` e \`t-label\` (12/16), \`t-micro\` (11/16, 600), \`t-code\` (12/18, monoespaçada) e \`t-kbd\` (11/16).
- \`cor\`: \`text\`, \`muted\`, \`accent\`, \`danger\`, \`warning\`, \`success\` ou \`accent-text\`.
- \`alinhamento\` e \`decoracao\` (\`line-through\` para o riscado, \`underline\`).

Uma linha (\`quebra\` \`não\`, o padrão) fica centralizada na altura da marcação e não quebra: o que passa da largura é recortado (o app põe reticências). Um parágrafo (\`quebra\` \`sim\`, o texto de uma mensagem) quebra na largura e começa no topo. Não há componente de código: no app é texto dentro de um elemento com a classe do estilo.
`;
EXAMPLES.text = [
  { name: 'Título de janela', values: { texto: 'Detalhes', estilo: 't-heading' } },
  { name: 'Apoio', values: { texto: 'há 5 min', estilo: 't-small', cor: 'muted' } },
  { name: 'Riscado', values: { texto: 'Seção Identidade', estilo: 't-body', cor: 'muted', decoracao: 'line-through' } },
];

// ---- Ícone
COMPONENTS.icon = base(
  'icon',
  'Ícone',
  'Um dos 89 ícones do app (grade de 16 px, traço de 1,25, pontas redondas), na cor escolhida.',
  { width: 16, height: 16 },
  { width: 12, height: 12 },
  { width: 16, height: 16 },
  { icone: 'chat', cor: 'text' },
  fr('ícone', { layout: NONE }, [icon('ícone', sw('icone', ICONS, PLACEHOLDER_ICON), corDe('cor'), { anchors: { centerX: true, centerY: true } })]),
);
DOCS.icon = `# Ícone

Ícone solto (\`<Icon name="…" />\` de \`src/ui/icons.tsx\`): 16 px, traço de 1,25 com pontas e cantos redondos, na cor do texto em volta (\`currentColor\`). \`icone\` é a chave camelCase (a lista de sugestões traz os 89). Ícone que é botão é IconButton; este é o ícone decorativo (o logo da barra principal, a seta de uma seção, o ícone de um item da barra de status).

Os ícones vêm do conjunto da biblioteca (\`icons/icons.json\`, gerado do \`src/ui/icons.tsx\`: os traços com ponta e canto redondos e os pontos cheios). No conjunto o nome é em kebab-case (\`chevronDown\` vira \`chevron-down\`); o campo continua com a chave do app, e o desenho converte. Nome fora da lista desenha o reservado.
`;

// ---- Iniciais
COMPONENTS.avatar = base(
  'avatar',
  'Iniciais',
  'As iniciais de quem escreveu, num círculo em color-selection-muted (24 px na conversa, 16 px na tabela).',
  { width: 24, height: 24 },
  { width: 16, height: 16 },
  { width: 24, height: 24 },
  { iniciais: 'MA', estilo: 'conversa' },
  fr('iniciais', { layout: NONE, cornerRadius: 999, fill: C.selectionMuted }, [
    { type: 'text', name: 'iniciais', text: fieldText('iniciais', '?'), color: sw('estilo', { tabela: C.muted }, C.text), font: font(11, 600, 16, { align: 'center', verticalAlign: 'middle' }), width: 'fill', height: 'fill' },
  ]),
);
DOCS.avatar = `# Iniciais

As iniciais do autor (\`initials\` de \`src/model/threadUsers.ts\`: primeira e última palavra; o agente é **AG**).

- \`estilo\` \`conversa\`: \`.thread-avatar\` (24 px, texto \`color-text\`), na mensagem e na lista de conversas.
- \`estilo\` \`tabela\`: \`.comments-avatar\` (16 px, texto \`color-text-muted\`), na coluna Por da janela Comentários.
`;

// ---- Selo
const SELO_FUNDO = { tag: C.none, agente: C.selectionMuted, 'estado-agente': C.warningBg, 'estado-humano': C.selection, 'estado-resolvida': C.successBg, contagem: C.selectionMuted, 'contagem-info': C.accent, status: C.selectionMuted, 'status-agente': C.warningBg, 'status-resolvida': C.selectionMuted, preview: C.warningBg };
const SELO_TEXTO = { tag: C.muted, agente: C.muted, 'estado-agente': C.warning, 'estado-humano': C.accent, 'estado-resolvida': C.success, contagem: C.muted, 'contagem-info': C.accentText, status: C.muted, 'status-agente': C.warning, 'status-resolvida': C.success, preview: C.warning };
COMPONENTS.badge = base(
  'badge',
  'Selo',
  'Pílula de texto curto: etiqueta, selo de agente, estado da conversa, contagem de aba, status da tabela ou o selo PREVIEW.',
  { width: 56, height: 16 },
  { width: 16, height: 14 },
  { width: 56, height: 16 },
  { texto: 'agente', estilo: 'agente' },
  fr('selo', {
    layout: NONE,
    cornerRadius: sw('estilo', { preview: 4 }, 999),
    fill: sw('estilo', SELO_FUNDO, C.selectionMuted),
    stroke: { color: sw('estilo', { tag: C.control, preview: C.warning }, C.none), width: 1 },
  }, [
    {
      type: 'text',
      name: 'texto',
      text: fieldText('texto', ''),
      color: sw('estilo', SELO_TEXTO, C.muted),
      font: { family: FONT_SANS, size: sw('estilo', { contagem: 12, 'contagem-info': 12 }, 11), weight: sw('estilo', { tag: 400, contagem: 400, 'contagem-info': 400 }, 600), lineHeight: 16, align: 'center', verticalAlign: 'middle' },
      width: 'fill',
      height: 'fill',
    },
  ]),
);
DOCS.badge = `# Selo

As pílulas de texto do app, cada estilo uma classe do CSS:

| \`estilo\` | Classe | Onde |
| --- | --- | --- |
| \`tag\` | \`.tag\` | etiqueta de camada (borda de controle, texto cinza) |
| \`agente\` | \`.thread-message-agent\` | o "agente" ao lado do nome na mensagem |
| \`estado-agente\`, \`estado-humano\`, \`estado-resolvida\` | \`.thread-state-*\` | estado no cabeçalho da conversa |
| \`contagem\`, \`contagem-info\` | \`.tab-badge\`, \`.tab-badge-info\` | contador de aba (12 px) |
| \`status\`, \`status-agente\`, \`status-resolvida\` | \`.comments-badge*\` | coluna Status da janela Comentários |
| \`preview\` | \`.badge-warning\` | selo PREVIEW (raio 4, borda) |

O texto fica centralizado na marcação: dê a ela a largura do texto mais o respiro do estilo (6 a 8 px de cada lado).
`;

// ---- Caixa
const FUNDO = { nenhum: C.none, surface: C.surface, bg: C.bg, canvas: tok('color-canvas-bg'), hover: tok('color-hover'), pressed: tok('color-pressed'), selection: C.selection, 'selection-muted': C.selectionMuted, 'warning-bg': C.warningBg, 'danger-bg': C.dangerBg, 'success-bg': C.successBg, accent: C.accent, tooltip: C.tooltip };
const BORDA = { nenhuma: C.none, border: C.border, control: C.control, accent: C.accent, danger: C.danger, warning: C.warning };
const RAIO = { '0': 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 12, full: 999 };
const lado = (nome, anchors, size) => ({ type: 'rect', name: `borda ${nome}`, ...size, anchors, fill: sw('borda', BORDA, C.none), visible: eq('lados', nome) });
COMPONENTS.box = base(
  'box',
  'Caixa',
  'Região com fundo, borda, raio e sombra dos tokens: barras, faixas, linhas de tabela, divisórias e áreas que não são um componente.',
  { width: 160, height: 80 },
  { width: 1, height: 1 },
  { width: 160, height: 80 },
  { fundo: 'surface', borda: 'border', lados: 'todos', raio: '0', sombra: 'nenhuma' },
  fr('caixa', {
    layout: NONE,
    fill: sw('fundo', FUNDO, C.none),
    cornerRadius: sw('raio', RAIO, 0),
    stroke: { color: { $if: eq('lados', 'todos'), then: sw('borda', BORDA, C.none), else: C.none }, width: 1 },
    shadow: { color: sw('sombra', { popup: SHADOW_POPUP.color }, 'none'), x: 0, y: 8, blur: 24 },
  }, [
    lado('cima', { left: 0, right: 0, top: 0 }, { height: 1 }),
    lado('baixo', { left: 0, right: 0, bottom: 0 }, { height: 1 }),
    lado('esquerda', { left: 0, top: 0, bottom: 0 }, { width: 1 }),
    lado('direita', { right: 0, top: 0, bottom: 0 }, { width: 1 }),
  ]),
);
DOCS.box = `# Caixa

Região desenhada só com tokens, para o que não é componente: a barra principal, a faixa lateral, a barra do canvas, uma linha de tabela, uma divisória, o fundo de uma linha selecionada.

- \`fundo\`: \`surface\`, \`bg\`, \`canvas\` (\`color-canvas-bg\`), \`hover\`, \`pressed\`, \`selection\`, \`selection-muted\`, \`warning-bg\`, \`danger-bg\`, \`success-bg\`, \`accent\`, \`tooltip\` ou \`nenhum\`.
- \`borda\` e \`lados\`: a cor (\`border\` é a divisória, \`control\` a borda de controle) e se vale nos quatro lados ou só em um (\`cima\`, \`baixo\`, \`esquerda\`, \`direita\`).
- \`raio\`: \`xs\` 2, \`sm\` 4, \`md\` 6, \`lg\` 8, \`xl\` 12, \`full\`. \`sombra\` \`popup\`: a sombra de menus e diálogos.

Uma divisória é uma Caixa de 1 px de altura com \`fundo\` \`nenhum\` e \`lados\` \`cima\`.
`;

// ---- Compostos: só a moldura
COMPONENTS['tool-window'] = base(
  'tool-window',
  'ToolWindow',
  'Moldura da janela de ferramenta: fundo color-surface, a divisória do lado que toca o canvas e o título do cabeçalho de 32 px.',
  { width: 360, height: 240 },
  { width: 120, height: 60 },
  { width: 360, height: 240 },
  { janela: 'details', titulo: 'Detalhes', posicao: 'right' },
  fr('janela', { layout: NONE, fill: C.surface }, [
    text('título', fieldText('titulo'), C.text, font(13, 600, 20, { verticalAlign: 'middle' }), {
      anchors: { left: 12, right: 72, top: 0 },
      height: 32,
      visible: { $and: [{ $has: 'titulo' }, { $not: eq('posicao', 'bottom') }] },
    }),
    { type: 'rect', name: 'divisória', width: 1, anchors: { right: 0, top: 0, bottom: 0 }, fill: C.border, visible: eq('posicao', 'left') },
    { type: 'rect', name: 'divisória', width: 1, anchors: { left: 0, top: 0, bottom: 0 }, fill: C.border, visible: eq('posicao', 'right') },
    { type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, top: 0 }, fill: C.border, visible: eq('posicao', 'bottom') },
  ]),
);
DOCS['tool-window'] = `# ToolWindow

Moldura da janela de ferramenta encaixada (\`src/ui/ToolWindow.tsx\`): fundo \`color-surface\`, a divisória \`color-border\` do lado que toca o canvas e o cabeçalho de 32 px com o título (o título vem da janela, por isso é campo dela). Tamanhos em \`src/ui/toolWindowLayout.ts\`: esquerda 264, direita 360, embaixo 208.

**Tudo o que fica dentro é marcação filha:** as ações do cabeçalho e o fechar (IconButton), as abas da janela inferior (Tabs) e o conteúdo. Na janela inferior (\`posicao\` \`bottom\`) o título não aparece: o cabeçalho é das abas.
`;

COMPONENTS['status-bar'] = base(
  'status-bar',
  'StatusBar',
  'Moldura da barra de status: 26 px, fundo color-surface e a divisória de cima.',
  { width: 900, height: 26 },
  { width: 120, height: 26 },
  { width: 900, height: 26 },
  {},
  fr('barra', { layout: NONE, fill: C.surface }, [{ type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, top: 0 }, fill: C.border }]),
);
DOCS['status-bar'] = `# StatusBar

Moldura da barra de status (\`src/ui/StatusBar.tsx\`): 26 px, fundo \`color-surface\`, divisória de cima. Os itens são marcações filhas, com 8 px de margem e 2 px entre eles: à esquerda o salvamento (Ícone \`check\` em \`success\` e Texto \`t-small\`) e o destino; à direita a seleção, o cursor, o zoom, \`schema v15\`, o canal e o build (Texto \`t-small\` \`muted\`; o build em \`t-code\`). O item de conversas é Ícone \`chat\` e Texto em \`accent\`.
`;

COMPONENTS.menu = base(
  'menu',
  'Menu',
  'Moldura do menu em popover: color-surface, borda color-border, raio 6 e a sombra de popup. Os itens são Buttons filhos.',
  { width: 200, height: 72 },
  { width: 40, height: 20 },
  { width: 200, height: 72 },
  {},
  fr('menu', { layout: NONE, cornerRadius: 6, fill: C.surface, stroke: { color: C.border, width: 1 }, shadow: SHADOW_POPUP }, []),
);
DOCS.menu = `# Menu

Moldura dos menus (\`MenuPopover\`, \`ActionMenu\`, \`CanvasContextMenu\`, \`CopyActions\`, sobre o \`Popover\`): \`color-surface\`, borda \`color-border\`, raio 6, sombra de popup e 4 px de margem.

Cada item é um **Button** filho com \`variant\` \`ghost\` e \`alinhamento\` \`start\` (28 px; 2 px entre os itens). O item perigoso é \`variant\` \`danger\`. O atalho de um item é um Texto \`t-kbd\` à direita.
`;

COMPONENTS['proposal-card'] = base(
  'proposal-card',
  'ProposalCard',
  'Moldura do cartão da proposta: borda color-border e raio 6. Ícone, título, estado e o botão são filhos.',
  { width: 344, height: 44 },
  { width: 40, height: 28 },
  { width: 344, height: 44 },
  {},
  fr('cartão', { layout: NONE, cornerRadius: 6, stroke: { color: C.border, width: 1 } }, []),
);
DOCS['proposal-card'] = `# ProposalCard

Moldura do cartão da proposta numa mensagem (\`src/ui/comments/ProposalCard.tsx\`): borda \`color-border\`, raio 6, 6 × 8 px de margem e 8 px entre os itens. Os filhos: Ícone \`proposal\`; o título (Texto \`t-small\`, peso 600: use \`t-micro\` ou \`t-body-strong\` conforme o tamanho); o estado ("3 mudanças para revisar", Texto \`t-small\` \`muted\`); e o Button \`sm\` **Revisar** (\`primary\`) ou **Ver**.
`;

COMPONENTS['comments-window'] = base(
  'comments-window',
  'CommentsWindow',
  'Fundo da janela Comentários. Filtros, resumo, cabeçalho e linhas da tabela são filhos.',
  { width: 812, height: 164 },
  { width: 120, height: 40 },
  { width: 812, height: 164 },
  {},
  fr('janela', { layout: NONE, fill: C.surface }, []),
);
DOCS['comments-window'] = `# CommentsWindow

O conteúdo da janela **Comentários** (\`src/ui/comments/CommentsWindow.tsx\`, \`Ctrl+Shift+0\`). O desenho é só o fundo; tudo é filho:

- **Filtros** (\`.list-filters\`, 4 × 12 px, divisória embaixo): Segmented de status (Todas, Abertas, Aguardando agente, Aguardando humano, Resolvidas), Select de usuário, TextField de busca e Chip (Tags) **Citam a seleção**.
- **Resumo**: Texto \`t-small\` ("2 abertas · 1 aguardando agente").
- **Cabeçalho** (28 px, Texto \`t-small\` \`muted\`): Por (16%), Âncora (24%), Última mensagem, Msgs (7%, à direita), Status (14%), Quando (9%) e a coluna do ⋯.
- **Linhas** (Caixa com divisória embaixo): Iniciais \`tabela\` e Texto do nome; âncora (riscada e cinza na resolvida, \`warning\` na órfã); última mensagem; contagem; Selo de status; quando; IconButton \`more\`. A não lida é \`t-body-strong\`.
`;

// Agrupadores: sem desenho próprio (no app não têm fundo nem borda).
for (const id of ['thread-message', 'threads-section', 'composer', 'breadcrumbs', 'identity-settings', 'delete-thread-dialogs']) delete COMPONENTS[id];
DOCS['thread-message'] = `# ThreadMessage

Uma mensagem da conversa (\`src/ui/comments/ThreadMessage.tsx\`). No app ela não tem fundo nem borda: a marcação só agrupa os filhos, numa linha com 8 px entre o avatar e o corpo.

- **Iniciais** (\`conversa\`, 24 px).
- Cabeçalho: o nome (Texto \`t-body-strong\`), o Selo \`agente\` (só na mensagem de agente) e a hora (Texto \`t-small\` \`muted\`, "há 5 min").
- **ProposalCard**, quando a mensagem liga uma proposta.
- O texto (Texto \`t-body\`), com as citações como **CitationChip**.
`;
DOCS['threads-section'] = `# ThreadsSection

A seção **Conversas** dos Detalhes (\`src/ui/comments/ThreadsSection.tsx\`). Sem desenho próprio: agrupa o cabeçalho (Ícone \`chevronDown\` \`muted\`, Texto \`t-heading\` "Conversas" e o Button \`sm\` **Nova**) e as linhas da lista. Cada linha (\`.thread-row\`, 4 × 8 px de margem, raio 4) é uma Caixa (\`selection\` quando é a aberta) com Iniciais, o assunto (Texto \`t-body\`, \`t-body-strong\` se não lida), o "em …" (Texto \`t-small\` \`muted\`) e a contagem (Texto \`t-small\` \`muted\`).
`;
DOCS.composer = `# Composer

O compositor da conversa (\`src/ui/comments/Composer.tsx\`). Sem desenho próprio: agrupa, numa coluna com 8 px entre os itens, "Comentar como Marina Alves" (Texto \`t-small\` \`muted\`), o campo (TextField com \`linhas\` \`varias\`) e a linha de ações: a dica "Ctrl+Enter envia; Enter quebra a linha" (Texto \`t-small\` \`muted\`) e o Button \`sm\` \`primary\` **Enviar**. Sem identidade: o aviso (Texto \`t-small\` \`muted\`) e o Button **Preencher nas Configurações**.
`;
DOCS.breadcrumbs = `# Breadcrumbs

O caminho da seleção (\`src/ui/Breadcrumbs.tsx\`), à esquerda da barra do canvas. Sem desenho próprio: cada nível é um Texto \`t-body\` \`muted\` (o atual, \`t-body-strong\` \`text\`) e o separador "›" é um Texto \`muted\`. Sem seleção, um Texto \`t-small\` \`muted\` "Nada selecionado".
`;
DOCS['identity-settings'] = `# IdentitySettings

A seção **Identidade** das Configurações (\`src/ui/IdentitySettings.tsx\`). Sem desenho próprio: agrupa o título (Texto \`t-title\`), o apoio (Texto \`t-body\` \`muted\`), os TextFields **Nome** e **E-mail** e os Buttons \`sm\` **Salvar** (\`primary\`) e **Esquecer**.
`;
DOCS['delete-thread-dialogs'] = `# DeleteThreadDialogs

O conteúdo dos diálogos de apagar conversa (\`src/ui/comments/useDeleteThread.tsx\` e \`BulkDeleteDialog.tsx\`), dentro de um Dialog \`alerta\`. Sem desenho próprio: o texto do impacto (Texto \`t-body\`), os critérios do lote (Choice) e a contagem (Texto).
`;
for (const id of ['thread-message', 'threads-section', 'comments-window', 'composer', 'proposal-card', 'status-bar', 'menu', 'breadcrumbs', 'identity-settings', 'delete-thread-dialogs']) NEW_FIELDS[id] = [];

// ---- Campos dos primitivos
NEW_FIELDS.text = [
  { key: 'texto', label: 'texto', type: 'string', required: true },
  { key: 'estilo', label: 'estilo', type: 'enum', options: Object.keys(ESTILOS), default: 't-body' },
  { key: 'cor', label: 'cor', type: 'enum', options: Object.keys(COR), default: 'text' },
  { key: 'alinhamento', label: 'alinhamento', type: 'enum', options: ['left', 'center', 'right'], default: 'left' },
  { key: 'decoracao', label: 'decoração', type: 'enum', options: ['none', 'line-through', 'underline'], default: 'none' },
  { key: 'quebra', label: 'quebra linha', type: 'enum', options: ['não', 'sim'], default: 'não' },
];
NEW_FIELDS.icon = [
  { key: 'icone', label: 'ícone', type: 'string', required: true },
  { key: 'cor', label: 'cor', type: 'enum', options: Object.keys(COR), default: 'text' },
];
NEW_FIELDS.avatar = [
  { key: 'iniciais', label: 'iniciais', type: 'string', required: true },
  { key: 'estilo', label: 'estilo', type: 'enum', options: ['conversa', 'tabela'], default: 'conversa' },
];
NEW_FIELDS.badge = [
  { key: 'texto', label: 'texto', type: 'string', required: true },
  { key: 'estilo', label: 'estilo', type: 'enum', options: Object.keys(SELO_FUNDO), default: 'tag' },
];
NEW_FIELDS.box = [
  { key: 'fundo', label: 'fundo', type: 'enum', options: Object.keys(FUNDO), default: 'surface' },
  { key: 'borda', label: 'borda', type: 'enum', options: Object.keys(BORDA), default: 'nenhuma' },
  { key: 'lados', label: 'lados', type: 'enum', options: ['todos', 'cima', 'baixo', 'esquerda', 'direita'], default: 'todos' },
  { key: 'raio', label: 'raio', type: 'enum', options: Object.keys(RAIO), default: '0' },
  { key: 'sombra', label: 'sombra', type: 'enum', options: ['nenhuma', 'popup'], default: 'nenhuma' },
];

// ---- Button: item de menu alinhado à esquerda
NEW_FIELDS.button = [{ key: 'alinhamento', label: 'alinhamento', type: 'enum', options: ['center', 'start'], default: 'center' }];
COMPONENTS.button.template.layout.justify = sw('alinhamento', { start: 'start' }, 'center');

// ---- TextField: várias linhas (TextArea), para o compositor
NEW_FIELDS['text-field'] = [{ key: 'linhas', label: 'linhas', type: 'enum', options: ['uma', 'varias'], default: 'uma' }];
{
  const kids = COMPONENTS['text-field'].template.children;
  const NOT_AREA = { $not: eq('linhas', 'varias') };
  kids[1].visible = { $and: [kids[1].visible, NOT_AREA] };
  kids[2].visible = { $and: [kids[2].visible, NOT_AREA] };
  kids.push({ ...JSON.parse(JSON.stringify(kids[1])), name: 'área', height: 'fill', visible: eq('linhas', 'varias'), layout: { type: 'column', padding: [6, 8] } });
}

// ---- Tabs: aba com a largura do texto (o "fill" no eixo de um repeat em linha vira 0)
{
  const rep = COMPONENTS.tabs.template.children[1];
  rep.template = fr('aba', { height: 'fill', layout: { type: 'column' } }, [
    fr('conteúdo', { width: 'hug', height: 'fill', layout: { type: 'row', gap: 6, padding: [0, 8], align: 'center' } }, [
      text('rótulo', fieldText('rotulo'), { $if: eq('selecionada', 'sim'), then: C.text, else: C.muted }, font(13, { $if: eq('selecionada', 'sim'), then: 600, else: 400 }, 20)),
      fr('selo', { width: 'hug', height: 16, cornerRadius: 999, fill: C.selectionMuted, visible: { $has: 'selo' }, layout: { type: 'row', padding: [0, 6], align: 'center' } }, [
        text('contador', fieldText('selo'), C.muted, font(12, 400, 16)),
      ]),
    ]),
    { type: 'rect', name: 'sublinhado', width: 'fill', height: 2, fill: { $if: eq('selecionada', 'sim'), then: C.accent, else: C.none } },
  ]);
  rep.gap = 4;
  rep.width = 'hug';
}

// ---- Notice: o corpo ocupa a altura da marcação (hug media o texto com largura 0)
COMPONENTS.notice.template.children[1].height = 'fill';

// ---- Migração 4 → 5: os campos que viraram marcações filhas saem dos compostos.
const REMOVED = {
  'thread-message': ['iniciais', 'autor', 'agente', 'quando', 'texto', 'proposta', 'propostaEstado', 'propostaAcao'],
  'threads-section': ['conversas'],
  'comments-window': ['resumo', 'conversas'],
  composer: ['autor', 'texto', 'semIdentidade'],
  'proposal-card': ['titulo', 'estado', 'acao'],
  'status-bar': ['esquerda', 'conversas', 'direita'],
  menu: ['itens'],
  breadcrumbs: ['caminho', 'atual'],
  'identity-settings': ['semIdentidade'],
  'delete-thread-dialogs': ['texto'],
};
export const MIGRATIONS = [
  { from: 4, to: 5, steps: Object.entries(REMOVED).flatMap(([type, fields]) => fields.map((field) => ({ op: 'remove-field', type, field }))) },
];

// ---- Revisão 5b: Button alinhado por espaçadores; cada aba é uma marcação.
{
  const b = COMPONENTS.button.template;
  b.layout.justify = 'start';
  const CENTRO = { $not: eq('alinhamento', 'start') };
  const spacer = (name) => ({ type: 'rect', name, width: 'fill', height: 1, fill: C.none, visible: CENTRO });
  b.children = [spacer('respiro esquerdo'), ...b.children, spacer('respiro direito')];
}

COMPONENTS.tabs = base(
  'tabs',
  'Tabs',
  'Moldura das abas: a divisória color-border embaixo. Cada aba é uma marcação Aba.',
  { width: 240, height: 28 },
  { width: 40, height: 24 },
  { width: 240, height: 28 },
  { rotulo: 'Janela inferior' },
  fr('abas', { layout: NONE }, [{ type: 'rect', name: 'divisória', height: 1, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.border }]),
);
DOCS.tabs = `# Tabs

As abas de uma região (\`src/ui/controls/Tabs.tsx\`; \`BottomTabs\` na janela inferior). O desenho é a moldura: a divisória \`color-border\` embaixo. \`rotulo\` é o nome acessível do conjunto.

Cada aba é uma marcação **Aba** filha, com a largura que ela ocupa no app (nas abas normais, todas iguais, \`flex: 1\`; na janela inferior, a largura do texto com 2 px de respiro).
`;
EXTRA_FIELDS.tabs = [];
delete EXTRA_PARAMS.tabs;
EXTRA_NOTES.tabs = 'Cada aba (Aba) vira um TabItem em tabs (rotulo → label, selo → badge); a selecionada é o value.';

COMPONENTS.tab = base(
  'tab',
  'Aba',
  'Uma aba: o rótulo (color-text-muted; selecionada em color-text, peso 600, com o sublinhado de 2 px em color-accent) e o contador opcional.',
  { width: 100, height: 28 },
  { width: 24, height: 20 },
  { width: 100, height: 28 },
  { rotulo: 'Avisos', selecionada: 'não', selo: '', tamanho: 'md' },
  fr('aba', { layout: NONE }, [
    fr('conteúdo', { width: 'hug', height: 'hug', anchors: { centerX: true, centerY: true }, layout: { type: 'row', gap: 6, align: 'center' } }, [
      icon('ícone', sw('icone', ICONS, PLACEHOLDER_ICON), { $if: eq('selecionada', 'sim'), then: C.text, else: C.muted }, { visible: { $has: 'icone' } }),
      text(
        'rótulo',
        fieldText('rotulo', 'Aba'),
        { $if: eq('selecionada', 'sim'), then: C.text, else: C.muted },
        font({ $if: eq('tamanho', 'sm'), then: 12, else: 13 }, { $if: eq('selecionada', 'sim'), then: 600, else: 400 }, { $if: eq('tamanho', 'sm'), then: 16, else: 20 }),
        { visible: { $not: { $has: 'icone' } } },
      ),
      fr('selo', { width: 'hug', height: 16, cornerRadius: 999, fill: C.selectionMuted, visible: { $has: 'selo' }, layout: { type: 'row', padding: [0, 6], align: 'center' } }, [
        text('contador', fieldText('selo'), C.muted, font(12, 400, 16)),
      ]),
    ]),
    { type: 'rect', name: 'sublinhado', height: 2, anchors: { left: 0, right: 0, bottom: 0 }, fill: C.accent, visible: eq('selecionada', 'sim') },
  ]),
);
DOCS.tab = `# Aba

Uma aba do Tabs (\`.tab\` em \`src/theme/controls.css\`): 28 px, rótulo em \`color-text-muted\`; a selecionada em \`color-text\`, peso 600, com o sublinhado de 2 px em \`color-accent\`. \`selo\` é o contador (\`.tab-badge\`). Com \`icone\`, a aba mostra só o ícone (a aba Comentários da janela inferior) e o \`rotulo\` fica como nome acessível. \`tamanho\` \`sm\` é a aba da janela inferior (texto de 12 px).

Hover, pressionado, ícone, ponto de alerta e aba desabilitada não são desenhados.
`;
NEW_FIELDS.tab = [
  { key: 'rotulo', label: 'rótulo', type: 'string', required: true },
  { key: 'selecionada', label: 'selecionada', type: 'enum', options: ['sim', 'não'], default: 'não' },
  { key: 'selo', label: 'selo', type: 'string' },
  { key: 'tamanho', label: 'tamanho', type: 'enum', options: ['md', 'sm'], default: 'md' },
  { key: 'icone', label: 'ícone', type: 'string' },
];
MIGRATIONS[0].steps.push({ op: 'remove-field', type: 'tabs', field: 'abas' });

// ---- Revisão 5c: mínimos do tamanho real do app (o Segmented de modo tem 58 px; TextField e Select sm, 24 px).
const MIN = { text: [1, 1], icon: [8, 8], badge: [8, 8], avatar: [8, 8], box: [1, 1], 'text-field': [24, 20], select: [24, 20], segmented: [20, 16], 'icon-button': [12, 12], button: [12, 16], tab: [8, 12], tags: [16, 16], choice: [16, 16] };
for (const [id, [w, h]] of Object.entries(MIN)) COMPONENTS[id].minSize = { width: w, height: h };

const TYPE_NAMES = { 'thread-message': 'ThreadMessage', 'threads-section': 'ThreadsSection', composer: 'Composer', breadcrumbs: 'Breadcrumbs', 'identity-settings': 'IdentitySettings', 'delete-thread-dialogs': 'DeleteThreadDialogs' };
// ---- Revisão 5d: caber na largura real do app (a medida do canvas sai 1–2 px maior que a do DOM).
{
  // Button: o respiro vem dos espaçadores; o item de menu (start) tem 12 px à esquerda.
  const b = COMPONENTS.button.template;
  b.layout.padding = { $if: eq('alinhamento', 'start'), then: [0, 12], else: 0 };
  // IconButton com texto: centralizado, sem respiro fixo.
  COMPONENTS['icon-button'].template.children[0].layout.padding = 0;
  // Segmented: o item só com ícone tem 5 px de cada lado.
  COMPONENTS.segmented.template.children[0].template.layout.padding = { $if: { $has: 'icone' }, then: [0, 5], else: [0, 12] };
}
// Agrupadores: desenho transparente (sem ele, o canvas mostra o nome da marcação por cima dos filhos).
for (const id of ['thread-message', 'threads-section', 'composer', 'breadcrumbs', 'identity-settings', 'delete-thread-dialogs']) {
  COMPONENTS[id] = base(id, TYPE_NAMES[id], 'Agrupador: sem desenho próprio; os itens são marcações filhas.', { width: 200, height: 40 }, { width: 8, height: 8 }, { width: 200, height: 40 }, {}, fr('grupo', { layout: NONE }, []));
}


// ---- Revisão 5e: cada opção do Segmented é uma marcação; a dica do Choice quebra linha.
COMPONENTS.segmented = base(
  'segmented',
  'Segmented',
  'Moldura do controle segmentado: borda de controle e raio 4. Cada opção é uma marcação Opção.',
  { width: 200, height: 28 },
  { width: 20, height: 16 },
  { width: 200, height: 28 },
  { rotulo: 'Visão', desabilitado: 'não', invalido: 'não' },
  fr('segmented', {
    layout: NONE,
    cornerRadius: 4,
    opacity: disabledOpacity(),
    fill: C.surface,
    stroke: { color: { $if: eq('invalido', 'sim'), then: C.danger, else: C.control }, width: 1 },
  }, []),
);
DOCS.segmented = `# Segmented

Controle segmentado (\`src/ui/controls/Segmented.tsx\`): botões unidos numa borda só (\`color-border-control\`, raio 4). O desenho é a moldura; **cada opção é uma marcação Opção** filha, com a largura que tem no app (o texto com 12 px de cada lado, ou 28 px só com ícone).

- \`rotulo\`: o nome acessível do grupo (não aparece).
- \`invalido\`: borda \`color-danger\`; \`desabilitado\`: opacidade 0,45.
`;
EXTRA_FIELDS.segmented = [];
delete EXTRA_PARAMS.segmented;
EXTRA_NOTES.segmented = 'Cada opção (Opção) vira um SegmentedItem em items (rotulo → label, icone → icon); a selecionada é o value.';
delete EXAMPLES.segmented;
MIGRATIONS[0].steps.push({ op: 'remove-field', type: 'segmented', field: 'opcoes' });

COMPONENTS['segmented-item'] = base(
  'segmented-item',
  'Opção',
  'Uma opção do Segmented: o rótulo (ou só o ícone); a selecionada fica cheia de color-accent. A divisória da esquerda separa da opção anterior.',
  { width: 72, height: 28 },
  { width: 16, height: 16 },
  { width: 72, height: 28 },
  { rotulo: 'Atual', selecionada: 'não', icone: null },
  fr('opção', { layout: NONE, fill: { $if: eq('selecionada', 'sim'), then: C.accent, else: C.none } }, [
    { type: 'rect', name: 'divisória', width: 1, anchors: { left: 0, top: 0, bottom: 0 }, fill: C.control },
    icon('ícone', sw('icone', ICONS, PLACEHOLDER_ICON), { $if: eq('selecionada', 'sim'), then: C.accentText, else: C.text }, { visible: { $has: 'icone' }, anchors: { centerX: true, centerY: true } }),
    text('rótulo', fieldText('rotulo'), { $if: eq('selecionada', 'sim'), then: C.accentText, else: C.text }, font(13, 400, 20), { visible: { $not: { $has: 'icone' } }, anchors: { centerX: true, centerY: true } }),
  ]),
);
DOCS['segmented-item'] = `# Opção

Uma opção do Segmented (\`.segmented-item\` em \`src/theme/controls.css\`): 28 px, texto \`t-body\` com 12 px de cada lado; com \`icone\`, só o ícone num quadrado de 28 px (o \`rotulo\` vira nome acessível). A selecionada fica cheia de \`color-accent\` com o texto em \`color-accent-text\`. A divisória \`color-border-control\` da esquerda separa da opção anterior (na primeira, ela coincide com a borda do Segmented).
`;
NEW_FIELDS['segmented-item'] = [
  { key: 'rotulo', label: 'rótulo', type: 'string', required: true },
  { key: 'selecionada', label: 'selecionada', type: 'enum', options: ['sim', 'não'], default: 'não' },
  { key: 'icone', label: 'ícone', type: 'string' },
];

// Choice: o rótulo ocupa a largura e a dica quebra linha.
{
  const label = COMPONENTS.choice.template.children[2];
  label.width = 'fill';
  label.children[1].width = 'fill';
}

// ===========================================================================================
// Revisão 6 (v8, MCP 0.28.1): componente no formato 4, especialização 15. Cores, sombra e
// opacidade por token (claro e escuro de src/theme/tokens.ts); ícones no conjunto icons/icons.json
// (traço com ponta e canto redondos de verdade); fonte do tema pelos tokens font-sans/font-mono;
// texto de uma linha com reticências; pino em pixels de tela; agrupadores estruturais.
// ===========================================================================================

// ---- Conjunto de ícones: os traços de src/ui/icons.tsx (1,25, pontas e cantos redondos) e os pontos (raio 0,9).
export const ICON_SET = {
  format: 'mapping-icons',
  formatVersion: 1,
  viewBox: [16, 16],
  icons: Object.fromEntries(
    Object.entries(SHAPES).map(([name, shape]) => [
      name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      {
        paths: [
          ...shape.d.map((d) => ({ d: absoluteStart(d), fill: false, stroke: true, width: 1.25, cap: 'round', join: 'round' })),
          ...(shape.dots ?? []).map(([x, y]) => ({ d: circle(x, y, 0.9), fill: true })),
        ],
      },
    ]),
  ),
};
// O nome no conjunto segue [a-z0-9-_]: chevronDown vira chevron-down. O campo guarda a chave camelCase
// do app (é o que o código recebe), então o desenho converte com um $switch.
const ICON_KEY = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)]));
const iconNameOf = (d) => {
  if (typeof d === 'string') return ICON_KEY[STROKE_TO_NAME[d]] ?? 'reservado';
  if (d && d.$switch) {
    const cases = Object.fromEntries(Object.entries(d.cases).map(([k, v]) => [k, iconNameOf(v)]));
    const def = d.default === undefined ? undefined : iconNameOf(d.default);
    return { $switch: d.$switch, cases, ...(def && def !== 'reservado' ? { default: def } : {}) };
  }
  return d;
};
// O traço + pontas da Revisão 1 (frame com dois path) vira um nó icon do conjunto.
function toIconNode(frame) {
  const stroke = frame.children[0];
  const { type, name, layout, children, ...rest } = frame;
  return { type: 'icon', ...rest, name: iconNameOf(stroke.d), color: stroke.stroke.color, width: frame.width ?? 16, height: frame.height ?? 16 };
}
const isIconFrame = (n) => n?.type === 'frame' && n.children?.length === 2 && n.children[0].name === 'traço' && n.children[1].name === 'pontas';

// ---- Texto: a linha ocupa a marcação e não quebra; com reticencias, o que não cabe termina em "…"
// (text-overflow: ellipsis do app, que só corta quando o texto passa do conteúdo da caixa).
NEW_FIELDS.text.push({ key: 'reticencias', label: 'reticências', type: 'enum', options: ['não', 'sim'], default: 'não' });
{
  const t = COMPONENTS.text.template;
  const linha = t.children.find((c) => c.name === 'linha (left)');
  const para = t.children.find((c) => c.name === 'parágrafo');
  // Sem reticências, a linha é hug (o Konva, com largura fixa e wrap "none", tira a letra que passa da
  // caixa mesmo por 0,03 px): o recorte da raiz corta só o que sobra, como o overflow do app.
  const SEM = { $not: eq('reticencias', 'sim') };
  for (const c of t.children) if (c.name.startsWith('linha (')) c.visible = { $and: [c.visible, SEM] };
  t.children = [
    ...t.children.filter((c) => c.name.startsWith('linha (')),
    {
      type: 'text',
      name: 'linha com reticências',
      visible: { $and: [{ $not: eq('quebra', 'sim') }, eq('reticencias', 'sim')] },
      text: fieldText('texto', ''),
      color: corDe('cor'),
      font: { ...linha.font, align: sw('alinhamento', { center: 'center', right: 'right' }, 'left'), verticalAlign: 'middle', wrap: 'none', ellipsis: true },
      width: 'fill',
      height: 'fill',
    },
    para,
  ];
  COMPONENTS.text.description = 'Texto solto com um estilo de tipografia do DS (t-*) e uma cor dos tokens. Uma linha fica centralizada na altura e não quebra (com reticencias, termina em … quando não cabe); o parágrafo quebra na largura.';
  DOCS.text = DOCS.text.replace('o que passa da largura é recortado (o app põe reticências)', 'o que passa da largura é recortado ou, com `reticencias` `sim`, termina em "…" (o `text-overflow: ellipsis` do app: árvore, caminho, tabela, assunto da conversa). Dê à marcação a largura da caixa onde o app corta');
  COMPONENTS.text.preview.reticencias = 'não';
}

// ---- CommentPin: em pixels de tela (o pino do app tem 20 px em qualquer zoom), centrado na marcação.
COMPONENTS['comment-pin'] = base(
  'comment-pin',
  'CommentPin',
  'Pino de conversa: pílula de 20 px de tela com as iniciais e o número de mensagens, na cor do estado mais urgente; anel de selecionado, ponto de não lida e contorno tracejado de rascunho. Tamanho constante em qualquer zoom.',
  { width: 96, height: 28 },
  { width: 20, height: 20 },
  { width: 96, height: 28 },
  { estado: 'humano', rotulo: 'MA 3', selecionado: 'não', naoLida: 'não', rascunho: 'não' },
  fr('pino', { layout: { type: 'row', align: 'center', justify: 'center' } }, [
    fr('corpo', { width: 'hug', height: 20, layout: NONE }, [
      fr('pílula', {
        width: 'hug',
        height: 20,
        minWidth: 20,
        anchors: { left: 0, top: 0 },
        cornerRadius: 10,
        fill: sw('estado', { agente: PIN.agent, resolvida: PIN.resolved }, PIN.human),
        // O Konva traça pelo centro: o halo de 1 e, no selecionado, o anel de 2 no lugar dele.
        stroke: { color: { $if: YES('rascunho'), then: 'none', else: { $if: YES('selecionado'), then: PIN.select, else: PIN.halo } }, width: { $if: YES('selecionado'), then: 2, else: 1 }, align: 'center' },
        layout: { type: 'row', padding: [0, 8], align: 'center', justify: 'center' },
      }, [text('rótulo', fieldText('rotulo', 'MA 1'), PIN.text, font(11, 600, 16))]),
      // O rascunho (a conversa nova num ponto) é o anel de selecionado tracejado (dash não aceita expressão).
      { type: 'rect', name: 'rascunho', anchors: { left: 0, right: 0, top: 0, bottom: 0 }, cornerRadius: 10, fill: 'none', stroke: { color: PIN.select, width: 2, align: 'center', dash: [3, 2] }, visible: YES('rascunho') },
      { type: 'ellipse', name: 'não lida', width: 8, height: 8, anchors: { top: -4, right: -4 }, fill: PIN.unread, stroke: { color: PIN.halo, width: 1, align: 'center' }, visible: YES('naoLida') },
    ]),
  ]),
);
{
  const { template, preview, ...head } = COMPONENTS['comment-pin'];
  COMPONENTS['comment-pin'] = { ...head, screen: { anchor: 'center' }, preview, template };
}
DOCS['comment-pin'] = DOCS['comment-pin'].replace(
  'O pino real mede 20 px de tela e a largura cresce com o rótulo (7 px por caractere mais 16 de respiro); dê essa largura à marcação. O contorno de halo é aproximado em 1 px.',
  'Como o pino real, o desenho tem 20 px **de tela** em qualquer zoom, centrado no retângulo da marcação (a marcação só diz onde). A largura é a do rótulo com 8 px de respiro de cada lado; o app usa 7 px por caractere mais 16, então um rótulo de 4 caracteres sai cerca de 5 px mais estreito. O halo é o traço de 1 px pelo centro, como no Konva.',
);

// ---- Agrupadores: tipos estruturais (sem desenho; a app não escreve o nome por cima dos filhos).
export const STRUCTURAL = ['thread-message', 'threads-section', 'composer', 'breadcrumbs', 'identity-settings', 'delete-thread-dialogs'];
for (const id of STRUCTURAL) delete COMPONENTS[id];

// ---- Revisão 7 (v9): os grupos de componentes desenhados à parte (v9/<grupo>/lib.mjs, uma função
// build(h) que devolve { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL }). GROUPS=a,b limita os grupos
// (cada subagente gera o pacote só com o dele); sem GROUPS, entram todos os que existem.
export const HELPERS = {
  C, C_LIGHT, tok, eq, sw, fr, text, font, fieldText, base, NONE, YES, SHADOW_POPUP, OPACITY_DISABLED, ESTILOS, COR, corDe,
  ICON_KEY,
  // Nó de ícone do conjunto: name é a chave do app (camelCase), literal ou expressão.
  iconNode: (name, color, extra = {}) => ({ type: 'icon', name: typeof name === 'string' ? ICON_KEY[name] ?? name : name, color, width: 16, height: 16, ...extra }),
  // O nome do conjunto a partir de um campo com a chave do app (camelCase).
  iconFromField: (key, def) => ({ $switch: key, cases: ICON_KEY, ...(def ? { default: ICON_KEY[def] ?? def } : {}) }),
};
{
  const { existsSync } = await import('node:fs');
  const dir = new URL('./v9/', import.meta.url);
  const all = existsSync(dir) ? (await import('node:fs')).readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  const wanted = process.env.GROUPS ? process.env.GROUPS.split(',').filter(Boolean) : all;
  for (const g of wanted) {
    const file = new URL(`./v9/${g}/lib.mjs`, import.meta.url);
    if (!existsSync(file)) continue;
    const out = (await import(file.href)).build(HELPERS);
    for (const [id, c] of Object.entries(out.COMPONENTS ?? {})) COMPONENTS[id] = c;
    Object.assign(DOCS, out.DOCS ?? {});
    Object.assign(EXAMPLES, out.EXAMPLES ?? {});
    for (const [id, fields] of Object.entries(out.NEW_FIELDS ?? {})) NEW_FIELDS[id] = [...(NEW_FIELDS[id] ?? []), ...fields];
    for (const id of out.STRUCTURAL ?? []) {
      STRUCTURAL.push(id);
      delete COMPONENTS[id];
    }
  }
}

// ---- Revisão 7b: o Button mostra o ícone do app antes do texto (✓ ✕ da revisão, os botões da barra), e o
// Ícone ocupa a marcação (o app tem ícones de 12 e de 16 px).
NEW_FIELDS.button.push({ key: 'icone', label: 'ícone', type: 'string', suggestions: ICON_NAMES });
{
  const kids = COMPONENTS.button.template.children;
  const label = kids.findIndex((k) => k.name === 'texto');
  kids.splice(label, 0, { type: 'icon', name: HELPERS.iconFromField('icone'), color: kids[label].color, width: 16, height: 16, visible: { $has: 'icone' } });
  COMPONENTS.button.preview.icone = null;
  DOCS.button = DOCS.button.replace('O texto é o filho', 'Com `icone` (a chave do ícone em `src/ui/icons.tsx`), o ícone de 16 px vem antes do texto, na cor dele. O texto é o filho');
}
// Choice sem rótulo à vista (a caixa de mostrar a camada): o rótulo continua campo (é o nome acessível).
(NEW_FIELDS.choice ??= []).push({ key: 'rotuloVisivel', label: 'rótulo à vista', type: 'enum', options: ['sim', 'não'], default: 'sim' });
{
  const label = COMPONENTS.choice.template.children[2];
  label.visible = label.visible ? { $and: [label.visible, { $not: eq('rotuloVisivel', 'não') }] } : { $not: eq('rotuloVisivel', 'não') };
  COMPONENTS.choice.preview.rotuloVisivel = 'sim';
  DOCS.choice += '\nCom `rotuloVisivel` `não` só a caixa aparece (o rótulo fica como nome acessível), como na caixa de mostrar a camada.\n';
}
COMPONENTS.icon.template.children = [{ type: 'icon', name: HELPERS.iconFromField('icone'), color: corDe('cor'), width: 'fill', height: 'fill' }];
COMPONENTS.icon.minSize = { width: 8, height: 8 };

// ---- Passada final: formato 4, ícones do conjunto e fonte do tema.
function v4(node) {
  if (Array.isArray(node)) return node.map(v4);
  if (!node || typeof node !== 'object') return node;
  if (isIconFrame(node)) return toIconNode(node);
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = v4(v);
  if (out.font && typeof out.font === 'object') {
    const f = out.font;
    if (f.family === FONT_SANS) delete f.family;
    else if (f.family === FONT_MONO) f.family = tok('font-mono');
    else if (f.family?.$if && f.family.then === FONT_MONO && f.family.else === FONT_SANS) f.family = { $if: f.family.$if, then: tok('font-mono'), else: tok('font-sans') };
  }
  return out;
}
for (const [id, c] of Object.entries(COMPONENTS)) COMPONENTS[id] = { ...c, formatVersion: 4, template: v4(c.template) };

// ---- Tokens da especialização: as cores, a sombra e a opacidade do tema (src/theme/tokens.ts).
export function themeTokens() {
  const src = readFileSync(`${REPO}/src/theme/tokens.ts`, 'utf8');
  const block = src.slice(src.indexOf('const COLORS'), src.indexOf('...Object.fromEntries(', src.indexOf('const COLORS')));
  const raw = {};
  for (const m of block.matchAll(/'([a-z0-9-]+)':\s*(\{\s*light:\s*'([^']+)',\s*dark:\s*'([^']+)'\s*\}|'([^']+)')/g)) raw[m[1]] = m[5] ?? { light: m[3], dark: m[4] };
  const resolve = (v) => (typeof v === 'string' && v.startsWith('var(--') ? resolve(raw[v.slice(6, -1)]) : v);
  const values = {};
  for (const [k, v] of Object.entries(raw)) values[k] = resolve(v);
  const shadow = /'shadow-popup':\s*\{\s*light:\s*'[^']*?(rgba\([^)]+\))',\s*dark:\s*'[^']*?(rgba\([^)]+\))'/.exec(src);
  values['shadow-popup-color'] = { light: shadow[1], dark: shadow[2] };
  values['opacity-disabled'] = Number(/'opacity-disabled':\s*'([\d.]+)'/.exec(src)[1]);
  return { modes: ['light', 'dark'], values };
}

export function applyLibrary(T, json, write) {
  for (const t of T) {
    const component = COMPONENTS[t.id];
    if (!component && !DOCS[t.id]) continue;
    t.fields = FIELD_OVERRIDE[t.id] ?? [...(t.fields ?? []), ...(EXTRA_FIELDS[t.id] ?? []), ...(NEW_FIELDS[t.id] ?? [])];
    if (EXTRA_PARAMS[t.id]) t.params = { ...(t.params ?? {}), ...EXTRA_PARAMS[t.id] };
    if (EXTRA_VALUES[t.id]) t.values = { ...(t.values ?? {}), ...EXTRA_VALUES[t.id] };
    if (EXTRA_NOTES[t.id]) t.notes = [t.notes, EXTRA_NOTES[t.id]].filter(Boolean).join(' ');
    if (t.id === 'icon-button' || t.id === 'icon') {
      t.fields = t.fields.map((f) => (f.key === 'icone' ? { ...f, suggestions: ICON_NAMES } : f));
    }
    if (component) {
      t.component = `components/${t.id}.json`;
      json(`components/${t.id}.json`, component);
    } else {
      delete t.component;
    }
    if (STRUCTURAL.includes(t.id)) t.structural = true;
    t.doc = `docs/${t.id}.md`;
    write(`docs/${t.id}.md`, DOCS[t.id]);
    if (EXAMPLES[t.id]) t.examples = EXAMPLES[t.id];
  }
  return Object.keys(COMPONENTS);
}
