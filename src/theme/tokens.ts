/**
 * Design tokens: single source of the theme (design system: docs/DESIGN-SYSTEM.md).
 *
 * `renderTokensCss()` generates the CSS that the Vite plugin delivers as `virtual:tokens.css`
 * (vite.config.ts). The dark block exists only once here and is emitted in the two selectors
 * the CSS needs (`prefers-color-scheme` and `data-theme='dark'`).
 *
 * Names: `color-bg` becomes `--color-bg`; `space-0-5` is the DS's `space-0.5` (the dot is not
 * valid in a CSS variable name).
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

/** Alpha of the card (`color-card`, `opacity-card`) and of the halo (`cv-halo`, `opacity-halo`): a single source for the color and the opacity. */
const CARD_ALPHA = 0.92;
const HALO_ALPHA = 0.72;

/** Default palette of the layers, in order. It is project data: `src/model/layers.ts` mirrors it. */
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
  /** Divider only. The control border is `color-border-control`. */
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
  /**
   * Thread state badge (Comments window and the Threads section of Details): text and background per
   * state, of the same hue as the state's `cv-pin-*` (orange = waiting on you, cyan = waiting on the
   * agent, gray = resolved), darkened in light and lightened in dark so the text passes 4.5:1
   * over the background. The canvas pin (`cv-pin-*`) does not change.
   */
  'color-thread-human': { light: '#84590b', dark: '#f0b242' },
  'color-thread-human-bg': { light: '#fcf2de', dark: '#413215' },
  'color-thread-agent': { light: '#136c5e', dark: '#52e0ca' },
  'color-thread-agent-bg': { light: '#e1faf6', dark: '#193e38' },
  'color-thread-resolved': { light: '#4f5e72', dark: '#9fabbc' },
  'color-thread-resolved-bg': { light: '#eaedf0', dark: '#272b30' },
  'color-backdrop': { light: 'rgba(0, 0, 0, 0.45)', dark: 'rgba(0, 0, 0, 0.6)' },
  'color-tooltip': { light: '#1b1f24', dark: '#e8eaed' },
  'color-tooltip-text': { light: '#ffffff', dark: '#12151a' },
  'color-card': {
    light: `rgba(255, 255, 255, ${CARD_ALPHA})`,
    dark: `rgba(28, 32, 39, ${CARD_ALPHA})`,
  },
  // Canvas: the same in both themes, because they sit over the image.
  'cv-line': '#ffffff',
  'cv-halo': `rgba(10, 12, 16, ${HALO_ALPHA})`,
  'cv-select': '#4d8dff',
  /**
   * Fill of the selection rectangle (Shift+drag): the translucent blue of `cv-select`, the same
   * in both themes (it sits over the image and the canvas background).
   */
  'cv-select-fill': 'rgba(77, 141, 255, 0.15)',
  /**
   * Outline of the selected items that are not the primary (multi-select, ME2): the same blue
   * as the selection, more discreet than it. It sits over the canvas background and over photos: it passes
   * 3:1 over `color-canvas-bg` in both themes.
   */
  'cv-select-secondary': { light: '#2b6ad9', dark: '#8fb4ff' },
  'cv-invalid': '#ff6b6b',
  'cv-warning': '#ffc247',
  /**
   * Dashed border of the canvas marking (v13). It sits over the canvas background and over
   * photos: a violet that passes 3:1 over `color-canvas-bg` in both themes.
   */
  'cv-canvas-marking': { light: '#5a3fc0', dark: '#b9a8ff' },
  /**
   * Absorption highlight (when drawing or resizing, what will be wrapped on release):
   * translucent stroke and fill, the same in both themes (the green passes 3:1 over
   * light and dark `color-canvas-bg`).
   */
  'cv-absorb': '#0a8a5c',
  'cv-absorb-fill': 'rgba(10, 138, 92, 0.2)',
  /**
   * Arrow (v13, ME4): the stroke, over the canvas background and photos (with the `cv-halo` halo outside).
   * A teal that passes 3:1 over `color-canvas-bg` in both themes and is not confused with the
   * selection (blue) nor with the canvas marking border (violet).
   */
  'cv-arrow': { light: '#0f766e', dark: '#5eead4' },
  /** Selected arrow: the selection blue. */
  'cv-arrow-select': 'var(--cv-select)',
  /** Arrow label (the `name`): text and background, those of the theme's card. */
  'cv-arrow-label': 'var(--color-text)',
  'cv-arrow-label-bg': 'var(--color-card)',
  'cv-name-tag': 'var(--cv-select)',
  /** Name tag text (≥ 4.5:1 over `cv-name-tag`); it is not in DS 2.0. */
  'cv-name-tag-text': '#0b1220',
  /** Lock badge over the image: background and stroke (same pair as the name tag). */
  'cv-lock': 'var(--cv-name-tag)',
  'cv-lock-glyph': 'var(--cv-name-tag-text)',
  /**
   * Background of the change-type badge over the photo (proposal review, stage 4): more
   * opaque than `cv-halo` so `cv-invalid` passes 3:1 over a white photo.
   */
  'cv-badge': 'rgba(10, 12, 16, 0.9)',
  /**
   * Thread pin (Comments stage, CM4): one background per state (waiting on human, waiting on
   * agent, resolved), the text, the outline, the selected ring and the unread dot. They sit
   * over the photo: the same in both themes, and the dark text passes 4.5:1 over the three backgrounds.
   */
  'cv-pin-human': '#ffb020',
  'cv-pin-agent': '#5eead4',
  'cv-pin-resolved': '#b4bcc7',
  'cv-pin-text': '#0b1220',
  'cv-pin-halo': 'var(--cv-halo)',
  'cv-pin-selected': 'var(--cv-select)',
  'cv-pin-unread': 'var(--cv-invalid)',
  /**
   * Component drawing (B3): image placeholder and its outline (neutral gray, legible over
   * light and dark backgrounds) and the box of a node the drawing does not know. They sit over the blank
   * canvas or the photo: the same in both themes.
   */
  'cv-component-placeholder': 'rgba(128, 128, 128, 0.25)',
  'cv-component-placeholder-line': 'rgba(128, 128, 128, 0.8)',
  'cv-component-unknown': '#d81b60',
  /** Fill of the box of an instance whose type has no component or does not exist (the outline and the text are `cv-component-unknown`). */
  'cv-component-unknown-fill': 'rgba(216, 27, 96, 0.06)',
  // Mirror of the DS, unused in the code: the `layer-NN` colors come from `LAYER_COLORS` (the layer code uses the palette of `src/model/layers.ts`).
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
  /** Also emits `--t-<name>-size|line|weight` (Konva does not read the `font` shorthand). */
  readonly parts?: true;
}

const TEXT_STYLES: readonly TextStyle[] = [
  { name: 't-display', size: 20, line: 28, weight: 600 },
  { name: 't-title', size: 15, line: 22, weight: 600 },
  { name: 't-heading', size: 13, line: 20, weight: 600 },
  { name: 't-body', size: 13, line: 20, weight: 400 },
  { name: 't-body-strong', size: 13, line: 20, weight: 600 },
  { name: 't-small', size: 12, line: 16, weight: 400 },
  // Mirror of the DS, unused in the code.
  { name: 't-label', size: 12, line: 16, weight: 400 },
  { name: 't-micro', size: 11, line: 16, weight: 600 },
  { name: 't-cv-name', size: 11, line: 16, weight: 600, parts: true },
  { name: 't-cv-image', size: 12, line: 16, weight: 600, parts: true },
  { name: 't-code', size: 12, line: 18, weight: 400, family: 'mono' },
  { name: 't-kbd', size: 11, line: 16, weight: 400 },
];

/**
 * Interface roles: aliases for the `t-*` scale and the control sizes (28px). The components' CSS
 * uses only the roles, never the scale directly.
 */
const ROLES: Readonly<Record<string, string>> = {
  't-text': 't-body',
  't-text-small': 't-small',
  't-text-heading': 't-heading',
  't-text-title': 't-title',
  't-text-input': 't-body',
  /** Height of Button, TextField, Select, Segmented and IconButton. */
  'control-height': 'size-control-lg',
  /** Height of compact controls (`size="sm"`). */
  'control-height-sm': 'size-control',
  'control-radius': 'radius-sm',
  /** Icon side. */
  'control-icon': 'size-icon',
  /** Side of the checkbox and the radio. */
  'control-check': 'size-icon',
  /** Height of a tree or list row (TreeRow). */
  'row-height': 'size-row',
};

const SCALES: Readonly<Record<string, TokenValue>> = {
  // Space
  'space-0-5': '2px',
  /** Fine breathing room of a label (`code`, `kbd`, marker) of the interactive guide. */
  'space-px': '1px',
  'space-1': '4px',
  'space-1-5': '6px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-6': '24px',
  'space-8': '32px',
  // Radius
  'radius-xs': '2px',
  'radius-sm': '4px',
  'radius-md': '6px',
  'radius-lg': '8px',
  // Mirror of the DS, unused in the code.
  'radius-xl': '12px',
  'radius-full': '999px',
  // Shadows
  'shadow-popup': {
    light: '0 8px 24px rgba(16, 24, 40, 0.18)',
    dark: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  // Sizes
  'size-touch': '44px',
  'size-target-min': '24px',
  'size-control': '24px',
  'size-control-lg': '28px',
  'size-row': '28px',
  'size-toolbar': '40px',
  'size-tw-header': '32px',
  'size-statusbar': '26px',
  'size-stripe': '40px',
  /** Color bar at the left of an annotation in the interactive guide. */
  'size-accent-bar': '4px',
  'size-icon': '16px',
  'size-handle': '10px',
  /** Lock badge on the canvas (screen px). */
  'size-lock-badge': '20px',
  /** Thread pin on the canvas (screen px): height, side padding, state glyph and gap between the glyph and the label. The width is estimated: `size-cv-pin-char` per label letter. */
  'size-cv-pin-height': '20px',
  'size-cv-pin-pad': '8px',
  'size-cv-pin-glyph': '12px',
  'size-cv-pin-glyph-gap': '2px',
  'size-cv-pin-char': '7px',
  /** "Came from <name>" badge on the canvas (screen px): height, side padding, gap to the root corner (and, below a small root, `gap-below`), band of the container name that the badge avoids and estimated width per letter. */
  'size-cv-arrival-height': '20px',
  'size-cv-arrival-pad': '8px',
  'size-cv-arrival-gap': '4px',
  'size-cv-arrival-gap-below': '10px',
  'size-cv-arrival-name-band': '24px',
  'size-cv-arrival-char': '7px',
  /** Canvas level of detail: a marking smaller than this on screen (width or height) draws only the border (no halo, double line, badge or ⚠). */
  'size-lod-min-marking': '24px',
  /** Canvas level of detail: a marking smaller than this on screen in both measures is not drawn. */
  'size-lod-hide-marking': '2px',
  /** Arrow on the canvas (screen px, constant with the zoom): stroke, selected stroke and tip. */
  'size-arrow-stroke': '2px',
  'size-arrow-stroke-selected': '3px',
  'size-arrow-head': '10px',
  /** Maximum box of the minimap (width and height, px): the content fits in it, in proportion. */
  'size-minimap-width': '132px',
  'size-minimap-height': '96px',
  'size-tw-left': '264px',
  'size-tw-right': '360px',
  /** Initial height of the bottom window: 4 whole rows of the Comments list, with filters and header, at 900 × 720 (decision 6 of #734). Measured: the list gains 1 px per window px and 357 px give 148 px (4 × 37 px); 360 px fit in 60% of the editor body at 900 × 720 (`BOTTOM_MAX_FRACTION`). With the narrow layout's filters on two lines (CL3) the list has 207 px, 4 whole rows even with broken anchors (37 + 3 × 53 px); the token does not go up: 360 px is the 60% ceiling. */
  'size-tw-bottom': '360px',
  'size-tw-layers': '224px',
  /** Initial height of the bottom window in review mode (collapsed filters, 3 whole list rows and the shortcut footer at 900 px wide). */
  'size-tw-bottom-review': '240px',
  /**
   * Review summary columns (decision 8 of HANDOFF-PROPOSALS): the summary of the level
   * rows (`ReviewRow`) and the counts of the proposal list (`ProposalRow`). The
   * action columns are derived from the size of the controls.
   */
  'size-review-col-name-min': '194px',
  'size-review-col-summary': '232px',
  'size-proposal-col-counts': '236px',
  /** Minimum width of the app (desktop only): below it, the "Open in a larger window" notice. */
  'size-app-min': `${BREAKPOINTS.appMin}px`,
  /** Minimum height of the app (desktop only): below it the notice applies too. */
  'size-app-min-height': `${BREAKPOINTS.appMinHeight}px`,
  'size-canvas-min': '360px',
  'size-resize-hit': '8px',
  'size-label-col': '92px',
  /** Minimum width of a value column in the table (DataGrid); above that the table scrolls. */
  'size-grid-col-min': '96px',
  'size-dialog': '480px',
  'size-dialog-md': '560px',
  'size-dialog-lg': '820px',
  'size-dialog-lg-height': '640px',
  'size-help-nav': '200px',
  'size-home-side': '240px',
  'size-home-main': '960px',
  /** Reference picker (popup at the top, B14). */
  'size-picker': '600px',
  /** Reference picker of a table cell (compact version). */
  'size-picker-compact': '420px',
  /**
   * Popover of a change in the review Details (`ChangePopover`, HANDOFF-REVIEW-DETAILS
   * 3.1): fits in the Details window at the initial width and leaves room for the three conflict rows.
   */
  'size-change-popover': '320px',
  /** "Show on canvas" panel of view mode (`ViewModePanel`). */
  'size-view-panel': '280px',
  // Opacities
  /** Fill of a marking of the interactive guide, and that of the selected one. */
  'opacity-mark-fill': '0.07',
  'opacity-mark-fill-selected': '0.28',
  'opacity-disabled': '0.45',
  'opacity-dimmed': '0.35',
  'opacity-ancestor': '0.75',
  'opacity-inherited': '0.7',
  /** Outline of the `slot` (reserved space) of the component drawing. */
  'opacity-slot': '0.6',
  'opacity-card': String(CARD_ALPHA),
  /** Viewport rectangle in the minimap. */
  'opacity-grabbed': '0.25',
  'opacity-halo': String(HALO_ALPHA),
  /** Hover outline of the embeddable viewer (`viewer/viewer.ts`). */
  'opacity-viewer-hover': '0.8',
  // Motion
  'duration-instant': '0ms',
  'duration-fast': '100ms',
  'duration-base': '160ms',
  'duration-slow': '240ms',
  /**
   * Delay to open a change's popover on hover (HANDOFF-REVIEW-DETAILS 3.1):
   * asks for intent, otherwise sweeping the panel would open one popover per row.
   */
  'duration-hover-intent': '300ms',
  'easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  // Stacking layers
  // Mirror of the DS, unused in the code: `z-canvas`, `z-picker` and `z-dialog`.
  'z-canvas': '0',
  'z-canvas-overlay': '10',
  'z-toolwindow': '20',
  'z-popover': '40',
  'z-tooltip': '50',
  'z-picker': '60',
  'z-dialog': '70',
  'z-banner': '80',
  // Breakpoints (documentation only: media queries use `breakpoints.ts`)
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

/** All tokens by name (without the `--`), in the order the CSS is emitted. */
export const TOKENS: Readonly<Record<string, TokenValue>> = {
  ...COLORS,
  ...FONTS,
  ...textTokens(),
  ...Object.fromEntries(
    Object.entries(ROLES).map(([role, target]) => [role, `var(--${target})`]),
  ),
  ...SCALES,
};

/** Value of a token in a theme (tokens without variation are the same in both). */
export function tokenValue(name: string, theme: 'light' | 'dark'): string {
  const value = TOKENS[name];
  if (value === undefined) throw new Error(`Token desconhecido: ${name}`);
  return isThemed(value) ? value[theme] : value;
}

function declarations(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([name, value]) => `    --${name}: ${value};`).join('\n');
}

/** `:root` CSS (and the themes') generated from `TOKENS`. */
export function renderTokensCss(): string {
  const all = Object.entries(TOKENS);
  const light = all.map(([name, v]) => [name, isThemed(v) ? v.light : v] as const);
  const dark = all.flatMap(([name, v]) => (isThemed(v) ? [[name, v.dark] as const] : []));
  const indent = (block: string) => block.replaceAll(/^ {4}/gm, '  ');

  return [
    '/* Generated by src/theme/tokens.ts (renderTokensCss). Do not edit. */',
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
