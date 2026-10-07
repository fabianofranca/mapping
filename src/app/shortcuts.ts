// Atalhos de teclado do editor (desktop). Ver docs/history/PLAN-etapas-1-2.md, 7.1, e a
// seção Atalhos do DS 2.0 (docs/redesign/HANDOFF.md, B12 e decisão 1 da seção 5).
import { toolWindowByNumber, type ToolWindowId } from '../store/toolWindows';

export type Shortcut =
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'escape' }
  /** Shift+Esc: esconde a janela de ferramenta em foco. */
  | { readonly kind: 'hide-window' }
  | { readonly kind: 'toggle-window'; readonly window: ToolWindowId }
  /** Ctrl+Shift+setas: redimensiona a janela em foco em 16px. */
  | { readonly kind: 'resize-window'; readonly dx: number; readonly dy: number }
  /** Alt+↑ / Alt+↓ nos breadcrumbs. */
  | { readonly kind: 'select-parent' }
  | { readonly kind: 'select-child' }
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'zoom-reset' }
  | { readonly kind: 'export' }
  | { readonly kind: 'layers' }
  | { readonly kind: 'help' }
  | { readonly kind: 'settings' }
  /** Alt+N: nova anotação na camada ativa (vale também com o foco num campo). */
  | { readonly kind: 'new-annotation' }
  /** Alt+L: tranca ou destranca o item selecionado. */
  | { readonly kind: 'toggle-lock' }
  /** Ctrl/Cmd+C: copia a referência do item (fora de campos de texto e sem texto selecionado). */
  | { readonly kind: 'copy-reference' }
  /** Ctrl+Alt+C: copia como PNG o recorte da marcação selecionada. */
  | { readonly kind: 'copy-crop' };

/**
 * Texto dos atalhos nas dicas dos botões. Nas janelas e no redimensionar é sempre
 * Ctrl (também no macOS, onde Cmd+Shift+3/4/5 tira print da tela).
 */
export const SHORTCUT_LABELS = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  export: 'Ctrl+E',
  layers: 'Ctrl+L',
  help: 'F1',
  settings: 'Ctrl+,',
  newAnnotation: 'Alt+N',
  toggleLock: 'Alt+L',
  newRow: 'Alt+Enter',
  pickRef: 'Ctrl+B',
  copyReference: 'Ctrl+C',
  copyCrop: 'Ctrl+Alt+C',
} as const;

type KeyInfo = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
> & {
  /** Tecla física: com Shift (ou Alt no macOS) o `key` do número vira outro caractere. */
  readonly code?: string;
};

/** Fator de zoom de um passo de Ctrl+= / Ctrl+−. */
const ZOOM_STEP = 1.25;

const ARROWS: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  arrowleft: { dx: -1, dy: 0 },
  arrowright: { dx: 1, dy: 0 },
  arrowup: { dx: 0, dy: -1 },
  arrowdown: { dx: 0, dy: 1 },
};

/**
 * Alt+número é atalho extra: só onde o navegador não o intercepta. No Chrome do
 * Linux ele troca de aba, então ali vale só quando a app está instalada (PWA).
 */
export function altNumbersAvailable(userAgent: string, standalone: boolean): boolean {
  return standalone || !/Linux/.test(userAgent);
}

/**
 * Número de 1 a 9 da tecla. Com Shift, `key` vira o símbolo do teclado (Ctrl+Shift+4
 * chega como `$` no layout americano), então a tecla física (`code`) é quem manda.
 */
function numberOf(e: KeyInfo): number | null {
  const physical = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? '');
  if (physical) return Number(physical[1]);
  const n = Number(e.key);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

/**
 * Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z e Ctrl+Y refazem; Delete (ou Backspace, a
 * tecla "delete" do Mac) exclui; Esc cancela/desseleciona; Shift+Esc esconde a
 * janela em foco. Ctrl+Shift+número abre e fecha as janelas (Alt+número é o extra,
 * ligado por `altNumbers`), Ctrl+Shift+setas as redimensiona, Alt+↑/↓ anda na
 * seleção, Alt+N cria uma anotação na camada ativa, Alt+L tranca/destranca o item
 * selecionado, Ctrl/Cmd+C copia a referência do item, Ctrl+Alt+C copia o recorte da
 * marcação e Ctrl+=/−/0 controlam o zoom.
 */
export function shortcutFor(e: KeyInfo, altNumbers = true): Shortcut | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (e.altKey) {
    // Ctrl+Alt+C (a tecla física: com Alt o `key` vira outro caractere). Não usar Ctrl+Shift+C,
    // que abre as ferramentas de desenvolvedor no Chrome.
    if (mod) {
      return !e.shiftKey && (e.code === 'KeyC' || key === 'c')
        ? { kind: 'copy-crop' }
        : null;
    }
    // Com Alt (Option no macOS) o `key` vira outro caractere: a tecla física manda.
    if (!e.shiftKey && (e.code === 'KeyN' || key === 'n'))
      return { kind: 'new-annotation' };
    if (!e.shiftKey && (e.code === 'KeyL' || key === 'l')) return { kind: 'toggle-lock' };
    if (key === 'arrowup') return { kind: 'select-parent' };
    if (key === 'arrowdown') return { kind: 'select-child' };
    const n = altNumbers ? numberOf(e) : null;
    const window = n === null ? null : toolWindowByNumber(n);
    return window ? { kind: 'toggle-window', window } : null;
  }

  if (mod && e.shiftKey) {
    if (key === 'z') return { kind: 'redo' };
    const n = numberOf(e);
    const window = n === null ? null : toolWindowByNumber(n);
    if (window) return { kind: 'toggle-window', window };
    const arrow = ARROWS[key];
    if (arrow) return { kind: 'resize-window', ...arrow };
    return null;
  }

  if (mod) {
    if (key === 'z') return { kind: 'undo' };
    if (e.ctrlKey && !e.metaKey && key === 'y') return { kind: 'redo' };
    if (key === 'c') return { kind: 'copy-reference' };
    if (key === 'e') return { kind: 'export' };
    if (key === 'l') return { kind: 'layers' };
    if (key === ',') return { kind: 'settings' };
    if (key === '=' || key === '+') return { kind: 'zoom', factor: ZOOM_STEP };
    if (key === '-') return { kind: 'zoom', factor: 1 / ZOOM_STEP };
    if (key === '0') return { kind: 'zoom-reset' };
    return null;
  }

  if (key === 'f1') return { kind: 'help' };
  if (e.shiftKey) return key === 'escape' ? { kind: 'hide-window' } : null;
  if (key === 'delete' || key === 'backspace') return { kind: 'delete' };
  if (key === 'escape') return { kind: 'escape' };
  return null;
}

/** Atalhos que valem também com o foco num campo de texto (os "de campo"). */
export function worksInTextInput(shortcut: Shortcut): boolean {
  return shortcut.kind === 'new-annotation';
}

/** Alvos em que o teclado pertence ao campo, não ao editor. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
