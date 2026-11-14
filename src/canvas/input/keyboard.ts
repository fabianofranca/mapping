// Canvas keyboard: holding Space turns the drag into a pan (as in image
// editors). The other editor shortcuts live in `app/shortcuts.ts`.

/** Text fields and buttons receive Space normally. */
export function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
  );
}

/** Link and button (including `role=button`) use Space to activate: the `keydown` is not canceled on them. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('a[href], button, [role="button"]') !== null
  );
}

export interface SpaceKey {
  /** Space pressed now. */
  readonly down: () => boolean;
  readonly dispose: () => void;
}

/**
 * Tracks Space on the window. `onChange` runs on every key (to update the
 * cursor). Losing focus releases the key (the keyup may never arrive).
 */
export function watchSpaceKey(onChange: () => void, target: Window = window): SpaceKey {
  let down = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    if (e.type === 'keyup') {
      // Solta em qualquer alvo (o foco pode ter ido para um campo depois do keydown).
      const wasDown = down;
      down = false;
      if (wasDown) onChange();
      return;
    }
    if (isEditable(e.target)) return;
    down = true;
    if (!isInteractive(e.target)) e.preventDefault();
    onChange();
  };
  const onBlur = () => (down = false);
  target.addEventListener('keydown', onKey);
  target.addEventListener('keyup', onKey);
  target.addEventListener('blur', onBlur);
  return {
    down: () => down,
    dispose: () => {
      target.removeEventListener('keydown', onKey);
      target.removeEventListener('keyup', onKey);
      target.removeEventListener('blur', onBlur);
    },
  };
}
