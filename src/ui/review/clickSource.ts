import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

// De onde veio um clique num botão da revisão. O teclado (Enter ou Espaço no próprio
// botão) não sugere a nota para o agente nem move o foco; todo o resto conta como mouse:
// um clique da extensão do navegador ou de `element.click()` chega com `detail === 0`,
// igual ao do teclado, então `detail` não distingue. O que distingue é o `keydown` de
// Enter/Espaço no botão antes do `click`.

interface ClickSource {
  /** Props para espalhar no botão: registram o teclado e o esquecem ao sair ou no mouse. */
  readonly handlers: {
    readonly onKeyDown: JSX.KeyboardEventHandler<HTMLElement>;
    readonly onPointerDown: () => void;
    readonly onBlur: () => void;
  };
  /** Chame no `onClick`: diz se o clique veio do teclado e zera a marca (vale um clique). */
  readonly takeKeyboard: () => boolean;
}

export function useClickSource(): ClickSource {
  const keyboard = useRef(false);
  const source = useRef<ClickSource>();
  source.current ??= {
    handlers: {
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') keyboard.current = true;
      },
      onPointerDown: () => {
        keyboard.current = false;
      },
      onBlur: () => {
        keyboard.current = false;
      },
    },
    takeKeyboard: () => {
      const was = keyboard.current;
      keyboard.current = false;
      return was;
    },
  };
  return source.current;
}
