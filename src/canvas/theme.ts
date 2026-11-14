import type { HostFonts } from '../model/components/tokens';

// Canvas tokens read from the theme's CSS variables (no fixed design value
// in the code). The names in `--cv-*`, `--opacity-*`, `--t-cv-*` etc. come from
// `src/theme/tokens.ts`, the single source.

/** Canvas text style (`--t-cv-*`): font and line height in screen px. */
export interface CanvasTextStyle {
  readonly size: number;
  readonly line: number;
  /** Numeric weight; Konva receives it in `fontStyle`. */
  readonly weight: number;
}

export interface CanvasTokens {
  // Markings and overlays (the same in both themes: they sit over the image).
  /** Marking line (default color, no color chosen for the image). */
  readonly line: string;
  /** Outline of lines, names and alerts. */
  readonly halo: string;
  /** Selection, handles, draft and drop target. */
  readonly select: string;
  /** Fill of the selection rectangle (Shift+drag). */
  readonly selectFill: string;
  /** Outline of the selected items that are not the primary one (multiple selection). */
  readonly selectSecondary: string;
  /** Invalid gesture. */
  readonly invalid: string;
  /** Dashed border of the canvas marking (no container, no container color). */
  readonly canvasMarking: string;
  /** Item that will be absorbed when the draw or resize is dropped: stroke and fill. */
  readonly absorb: string;
  readonly absorbFill: string;
  /** Alert (⚠) over the image. */
  readonly warning: string;
  readonly nameTag: string;
  readonly nameTagText: string;
  /** Background of the review badges over the photo (`cv-badge`, proposal review). */
  readonly badge: string;
  /**
   * Component drawing (`RenderPalette`): image placeholder and its outline, the unknown
   * node, the fill and text of the missing-type box, and the slot opacity.
   */
  readonly component: {
    readonly placeholderFill: string;
    readonly placeholderLine: string;
    readonly unknownLine: string;
    readonly unknownFill: string;
    readonly slotOpacity: number;
    readonly labelFontSize: number;
    readonly labelFontFamily: string;
  };
  // Theme surfaces (card, image placeholder, labels).
  readonly surface: string;
  readonly card: string;
  readonly border: string;
  /** Control border (`--color-border-control`): the anchor's link line (R4). */
  readonly borderControl: string;
  readonly text: string;
  readonly textMuted: string;
  /** Alert as text over `surface`/`card` (the canvas `warning` color has no contrast there). */
  readonly warningText: string;
  readonly opacity: {
    /** Marking with no annotation in the visible layers. */
    readonly dimmed: number;
    /** Parents' context border in Hide mode. */
    readonly ancestor: number;
    /** Faded elements (e.g. padlock of a locked marking). */
    readonly inherited: number;
  };
  readonly fontFamily: string;
  readonly type: {
    readonly name: CanvasTextStyle;
    readonly image: CanvasTextStyle;
  };
  /** Visible side of the handle (screen px): `size-handle`. */
  readonly handleSize: number;
  /**
   * Level of detail (screen px): below `lodMinMarking` (width or height) only the border;
   * below `lodHideMarking` on both measures, nothing.
   */
  readonly lodMinMarking: number;
  readonly lodHideMarking: number;
  /** Radii (screen px): `sm` on the name label, `md` on the other rounded corners. */
  readonly radius: { readonly sm: number; readonly md: number };
  /** Arrow (v13): colors of stroke, selection and label; thicknesses and tip (screen px). */
  readonly arrow: {
    readonly stroke: string;
    readonly select: string;
    readonly label: string;
    readonly labelBg: string;
    readonly width: number;
    readonly widthSelected: number;
    readonly head: number;
  };
  /** Lock badge: background, stroke and side (screen px). */
  readonly lock: {
    readonly fill: string;
    readonly glyph: string;
    readonly size: number;
  };
  /** Thread pin (`cv-pin-*`): background by state, text, outline, ring and unread dot. */
  readonly pin: {
    readonly human: string;
    readonly agent: string;
    readonly resolved: string;
    readonly text: string;
    readonly halo: string;
    readonly selected: string;
    readonly unread: string;
    /**
     * Measures (screen px): height, side padding, state glyph, glyph-label gap and estimated
     * width per letter.
     */
    readonly height: number;
    readonly pad: number;
    readonly glyph: number;
    readonly glyphGap: number;
    readonly charWidth: number;
  };
  /** Arrival badge (`size-cv-arrival-*`, screen px): height, padding, gaps, name strip, width per letter. */
  readonly arrival: {
    readonly height: number;
    readonly pad: number;
    readonly gap: number;
    readonly gapBelow: number;
    readonly nameBand: number;
    readonly charWidth: number;
  };
}

/** Reads the value of a token by its `--` name (e.g. `--cv-line`). */
export type TokenReader = (name: string) => string;

function number(read: TokenReader, name: string): number {
  return Number.parseFloat(read(name));
}

function textStyle(read: TokenReader, name: string): CanvasTextStyle {
  return {
    size: number(read, `--${name}-size`),
    line: number(read, `--${name}-line`),
    weight: number(read, `--${name}-weight`),
  };
}

/** Builds the canvas tokens from a reader (the computed style, or another one, in the tests). */
export function canvasTokensFrom(read: TokenReader): CanvasTokens {
  return {
    line: read('--cv-line'),
    halo: read('--cv-halo'),
    select: read('--cv-select'),
    selectFill: read('--cv-select-fill'),
    selectSecondary: read('--cv-select-secondary'),
    invalid: read('--cv-invalid'),
    canvasMarking: read('--cv-canvas-marking'),
    absorb: read('--cv-absorb'),
    absorbFill: read('--cv-absorb-fill'),
    warning: read('--cv-warning'),
    nameTag: read('--cv-name-tag'),
    nameTagText: read('--cv-name-tag-text'),
    badge: read('--cv-badge'),
    component: {
      placeholderFill: read('--cv-component-placeholder'),
      placeholderLine: read('--cv-component-placeholder-line'),
      unknownLine: read('--cv-component-unknown'),
      unknownFill: read('--cv-component-unknown-fill'),
      slotOpacity: number(read, '--opacity-slot'),
      labelFontSize: number(read, '--t-cv-image-size'),
      labelFontFamily: read('--font-sans'),
    },
    surface: read('--color-surface'),
    card: read('--color-card'),
    border: read('--color-border'),
    borderControl: read('--color-border-control'),
    text: read('--color-text'),
    textMuted: read('--color-text-muted'),
    warningText: read('--color-warning'),
    opacity: {
      dimmed: number(read, '--opacity-dimmed'),
      ancestor: number(read, '--opacity-ancestor'),
      inherited: number(read, '--opacity-inherited'),
    },
    fontFamily: read('--font-sans'),
    type: {
      name: textStyle(read, 't-cv-name'),
      image: textStyle(read, 't-cv-image'),
    },
    handleSize: number(read, '--size-handle'),
    lodMinMarking: number(read, '--size-lod-min-marking'),
    lodHideMarking: number(read, '--size-lod-hide-marking'),
    radius: { sm: number(read, '--radius-sm'), md: number(read, '--radius-md') },
    arrow: {
      stroke: read('--cv-arrow'),
      select: read('--cv-arrow-select'),
      label: read('--cv-arrow-label'),
      labelBg: read('--cv-arrow-label-bg'),
      width: number(read, '--size-arrow-stroke'),
      widthSelected: number(read, '--size-arrow-stroke-selected'),
      head: number(read, '--size-arrow-head'),
    },
    lock: {
      fill: read('--cv-lock'),
      glyph: read('--cv-lock-glyph'),
      size: number(read, '--size-lock-badge'),
    },
    pin: {
      human: read('--cv-pin-human'),
      agent: read('--cv-pin-agent'),
      resolved: read('--cv-pin-resolved'),
      text: read('--cv-pin-text'),
      halo: read('--cv-pin-halo'),
      selected: read('--cv-pin-selected'),
      unread: read('--cv-pin-unread'),
      height: number(read, '--size-cv-pin-height'),
      pad: number(read, '--size-cv-pin-pad'),
      glyph: number(read, '--size-cv-pin-glyph'),
      glyphGap: number(read, '--size-cv-pin-glyph-gap'),
      charWidth: number(read, '--size-cv-pin-char'),
    },
    arrival: {
      height: number(read, '--size-cv-arrival-height'),
      pad: number(read, '--size-cv-arrival-pad'),
      gap: number(read, '--size-cv-arrival-gap'),
      gapBelow: number(read, '--size-cv-arrival-gap-below'),
      nameBand: number(read, '--size-cv-arrival-name-band'),
      charWidth: number(read, '--size-cv-arrival-char'),
    },
  };
}

/** The host font read from the theme: `--font-sans` and `--font-mono`; an empty value stays absent. */
export function hostFontsFrom(read: TokenReader): HostFonts {
  const sans = read('--font-sans');
  const mono = read('--font-mono');
  return {
    ...(sans === '' ? {} : { sans }),
    ...(mono === '' ? {} : { mono }),
  };
}

/** `hostFontsFrom` over the page's computed style (empty if there is no DOM). */
export function readHostFonts(root?: HTMLElement): HostFonts {
  try {
    const style = getComputedStyle(root ?? document.documentElement);
    return hostFontsFrom((name) => style.getPropertyValue(name).trim());
  } catch {
    return {};
  }
}

export function readCanvasTokens(
  root: HTMLElement = document.documentElement,
): CanvasTokens {
  const style = getComputedStyle(root);
  return canvasTokensFrom((name) => style.getPropertyValue(name).trim());
}

/**
 * Calls `onChange` when the effective theme changes: a manual switch (`data-theme` on
 * <html>) or a change in the system theme.
 */
export function watchTheme(
  onChange: () => void,
  root: HTMLElement = document.documentElement,
): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}
