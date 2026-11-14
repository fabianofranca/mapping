import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Icon } from '../icons';
import { Tooltip } from './Tooltip';

interface HelpTipProps {
  /** The subject (field label, type name): the accessible name is "About {name}". */
  readonly name: string;
  /** The explanation: goes in the tip and is the icon's accessible description. */
  readonly text: string;
  /**
   * `id` of the (off-screen) element that holds the text, for anyone who wants to point an
   * `aria-describedby` at the same explanation (`Property` does this on the field's control).
   */
  readonly descriptionId?: string;
}

/**
 * Explanation in an icon with a tip ("explanation = icon with a tip"): a keyboard-focusable `info`
 * button, with the tip on hover and focus (`Tooltip`). Enter or click pins the tip open
 * (`aria-expanded`), for touch users; Esc (which closes only the tip, without reaching the editor
 * shortcuts), another click or loss of focus close it. The text also stays in the DOM, off-screen,
 * as the icon's accessible description. Does not change the selection or the project.
 */
export function HelpTip({ name, text, descriptionId }: HelpTipProps) {
  const generated = useId();
  const id = descriptionId ?? generated;
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !root.current?.contains(e.target)) {
        setPinned(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pinned]);
  return (
    <span ref={root} class="help-tip" onFocusOut={() => setPinned(false)}>
      <Tooltip label={text} open={pinned} onDismiss={() => setPinned(false)}>
        <button
          type="button"
          class="icon-button icon-button-sm help-tip-button"
          aria-label={t('help.about', { name })}
          aria-describedby={id}
          aria-expanded={pinned}
          onClick={() => setPinned((open) => !open)}
        >
          <Icon name="info" />
        </button>
      </Tooltip>
      <span id={id} class="visually-hidden">
        {text}
      </span>
    </span>
  );
}
