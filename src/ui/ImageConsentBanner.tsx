import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { allowOrigins, dismissOrigins } from '../store/imagePermissions';
import type { RemoteImageOrigin } from '../store/derived';
import { Button } from './controls';
import { Notice } from './Notice';
import { useEditor } from './EditorContext';
import { captureFocusOrigin, FOCUSABLE } from './focus';
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
  // Quem tinha o foco quando a faixa apareceu (ex.: o campo URL da imagem), e o `id` dele:
  // o campo pode ser trocado por outro (`input` ↔ `textarea`, URL com mais de 60 caracteres).
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
    // Enquanto a faixa está aberta, acompanha o foco fora dela: o campo trocado pega o foco
    // depois de a faixa aparecer.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const inBanner = target === dismissRef.current || target === allowRef.current;
      if (target instanceof Element && !inBanner) remember(target);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [visible]);
  // O campo foi trocado e o novo não recebeu o foco: acha-o pelo mesmo `id`, ao lado do antigo.
  const target = (): Element | null => {
    if (previous.current?.isConnected || previousId.current === '')
      return previous.current;
    const found = [...(previousParent.current?.querySelectorAll(FOCUSABLE) ?? [])];
    return found.find((el) => el.id === previousId.current) ?? null;
  };
  if (!visible) return null;
  const origins = pending.map((o) => o.origin);
  // Ao fechar com o foco na faixa, ele volta a quem o tinha (se ainda está no DOM) ou ao
  // canvas, ainda com a faixa no DOM: nunca ao `body`. Foco fora da faixa: nada é mexido.
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
