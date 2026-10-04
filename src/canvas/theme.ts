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
    /** Preenchimento do item pego pelo segurar-e-mover. */
    readonly grabbed: number;
  };
  readonly fontFamily: string;
  readonly type: {
    readonly name: CanvasTextStyle;
    readonly image: CanvasTextStyle;
    readonly card: CanvasTextStyle;
    readonly caption: CanvasTextStyle;
  };
  /** Lado visível da alça (px de tela): `size-handle`, ou `size-handle-touch` com toque. */
  readonly handleSize: number;
  /** Raios (px de tela): `sm` na etiqueta do nome, `md` no cartão do zoom semântico. */
  readonly radius: { readonly sm: number; readonly md: number };
  /** Sombra do item pego (`shadow-grabbed`). */
  readonly grabShadow: { readonly blur: number; readonly color: string };
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

/** `0 0 14px rgba(…)` → desfoque e cor (o deslocamento do `shadow-grabbed` é zero). */
function parseShadow(value: string): CanvasTokens['grabShadow'] {
  const match = /^\s*\S+\s+\S+\s+(-?[\d.]+)px\s+(.+?)\s*$/.exec(value);
  return { blur: Number.parseFloat(match?.[1] ?? ''), color: match?.[2] ?? '' };
}

/** Monta os tokens do canvas a partir de um leitor (o computed style, ou outro, nos testes). */
export function canvasTokensFrom(read: TokenReader, coarsePointer = false): CanvasTokens {
  return {
    line: read('--cv-line'),
    halo: read('--cv-halo'),
    select: read('--cv-select'),
    invalid: read('--cv-invalid'),
    warning: read('--cv-warning'),
    nameTag: read('--cv-name-tag'),
    nameTagText: read('--cv-name-tag-text'),
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
      grabbed: number(read, '--opacity-grabbed'),
    },
    fontFamily: read('--font-sans'),
    type: {
      name: textStyle(read, 't-cv-name'),
      image: textStyle(read, 't-cv-image'),
      card: textStyle(read, 't-cv-card'),
      caption: textStyle(read, 't-cv-caption'),
    },
    handleSize: number(read, coarsePointer ? '--size-handle-touch' : '--size-handle'),
    radius: { sm: number(read, '--radius-sm'), md: number(read, '--radius-md') },
    grabShadow: parseShadow(read('--shadow-grabbed')),
  };
}

export function readCanvasTokens(
  root: HTMLElement = document.documentElement,
): CanvasTokens {
  const style = getComputedStyle(root);
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  return canvasTokensFrom((name) => style.getPropertyValue(name).trim(), coarse);
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
