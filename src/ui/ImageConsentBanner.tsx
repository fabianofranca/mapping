import { t } from '../i18n';
import { allowOrigins, dismissOrigins } from '../store/imagePermissions';
import type { RemoteImageOrigin } from '../store/derived';
import { Button } from './controls';
import { Notice } from './Notice';
import { useEditor } from './EditorContext';

/** A origem por extenso, marcando `http` ("sem criptografia") e rede local. */
export function describeImageOrigin(item: RemoteImageOrigin): string {
  const marks = [
    item.insecure ? t('imageConsent.insecure') : null,
    item.local ? t('imageConsent.local') : null,
  ].filter((mark): mark is string => mark !== null);
  return marks.length === 0 ? item.origin : `${item.origin} (${marks.join(', ')})`;
}

/**
 * Faixa de consentimento das imagens remotas: aparece quando o projeto à vista usa origens
 * sem permissão. Nada é permitido sem uma ação explícita; "Agora não" vale só nesta sessão.
 */
export function ImageConsentBanner() {
  const { derived } = useEditor();
  const pending = derived.pendingImageOrigins.value;
  if (pending.length === 0) return null;
  const origins = pending.map((o) => o.origin);
  return (
    <Notice
      tone="warning"
      class="image-consent"
      actions={
        <>
          <Button size="sm" onClick={() => dismissOrigins(origins)}>
            {t('imageConsent.dismiss')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => allowOrigins(origins)}>
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
