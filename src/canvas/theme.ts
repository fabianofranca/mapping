import type { HostFonts } from '../model/components/tokens';

// Tokens do canvas lidos das variáveis CSS do tema (nenhum valor de design fixo
// no código). Os nomes em `--cv-*`, `--opacity-*`, `--t-cv-*` etc. vêm de
// `src/theme/tokens.ts`, a fonte única.

/** Estilo de texto do canvas (`--t-cv-*`): fonte e altura de linha em px de tela. */
export interface CanvasTextStyle {
  readonly size: number;
  readonly line: number;
  /** Peso numérico; o Konva recebe-o em `fontStyle`. */
  readonly weight: number;
}

export interface CanvasTokens {
  // Marcações e sobreposições (iguais nos dois temas: ficam sobre a imagem).
  /** Linha da marcação (cor padrão, sem cor escolhida para a imagem). */
  readonly line: string;
  /** Contorno de linhas, nomes e alertas. */
  readonly halo: string;
  /** Seleção, alças, rascunho e alvo de soltar. */
  readonly select: string;
  /** Preenchimento do retângulo de seleção (Shift+arrasto). */
  readonly selectFill: string;
  /** Contorno dos itens selecionados que não são o primário (seleção múltipla). */
  readonly selectSecondary: string;
  /** Gesto inválido. */
  readonly invalid: string;
  /** Borda tracejada da marcação do canvas (sem container, sem cor de container). */
  readonly canvasMarking: string;
  /** Item que será absorvido ao soltar o desenho ou o redimensionamento: traço e preenchimento. */
  readonly absorb: string;
  readonly absorbFill: string;
  /** Alerta (⚠) sobre a imagem. */
  readonly warning: string;
  readonly nameTag: string;
  readonly nameTagText: string;
  /** Fundo dos selos de revisão sobre a foto (`cv-badge`, revisão de propostas). */
  readonly badge: string;
  /** Cores do desenho dos componentes: reservado de imagem, seu contorno e o nó desconhecido. */
  readonly component: {
    readonly placeholderFill: string;
    readonly placeholderLine: string;
    readonly unknownLine: string;
  };
  // Superfícies do tema (cartão, espaço reservado das imagens, rótulos).
  readonly surface: string;
  readonly card: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  /** Alerta em texto sobre `surface`/`card` (a cor `warning` do canvas não tem contraste ali). */
  readonly warningText: string;
  readonly opacity: {
    /** Marcação sem anotação nas camadas visíveis. */
    readonly dimmed: number;
    /** Borda de contexto dos pais no modo Ocultar. */
    readonly ancestor: number;
    /** Elementos esmaecidos (ex.: cadeado de marcação travada). */
    readonly inherited: number;
  };
  readonly fontFamily: string;
  readonly type: {
    readonly name: CanvasTextStyle;
    readonly image: CanvasTextStyle;
  };
  /** Lado visível da alça (px de tela): `size-handle`. */
  readonly handleSize: number;
  /** Lado (px de tela) mínimo de indicadores da marcação com componente: `size-indicator-min-marking` (hoje sem uso no desenho do canvas). */
  readonly indicatorMinMarking: number;
  /** Nível de detalhe (px de tela): abaixo de `lodMinMarking` (largura ou altura) só a borda; abaixo de `lodHideMarking` nas duas medidas, nada. */
  readonly lodMinMarking: number;
  readonly lodHideMarking: number;
  /** Raios (px de tela): `sm` na etiqueta do nome, `md` nos demais cantos arredondados. */
  readonly radius: { readonly sm: number; readonly md: number };
  /** Seta (v13): cores do traço, da seleção e do rótulo; espessuras e ponta (px de tela). */
  readonly arrow: {
    readonly stroke: string;
    readonly select: string;
    readonly label: string;
    readonly labelBg: string;
    readonly width: number;
    readonly widthSelected: number;
    readonly head: number;
  };
  /** Emblema do cadeado: fundo, traço e lado (px de tela). */
  readonly lock: {
    readonly fill: string;
    readonly glyph: string;
    readonly size: number;
  };
  /** Pino das conversas (`cv-pin-*`): fundo por estado, texto, contorno, anel e ponto de não lida. */
  readonly pin: {
    readonly human: string;
    readonly agent: string;
    readonly resolved: string;
    readonly text: string;
    readonly halo: string;
    readonly selected: string;
    readonly unread: string;
    /** Medidas (px de tela): altura, respiro dos lados, glifo do estado, vão glifo-rótulo e largura estimada por letra. */
    readonly height: number;
    readonly pad: number;
    readonly glyph: number;
    readonly glyphGap: number;
    readonly charWidth: number;
  };
  /** Selo de chegada (`size-cv-arrival-*`, px de tela): altura, respiro, vãos, faixa do nome e largura por letra. */
  readonly arrival: {
    readonly height: number;
    readonly pad: number;
    readonly gap: number;
    readonly gapBelow: number;
    readonly nameBand: number;
    readonly charWidth: number;
  };
}

/** Lê o valor de um token pelo nome com `--` (ex: `--cv-line`). */
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

/** Monta os tokens do canvas a partir de um leitor (o computed style, ou outro, nos testes). */
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
    },
    surface: read('--color-surface'),
    card: read('--color-card'),
    border: read('--color-border'),
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
    indicatorMinMarking: number(read, '--size-indicator-min-marking'),
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

/** A fonte do hospedeiro lida do tema: `--font-sans` e `--font-mono`; valor vazio fica ausente. */
export function hostFontsFrom(read: TokenReader): HostFonts {
  const sans = read('--font-sans');
  const mono = read('--font-mono');
  return {
    ...(sans === '' ? {} : { sans }),
    ...(mono === '' ? {} : { mono }),
  };
}

/** `hostFontsFrom` sobre o estilo calculado da página (vazio se não há DOM). */
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
 * Chama `onChange` quando o tema efetivo muda: troca manual (`data-theme` no
 * <html>) ou mudança do tema do sistema.
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
