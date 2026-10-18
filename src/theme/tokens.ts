/**
 * Tokens de design: fonte única do tema (docs/redesign/HANDOFF.md, seção 2).
 *
 * `renderTokensCss()` gera o CSS que o plugin do Vite entrega como `virtual:tokens.css`
 * (vite.config.ts). O bloco escuro existe uma vez só aqui e é emitido nos dois seletores
 * que o CSS precisa (`prefers-color-scheme` e `data-theme='dark'`).
 *
 * Nomes: `color-bg` vira `--color-bg`; `space-0-5` é o `space-0.5` do DS (o ponto não
 * é válido em nome de variável CSS).
 */
import { BREAKPOINTS } from './breakpoints';

export interface Themed {
  readonly light: string;
  readonly dark: string;
}

export type TokenValue = string | Themed;

function isThemed(value: TokenValue): value is Themed {
  return typeof value !== 'string';
}

/** Paleta padrão das camadas, em ordem. É dado do projeto: `src/model/layers.ts` a espelha. */
export const LAYER_COLORS: readonly string[] = [
  '#d32f2f',
  '#1e88e5',
  '#2e7d32',
  '#e65100',
  '#7e57c2',
  '#a07800',
  '#00838f',
  '#d81b60',
  '#8d6e63',
  '#607d8b',
];

const COLORS: Readonly<Record<string, TokenValue>> = {
  'color-bg': { light: '#f6f7f9', dark: '#12151a' },
  'color-surface': { light: '#ffffff', dark: '#1c2027' },
  'color-hover': { light: '#eef1f4', dark: '#262b33' },
  'color-pressed': { light: '#e3e7ec', dark: '#2f353f' },
  'color-canvas-bg': { light: '#e4e7eb', dark: '#0b0d11' },
  /** Só divisória. O limite de controle é `color-border-control`. */
  'color-border': { light: '#dfe3e8', dark: '#2c323b' },
  'color-border-control': { light: '#7d8590', dark: '#6b7480' },
  'color-text': { light: '#1b1f24', dark: '#e8eaed' },
  'color-text-muted': { light: '#5b6470', dark: '#9aa3ad' },
  'color-accent': { light: '#1a63cc', dark: '#5b9bff' },
  'color-accent-hover': { light: '#1757b5', dark: '#7aaeff' },
  'color-accent-pressed': { light: '#134a99', dark: '#9cc3ff' },
  'color-accent-text': { light: '#ffffff', dark: '#0b1220' },
  'color-focus': 'var(--color-accent)',
  'color-selection': { light: '#dce8fb', dark: '#1f3354' },
  'color-selection-muted': { light: '#eceff3', dark: '#2a2f38' },
  'color-danger': { light: '#c62828', dark: '#ff8a80' },
  'color-danger-bg': { light: '#fdecea', dark: '#3b1d1d' },
  'color-warning': { light: '#8a5a00', dark: '#ffd27a' },
  'color-warning-bg': { light: '#fff4d6', dark: '#3a2f14' },
  'color-success': { light: '#1e7a46', dark: '#7ad3a0' },
  'color-success-bg': { light: '#e3f4ea', dark: '#163325' },
  'color-backdrop': { light: 'rgba(0, 0, 0, 0.45)', dark: 'rgba(0, 0, 0, 0.6)' },
  'color-tooltip': { light: '#1b1f24', dark: '#e8eaed' },
  'color-tooltip-text': { light: '#ffffff', dark: '#12151a' },
  'color-card': { light: 'rgba(255, 255, 255, 0.92)', dark: 'rgba(28, 32, 39, 0.92)' },
  // Canvas: iguais nos dois temas, porque ficam sobre a imagem.
  'cv-line': '#ffffff',
  'cv-halo': 'rgba(10, 12, 16, 0.72)',
  'cv-select': '#4d8dff',
  'cv-invalid': '#ff6b6b',
  'cv-warning': '#ffc247',
  'cv-name-tag': 'var(--cv-select)',
  /** Texto da etiqueta do nome (≥ 4,5:1 sobre `cv-name-tag`); não está no DS 2.0. */
  'cv-name-tag-text': '#0b1220',
  /** Emblema do cadeado sobre a imagem: fundo e traço (mesmo par da etiqueta do nome). */
  'cv-lock': 'var(--cv-name-tag)',
  'cv-lock-glyph': 'var(--cv-name-tag-text)',
  /**
   * Fundo do selo de tipo de mudança sobre a foto (revisão de propostas, etapa 4): mais
   * opaco que `cv-halo` para o `cv-invalid` passar de 3:1 sobre foto branca.
   */
  'cv-badge': 'rgba(10, 12, 16, 0.9)',
  /**
   * Desenho dos componentes (B3): reservado de imagem e seu contorno (cinza neutro, legível sobre
   * fundos claros e escuros) e a caixa de um nó que o desenho não conhece. Ficam sobre a tela
   * em branco ou a foto: iguais nos dois temas.
   */
  'cv-component-placeholder': 'rgba(128, 128, 128, 0.25)',
  'cv-component-placeholder-line': 'rgba(128, 128, 128, 0.8)',
  'cv-component-unknown': '#d81b60',
  ...Object.fromEntries(
    LAYER_COLORS.map((c, i) => [`layer-${String(i + 1).padStart(2, '0')}`, c]),
  ),
};

const FONTS: Readonly<Record<string, string>> = {
  'font-sans':
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  'font-mono': 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
};

interface TextStyle {
  readonly name: string;
  readonly size: number;
  readonly line: number;
  readonly weight: number;
  readonly family?: 'mono';
  /** Também emite `--t-<name>-size|line|weight` (o Konva não lê o atalho `font`). */
  readonly parts?: true;
}

const TEXT_STYLES: readonly TextStyle[] = [
  { name: 't-display', size: 20, line: 28, weight: 600 },
  { name: 't-title', size: 15, line: 22, weight: 600 },
  { name: 't-heading', size: 13, line: 20, weight: 600 },
  { name: 't-body', size: 13, line: 20, weight: 400 },
  { name: 't-body-strong', size: 13, line: 20, weight: 600 },
  { name: 't-small', size: 12, line: 16, weight: 400 },
  { name: 't-label', size: 12, line: 16, weight: 400 },
  { name: 't-micro', size: 11, line: 16, weight: 600 },
  { name: 't-cv-name', size: 11, line: 16, weight: 600, parts: true },
  { name: 't-cv-image', size: 12, line: 16, weight: 600, parts: true },
  { name: 't-cv-card', size: 11, line: 15, weight: 400, parts: true },
  { name: 't-cv-caption', size: 10, line: 14, weight: 400, parts: true },
  { name: 't-code', size: 12, line: 18, weight: 400, family: 'mono' },
  { name: 't-kbd', size: 11, line: 16, weight: 400 },
];

/**
 * Papéis da interface: alias para a escala `t-*` e os tamanhos de controle (28px). O CSS
 * dos componentes usa só os papéis, nunca a escala direta.
 */
const ROLES: Readonly<Record<string, string>> = {
  't-text': 't-body',
  't-text-small': 't-small',
  't-text-heading': 't-heading',
  't-text-title': 't-title',
  't-text-input': 't-body',
  /** Altura de Button, TextField, Select, Segmented e IconButton. */
  'control-height': 'size-control-lg',
  /** Altura dos controles compactos (`size="sm"`). */
  'control-height-sm': 'size-control',
  'control-radius': 'radius-sm',
  /** Lado do ícone. */
  'control-icon': 'size-icon',
  /** Lado da caixa de seleção e do rádio. */
  'control-check': 'size-icon',
  /** Altura de uma linha de árvore ou de lista (TreeRow). */
  'row-height': 'size-row',
};

const SCALES: Readonly<Record<string, TokenValue>> = {
  // Espaço
  'space-0-5': '2px',
  'space-1': '4px',
  'space-1-5': '6px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-6': '24px',
  'space-8': '32px',
  // Raio
  'radius-xs': '2px',
  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '8px',
  'radius-xl': '12px',
  'radius-full': '999px',
  // Sombras
  'shadow-popup': {
    light: '0 8px 24px rgba(16, 24, 40, 0.18)',
    dark: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  // Tamanhos
  'size-touch': '44px',
  'size-target-min': '24px',
  'size-control': '24px',
  'size-control-lg': '28px',
  'size-row': '28px',
  'size-toolbar': '40px',
  'size-tw-header': '32px',
  'size-statusbar': '26px',
  'size-stripe': '40px',
  'size-icon': '16px',
  'size-handle': '10px',
  /** Emblema do cadeado no canvas (px de tela). */
  'size-lock-badge': '20px',
  'size-tw-left': '264px',
  'size-tw-right': '360px',
  'size-tw-bottom': '208px',
  'size-tw-layers': '224px',
  /** Altura inicial da janela inferior em modo revisão (filtros, ~9 linhas e o rodapé de atalhos). */
  'size-tw-bottom-review': '344px',
  /**
   * Colunas de resumo da revisão (decisão 8 do HANDOFF-PROPOSALS): o resumo das linhas
   * dos níveis (`ReviewRow`) e as contagens da lista de propostas (`ProposalRow`). As
   * colunas de ação são derivadas do tamanho dos controles.
   */
  'size-review-col-name-min': '208px',
  'size-review-col-summary': '232px',
  'size-proposal-col-counts': '236px',
  /** Largura mínima da app (só desktop): abaixo dela, o aviso "Abra numa janela maior". */
  'size-app-min': `${BREAKPOINTS.appMin}px`,
  'size-canvas-min': '320px',
  'size-resize-hit': '8px',
  'size-label-col': '92px',
  'size-dialog': '480px',
  'size-dialog-md': '560px',
  'size-dialog-lg': '820px',
  'size-dialog-lg-height': '640px',
  'size-help-nav': '200px',
  'size-home-side': '240px',
  'size-home-main': '960px',
  /** Seletor de referência (popup no topo, B14). */
  'size-picker': '600px',
  /**
   * Popover de uma mudança nos Detalhes da revisão (`ChangePopover`, HANDOFF-REVIEW-DETAILS
   * 3.1): cabe na janela Detalhes na largura inicial e dá para as três linhas do conflito.
   */
  'size-change-popover': '320px',
  // Opacidades
  'opacity-disabled': '0.45',
  'opacity-dimmed': '0.35',
  'opacity-ancestor': '0.75',
  'opacity-inherited': '0.7',
  'opacity-hidden-layer': '0.6',
  'opacity-card': '0.92',
  /** Retângulo da vista no minimapa. */
  'opacity-grabbed': '0.25',
  'opacity-halo': '0.72',
  // Movimento
  'duration-instant': '0ms',
  'duration-fast': '100ms',
  'duration-base': '160ms',
  'duration-slow': '240ms',
  /**
   * Atraso para abrir o popover de uma mudança pelo hover (HANDOFF-REVIEW-DETAILS 3.1):
   * pede intenção, senão percorrer o painel abriria um popover por linha.
   */
  'duration-hover-intent': '300ms',
  'easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  // Camadas de empilhamento
  'z-canvas': '0',
  'z-canvas-overlay': '10',
  'z-toolwindow': '20',
  'z-popover': '40',
  'z-tooltip': '50',
  'z-picker': '60',
  'z-dialog': '70',
  'z-banner': '80',
  // Breakpoints (só documentação: media queries usam `breakpoints.ts`)
  'bp-compact': `${BREAKPOINTS.compact}px`,
  'bp-design': `${BREAKPOINTS.design}px`,
};

function fontFamily(style: TextStyle): string {
  return style.family === 'mono' ? 'var(--font-mono)' : 'var(--font-sans)';
}

function textTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of TEXT_STYLES) {
    out[s.name] = `${s.weight} ${s.size}px/${s.line}px ${fontFamily(s)}`;
    if (s.parts) {
      out[`${s.name}-size`] = `${s.size}px`;
      out[`${s.name}-line`] = `${s.line}px`;
      out[`${s.name}-weight`] = String(s.weight);
    }
  }
  return out;
}

/** Todos os tokens por nome (sem o `--`), na ordem em que o CSS é emitido. */
export const TOKENS: Readonly<Record<string, TokenValue>> = {
  ...COLORS,
  ...FONTS,
  ...textTokens(),
  ...Object.fromEntries(
    Object.entries(ROLES).map(([role, target]) => [role, `var(--${target})`]),
  ),
  ...SCALES,
};

/** Valor de um token num tema (tokens sem variação valem igual nos dois). */
export function tokenValue(name: string, theme: 'light' | 'dark'): string {
  const value = TOKENS[name];
  if (value === undefined) throw new Error(`Token desconhecido: ${name}`);
  return isThemed(value) ? value[theme] : value;
}

function declarations(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([name, value]) => `    --${name}: ${value};`).join('\n');
}

/** CSS de `:root` (e dos temas) gerado a partir de `TOKENS`. */
export function renderTokensCss(): string {
  const all = Object.entries(TOKENS);
  const light = all.map(([name, v]) => [name, isThemed(v) ? v.light : v] as const);
  const dark = all.flatMap(([name, v]) => (isThemed(v) ? [[name, v.dark] as const] : []));
  const indent = (block: string) => block.replaceAll(/^ {4}/gm, '  ');

  return [
    '/* Gerado por src/theme/tokens.ts (renderTokensCss). Não edite. */',
    ':root {',
    '  color-scheme: light;',
    indent(declarations(light)),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    '    color-scheme: dark;',
    declarations(dark),
    '  }',
    '}',
    '',
    ":root[data-theme='dark'] {",
    '  color-scheme: dark;',
    indent(declarations(dark)),
    '}',
    '',
  ].join('\n');
}
