// Atalhos de teclado do editor (desktop). Ver docs/history/PLAN-etapas-1-2.md, 7.1.

export type Shortcut = 'undo' | 'redo' | 'delete' | 'escape';

/** Texto dos atalhos nas dicas dos botões (o Cmd do Mac também funciona, mas a dica diz Ctrl). */
export const SHORTCUT_LABELS = { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' } as const;

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/**
 * Ctrl/Cmd+Z desfaz; Ctrl/Cmd+Shift+Z e Ctrl+Y refazem; Delete (ou Backspace,
 * a tecla "delete" do Mac) exclui; Esc cancela/desseleciona.
 */
export function shortcutFor(e: KeyInfo): Shortcut | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (e.ctrlKey && !e.metaKey && !e.shiftKey && key === 'y') return 'redo';
  if (mod || e.shiftKey) return null;
  if (key === 'delete' || key === 'backspace') return 'delete';
  if (key === 'escape') return 'escape';
  return null;
}

/** Alvos em que o teclado pertence ao campo, não ao editor. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
