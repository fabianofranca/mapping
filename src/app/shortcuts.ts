// Atalhos de teclado do editor (desktop). Ver a seção Atalhos do design system (docs/DESIGN-SYSTEM.md).
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
  /** Alt+L: tranca ou destranca o item selecionado. */
  | { readonly kind: 'toggle-lock' }
  /** Alt+H: liga ou desliga o Ver limpo do canvas. */
  | { readonly kind: 'clean-view' }
  /** Ctrl/Cmd+C: copia a referência do item (fora de campos de texto e sem texto selecionado). */
  | { readonly kind: 'copy-reference' }
  /** Ctrl+Alt+C: copia como PNG o recorte da marcação selecionada. */
  | { readonly kind: 'copy-crop' }
  /** Alt+Shift+A: arruma as filhas do container selecionado (etapa Biblioteca, B3). */
  | { readonly kind: 'arrange' }
  /** Ctrl/Cmd+G: envolve a seleção numa marcação nova (etapa Envolver). */
  | { readonly kind: 'wrap' }
  /** ←↑→↓ movem a seleção 1 px; Shift+seta, 10 px (`dx`, `dy` já com o passo). */
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number };

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
  toggleLock: 'Alt+L',
  cleanView: 'Alt+H',
  newRow: 'Alt+Enter',
  pickRef: 'Ctrl+B',
  copyReference: 'Ctrl+C',
  copyCrop: 'Ctrl+Alt+C',
  arrange: 'Alt+Shift+A',
  wrap: 'Ctrl+G',
} as const;

const ARIA_MODIFIERS: Readonly<Record<string, string>> = {
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Meta',
  meta: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

const ARIA_KEY_NAMES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  enter: 'Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  '+': 'Plus',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
};

/**
 * O valor de `aria-keyshortcuts` (sintaxe WAI-ARIA: `Control+E`, `Control+Shift+Z`,
 * `Alt+Enter`, `F1`) a partir do rótulo humano da dica (`Ctrl+E`), que continua só na dica.
 * Rótulo que não é tecla ("Ctrl+clique") não vira atributo (etapa 8, F5).
 */
export function ariaKeys(label: string | undefined): string | undefined {
  if (!label) return undefined;
  // "Ctrl++": o último "+" é a tecla.
  const parts = label.endsWith('++')
    ? [...label.slice(0, -2).split('+'), '+']
    : label.split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts.map((m) => ARIA_MODIFIERS[m.trim().toLowerCase()]);
  if (modifiers.some((m) => m === undefined)) return undefined;
  const name =
    ARIA_KEY_NAMES[key.toLowerCase()] ??
    (/^F\d{1,2}$/i.test(key)
      ? key.toUpperCase()
      : key.length === 1
        ? key.toUpperCase()
        : undefined);
  return name === undefined ? undefined : [...modifiers, name].join('+');
}

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

/** Teclas de Ctrl/Cmd (sem Shift nem Alt) que sempre dão o mesmo atalho. */
const MOD_KEYS: Readonly<Record<string, Shortcut>> = {
  z: { kind: 'undo' },
  c: { kind: 'copy-reference' },
  e: { kind: 'export' },
  g: { kind: 'wrap' },
  l: { kind: 'layers' },
  ',': { kind: 'settings' },
  '=': { kind: 'zoom', factor: ZOOM_STEP },
  '+': { kind: 'zoom', factor: ZOOM_STEP },
  '-': { kind: 'zoom', factor: 1 / ZOOM_STEP },
  '0': { kind: 'zoom-reset' },
};

/** Atalhos com Ctrl/Cmd (sem Shift nem Alt). */
function modShortcut(e: KeyInfo, key: string): Shortcut | null {
  // Ctrl+Y refaz; o Cmd+Y do macOS é do navegador.
  if (key === 'y') return e.ctrlKey && !e.metaKey ? { kind: 'redo' } : null;
  return MOD_KEYS[key] ?? null;
}

/**
 * Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z e Ctrl+Y refazem; Delete (ou Backspace, a
 * tecla "delete" do Mac) exclui; Esc cancela/desseleciona; Shift+Esc esconde a
 * janela em foco. Ctrl+Shift+número abre e fecha as janelas (Alt+número é o extra,
 * ligado por `altNumbers`), Ctrl+Shift+setas as redimensiona, Alt+↑/↓ anda na
 * seleção, Alt+N cria uma anotação na camada ativa, Alt+L tranca/destranca o item
 * selecionado, Alt+H liga o Ver limpo, Ctrl/Cmd+C copia a referência do item, Ctrl/Cmd+G envolve a seleção, Ctrl+Alt+C copia o recorte da
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
    if (e.shiftKey && (e.code === 'KeyA' || key === 'a')) return { kind: 'arrange' };
    if (!e.shiftKey && (e.code === 'KeyL' || key === 'l')) return { kind: 'toggle-lock' };
    if (!e.shiftKey && (e.code === 'KeyH' || key === 'h')) return { kind: 'clean-view' };
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

  if (mod) return modShortcut(e, key);

  if (key === 'f1') return { kind: 'help' };
  const nudge = nudgeShortcut(key, e.shiftKey);
  if (nudge) return nudge;
  if (e.shiftKey) return key === 'escape' ? { kind: 'hide-window' } : null;
  if (key === 'delete' || key === 'backspace') return { kind: 'delete' };
  if (key === 'escape') return { kind: 'escape' };
  return null;
}

/** Passo das setas sem Ctrl/Alt: 1 px, ou 10 px com Shift. */
export const NUDGE_STEP = 1;
export const NUDGE_STEP_SHIFT = 10;

function nudgeShortcut(key: string, shift: boolean): Shortcut | null {
  const arrow = ARROWS[key];
  if (!arrow) return null;
  const step = shift ? NUDGE_STEP_SHIFT : NUDGE_STEP;
  return { kind: 'nudge', dx: arrow.dx * step, dy: arrow.dy * step };
}

/** Controles de dentro do canvas que usam as setas (ou o foco) por conta própria. */
const OWN_ARROWS =
  'button, a[href], input, select, textarea, [contenteditable], [role="menu"], [role="menuitem"], [role="slider"], [role="tab"], [role="listbox"], [role="option"], [role="radio"], [role="tree"], [role="treeitem"], [tabindex]:not([tabindex="-1"])';

/**
 * As setas são do editor (movem a seleção) só com o foco no canvas ou em nenhum controle
 * (`body`). Num campo, na Árvore, num menu, lista, abas ou qualquer controle que use setas, o
 * teclado é dele.
 */
export function arrowsBelongToEditor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  if (!target.closest('[data-canvas-area]')) return false;
  return target.closest(OWN_ARROWS) === null;
}

/**
 * Atalhos da revisão de propostas (HANDOFF-PROPOSALS 6): valem só com a revisão aberta e
 * o foco fora de um campo de texto. O projeto está somente leitura, então as letras ficam
 * livres (`R` rejeita).
 */
export type ReviewShortcut =
  | { readonly kind: 'decide'; readonly state: 'accepted' | 'rejected' | null }
  | {
      readonly kind: 'step';
      readonly target: 'pending' | 'conflict';
      readonly direction: 1 | -1;
    }
  | { readonly kind: 'toggle-view' }
  | { readonly kind: 'legend' }
  | { readonly kind: 'apply' };

/**
 * A / R aceitam e rejeitam o nível selecionado, Backspace limpa a decisão, N / Shift+N e
 * C / Shift+C andam nas pendentes e nos conflitos, P alterna Atual / Proposto, L mostra a
 * legenda das marcas e Ctrl+Enter aplica as aceitas.
 */
export function reviewShortcutFor(e: KeyInfo): ReviewShortcut | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  if (mod) return !e.shiftKey && key === 'enter' ? { kind: 'apply' } : null;
  const direction = e.shiftKey ? -1 : 1;
  if (e.code === 'KeyN' || key === 'n')
    return { kind: 'step', target: 'pending', direction };
  if (e.code === 'KeyC' || key === 'c') {
    return { kind: 'step', target: 'conflict', direction };
  }
  if (e.shiftKey) return null;
  if (key === 'a') return { kind: 'decide', state: 'accepted' };
  if (key === 'r') return { kind: 'decide', state: 'rejected' };
  if (key === 'backspace') return { kind: 'decide', state: null };
  if (key === 'p') return { kind: 'toggle-view' };
  if (key === 'l') return { kind: 'legend' };
  return null;
}

/** Alvos em que o teclado pertence ao campo, não ao editor. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
