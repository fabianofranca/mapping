import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { allowOrigins, dismissOrigins } from '../store/imagePermissions';
import type { RemoteImageOrigin } from '../store/derived';
import { Button } from './controls';
import { Notice } from './Notice';
import { useEditor } from './EditorContext';
import { captureFocusOrigin } from './focus';
import { focusCanvasArea } from './toolWindowLayout';

/** A origem por extenso, marcando `http` ("sem criptografia") e rede local. */
export function describeImageOrigin(item: RemoteImageOrigin): string {
  const marks = [
    item.insecure ? t('imageConsent.insecure') : null,
    item.local ? t('imageConsent.local') : null,
  ].filter((mark): mark is string => mark !== null);
  return marks.length === 0 ? item.origin : `${item.origin} (${marks.join(', ')})`;
}

/** Foca `el` se ele ainda está no DOM e confere que o foco foi mesmo para ele. */
function tryFocus(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  el.focus();
  return document.activeElement === el;
}

/**
 * Faixa de consentimento das imagens remotas: aparece quando o projeto à vista usa origens
 * sem permissão. Nada é permitido sem uma ação explícita; "Agora não" vale só nesta sessão.
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
  // Quem tinha o foco quando a faixa apareceu (ex.: o campo URL da imagem).
  const previous = useRef<Element | null>(null);
  useLayoutEffect(() => {
    previous.current = focusInBanner() ? null : captureFocusOrigin().opener;
  }, [visible]);
  if (!visible) return null;
  const origins = pending.map((o) => o.origin);
  // Ao fechar com o foco na faixa, ele volta a quem o tinha (se ainda está no DOM) ou ao
  // canvas, ainda com a faixa no DOM: nunca ao `body`. Foco fora da faixa: nada é mexido.
  const close = (action: (origins: readonly string[]) => void) => () => {
    const inside = focusInBanner();
    action(origins);
    if (inside && !tryFocus(previous.current)) focusCanvasArea();
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
