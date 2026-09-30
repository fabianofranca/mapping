// Cores do canvas lidas das variáveis CSS do tema (nenhuma cor fixa no código).

export interface CanvasTokens {
  readonly accent: string;
  readonly danger: string;
  readonly warning: string;
  readonly surface: string;
  readonly border: string;
  readonly textMuted: string;
}

function read(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
}

export function readCanvasTokens(
  root: HTMLElement = document.documentElement,
): CanvasTokens {
  const style = getComputedStyle(root);
  return {
    accent: read(style, '--color-accent'),
    danger: read(style, '--color-danger'),
    warning: read(style, '--color-warning'),
    surface: read(style, '--color-surface'),
    border: read(style, '--color-border'),
    textMuted: read(style, '--color-text-muted'),
  };
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
