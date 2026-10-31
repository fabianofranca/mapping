import { signal } from '@preact/signals';
import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { RemoteImageOrigin } from '../../src/store/derived';
import {
  allowedOrigins,
  dismissedOrigins,
  dismissOrigins,
  revokeOrigin,
} from '../../src/store/imagePermissions';
import { IMAGE_ORIGINS_KEY } from '../../src/storage/imagePermissions';
import { channelStorageKey } from '../../src/utils/channel';
import { EditorContext, type EditorContextValue } from '../../src/ui/EditorContext';
import { ImageConsentBanner } from '../../src/ui/ImageConsentBanner';

const pending = signal<readonly RemoteImageOrigin[]>([]);
const context = {
  derived: { pendingImageOrigins: pending },
} as unknown as EditorContextValue;

function renderBanner() {
  return render(
    <EditorContext.Provider value={context}>
      <ImageConsentBanner />
    </EditorContext.Provider>,
  );
}

beforeEach(() => {
  pending.value = [];
  for (const o of allowedOrigins.peek()) revokeOrigin(o);
  localStorage.clear();
});
afterEach(cleanup);

describe('faixa de consentimento de imagens remotas', () => {
  it('sem origens pendentes, não aparece', () => {
    renderBanner();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lista as origens por extenso, marcando http e rede local, e não permite sozinha', () => {
    pending.value = [
      { origin: 'https://cdn.a.com', local: false, insecure: false },
      { origin: 'http://b.com', local: false, insecure: true },
      { origin: 'https://nas.local', local: true, insecure: false },
    ];
    renderBanner();
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('https://cdn.a.com');
    expect(text).toContain(`http://b.com (${t('imageConsent.insecure')})`);
    expect(text).toContain(`https://nas.local (${t('imageConsent.local')})`);
    expect(text).toContain(
      t('imageConsent.message', { origins: 'x' }).split('x')[1] ?? '',
    );
    expect(allowedOrigins.value).toEqual([]);
  });

  it('Permitir estas grava as origens neste navegador', async () => {
    const user = userEvent.setup();
    pending.value = [
      { origin: 'https://a.com', local: false, insecure: false },
      { origin: 'https://b.com', local: false, insecure: false },
    ];
    renderBanner();
    await user.click(screen.getByRole('button', { name: t('imageConsent.allow') }));
    expect(allowedOrigins.value).toEqual(['https://a.com', 'https://b.com']);
  });

  it('Agora não dispensa só na sessão, sem gravar permissão', async () => {
    const user = userEvent.setup();
    pending.value = [{ origin: 'https://a.com', local: false, insecure: false }];
    renderBanner();
    await user.click(screen.getByRole('button', { name: t('imageConsent.dismiss') }));
    expect(allowedOrigins.value).toEqual([]);
    expect(dismissedOrigins.value.has('https://a.com')).toBe(true);
    expect(localStorage.getItem(channelStorageKey(IMAGE_ORIGINS_KEY))).toBeNull();
    dismissOrigins([]);
  });
});
