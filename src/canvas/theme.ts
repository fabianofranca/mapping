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
  /** Contorno de linhas, nomes, bolinhas e alertas. */
  readonly halo: string;
  /** Seleção, alças, rascunho e alvo de soltar. */
  readonly select: string;
  /** Gesto inválido. */
  readonly invalid: string;
  /** Alerta (⚠) sobre a imagem. */
  readonly warning: string;
  readonly nameTag: string;
  readonly nameTagText: string;
  /** Fundo dos selos de revisão sobre a foto (`cv-badge`, revisão de propostas). */
  readonly badge: string;
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
    /** Anotações herdadas no cartão. */
    readonly inherited: number;
  };
  readonly fontFamily: string;
  readonly type: {
    readonly name: CanvasTextStyle;
    readonly image: CanvasTextStyle;
    readonly card: CanvasTextStyle;
    readonly caption: CanvasTextStyle;
  };
  /** Lado visível da alça (px de tela): `size-handle`. */
  readonly handleSize: number;
  /** Raios (px de tela): `sm` na etiqueta do nome, `md` no cartão do zoom semântico. */
  readonly radius: { readonly sm: number; readonly md: number };
  /** Emblema do cadeado: fundo, traço e lado (px de tela). */
  readonly lock: {
    readonly fill: string;
    readonly glyph: string;
    readonly size: number;
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
    invalid: read('--cv-invalid'),
    warning: read('--cv-warning'),
    nameTag: read('--cv-name-tag'),
    nameTagText: read('--cv-name-tag-text'),
    badge: read('--cv-badge'),
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
      card: textStyle(read, 't-cv-card'),
      caption: textStyle(read, 't-cv-caption'),
    },
    handleSize: number(read, '--size-handle'),
    radius: { sm: number(read, '--radius-sm'), md: number(read, '--radius-md') },
    lock: {
      fill: read('--cv-lock'),
      glyph: read('--cv-lock-glyph'),
      size: number(read, '--size-lock-badge'),
    },
  };
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
