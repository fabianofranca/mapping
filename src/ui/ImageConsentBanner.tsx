import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { allowOrigins, dismissOrigins } from '../store/imagePermissions';
import type { RemoteImageOrigin } from '../store/derived';
import { Button } from './controls';
import { Notice } from './Notice';
import { useEditor } from './EditorContext';
import { captureFocusOrigin, FOCUSABLE } from './focus';
import { focusCanvasArea } from './toolWindowLayout';

/** The origin in full, flagging `http` ("unencrypted") and local network. */
export function describeImageOrigin(item: RemoteImageOrigin): string {
  const marks = [
    item.insecure ? t('imageConsent.insecure') : null,
    item.local ? t('imageConsent.local') : null,
  ].filter((mark): mark is string => mark !== null);
  return marks.length === 0 ? item.origin : `${item.origin} (${marks.join(', ')})`;
}

/** Focuses `el` if it is still in the DOM and checks that focus really went to it. */
function tryFocus(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  el.focus();
  return document.activeElement === el;
}

/**
 * Banner for consent to remote images: appears when the project in view uses origins
 * without permission. Nothing is allowed without an explicit action; "Not now" only applies to this session.
 */
export function ImageConsentBanner() {
  const { derived } = useEditor();
  const pending = derived.pendingImageOrigins.value;
  const visible = pending.length > 0;
  const dismissRef = useRef<HTMLButtonElement>(null);
  const allowRef = useRef<HTMLButtonElement>(null);
  const focusInBanner = () =>
    document.activeElement !== null &&
    (document.activeElement === dismissRef.current ||
      document.activeElement === allowRef.current);
  // Who had focus when the banner appeared (e.g. the image URL field), and its `id`:
  // the field may be swapped for another (`input` ↔ `textarea`, URL longer than 60 characters).
  const previous = useRef<Element | null>(null);
  const previousId = useRef('');
  const previousParent = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const remember = (el: Element | null) => {
      previous.current = el;
      previousId.current = el?.id ?? '';
      previousParent.current = el?.parentElement ?? null;
    };
    remember(focusInBanner() ? null : captureFocusOrigin().opener);
    if (!visible) return;
    // While the banner is open, follows focus outside it: the swapped field takes focus
    // after the banner appears.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const inBanner = target === dismissRef.current || target === allowRef.current;
      if (target instanceof Element && !inBanner) remember(target);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [visible]);
  // The field was swapped and the new one did not get focus: finds it by the same `id`, next to the old one.
  const target = (): Element | null => {
    if (previous.current?.isConnected || previousId.current === '')
      return previous.current;
    const found = [...(previousParent.current?.querySelectorAll(FOCUSABLE) ?? [])];
    return found.find((el) => el.id === previousId.current) ?? null;
  };
  if (!visible) return null;
  const origins = pending.map((o) => o.origin);
  // On close with focus in the banner, it goes back to whoever had it (if still in the DOM) or to the
  // canvas, still with the banner in the DOM: never to `body`. Focus outside the banner: nothing is touched.
  const close = (action: (origins: readonly string[]) => void) => () => {
    const inside = focusInBanner();
    action(origins);
    if (inside && !tryFocus(target())) focusCanvasArea();
  };
  return (
    <Notice
      tone="warning"
      class="image-consent"
      actions={
        <>
          <Button size="sm" buttonRef={dismissRef} onClick={close(dismissOrigins)}>
            {t('imageConsent.dismiss')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            buttonRef={allowRef}
            onClick={close(allowOrigins)}
          >
            {t('imageConsent.allow')}
          </Button>
        </>
      }
    >
      <span class="notice-box-text">
        {t('imageConsent.message', {
          origins: pending.map(describeImageOrigin).join(', '),
        })}
      </span>
    </Notice>
  );
}
