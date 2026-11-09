import { effect, signal } from '@preact/signals';
import { act, cleanup, render, screen } from '@testing-library/preact';
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

// NE1 (#538, item 3): fechar a faixa devolve o foco a quem o tinha quando ela apareceu.
describe('foco ao fechar a faixa de consentimento', () => {
  let field: HTMLInputElement;
  let canvas: HTMLElement;

  /** O campo já tem o foco quando a faixa aparece (o caso do R15.3). */
  function appear(origin = 'https://a.com') {
    renderBanner();
    field.focus();
    act(() => {
      pending.value = [{ origin, local: false, insecure: false }];
    });
  }

  let stopFilter: () => void;

  beforeEach(() => {
    // Como o derivado real: origem dispensada ou permitida sai da lista de pendentes.
    stopFilter = effect(() => {
      const dismissed = dismissedOrigins.value;
      const allowed = allowedOrigins.value;
      pending.value = pending
        .peek()
        .filter((o) => !dismissed.has(o.origin) && !allowed.includes(o.origin));
    });
    field = document.createElement('input');
    canvas = document.createElement('main');
    canvas.tabIndex = -1;
    canvas.setAttribute('data-canvas-area', '');
    document.body.append(field, canvas);
  });
  afterEach(() => {
    stopFilter();
    field.remove();
    canvas.remove();
  });

  it.each(['imageConsent.dismiss', 'imageConsent.allow'] as const)(
    '%s devolve o foco ao campo, nunca ao body',
    async (key) => {
      const user = userEvent.setup();
      for (let i = 0; i < 3; i += 1) {
        appear(`https://a${i}.com`);
        expect(document.activeElement).toBe(field);
        await user.click(screen.getByRole('button', { name: t(key) }));
        expect(screen.queryByRole('status')).toBeNull();
        expect(document.activeElement).toBe(field);
        expect(document.activeElement).not.toBe(document.body);
        cleanup();
      }
    },
  );

  it('sem o campo no DOM, o foco vai ao canvas', async () => {
    const user = userEvent.setup();
    appear();
    field.remove();
    await user.click(screen.getByRole('button', { name: t('imageConsent.dismiss') }));
    expect(document.activeElement).toBe(canvas);
  });

  it('se o foco não estava na faixa, nada é mexido', () => {
    appear();
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    act(() => {
      pending.value = [];
    });
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
