// Teclado do canvas: segurar Espaço faz o arrasto virar pan (como em editores
// de imagem). Os demais atalhos do editor ficam em `app/shortcuts.ts`.

/** Campos de texto e botões recebem o Espaço normalmente. */
export function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
  );
}

export interface SpaceKey {
  /** Espaço pressionado agora. */
  readonly down: () => boolean;
  readonly dispose: () => void;
}

/**
 * Acompanha o Espaço na janela. `onChange` roda a cada tecla (para atualizar o
 * cursor). Perder o foco solta a tecla (o keyup pode nunca chegar).
 */
export function watchSpaceKey(onChange: () => void, target: Window = window): SpaceKey {
  let down = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || isEditable(e.target)) return;
    down = e.type === 'keydown';
    e.preventDefault();
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
