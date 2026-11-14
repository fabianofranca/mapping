import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

// Where a click on a review button came from. The keyboard (Enter or Space on the button
// itself) does not suggest the note to the agent nor move focus; everything else counts as mouse:
// a click from the browser extension or `element.click()` arrives with `detail === 0`,
// the same as the keyboard's, so `detail` does not tell them apart. What does is the `keydown` of
// Enter/Space on the button before the `click`.

interface ClickSource {
  /** Props to spread on the button: they record the keyboard and forget it on leaving or on mouse. */
  readonly handlers: {
    readonly onKeyDown: JSX.KeyboardEventHandler<HTMLElement>;
    readonly onPointerDown: () => void;
    readonly onBlur: () => void;
  };
  /** Call in `onClick`: says whether the click came from the keyboard and resets the mark (one click). */
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
