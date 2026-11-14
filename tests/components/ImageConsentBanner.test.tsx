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

describe('remote images consent banner', () => {
  it('without pending origins, it does not appear', () => {
    renderBanner();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lists the origins in full, marking http and local network, and does not allow by itself', () => {
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

  it('Allow these saves the origins in this browser', async () => {
    const user = userEvent.setup();
    pending.value = [
      { origin: 'https://a.com', local: false, insecure: false },
      { origin: 'https://b.com', local: false, insecure: false },
    ];
    renderBanner();
    await user.click(screen.getByRole('button', { name: t('imageConsent.allow') }));
    expect(allowedOrigins.value).toEqual(['https://a.com', 'https://b.com']);
  });

  it('Not now dismisses only for the session, without saving a permission', async () => {
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

// NE1 (#538, item 3): closing the banner returns the focus to whoever had it when it appeared.
describe('focus when closing the consent banner', () => {
  let field: HTMLInputElement;
  let canvas: HTMLElement;

  /** The field already has the focus when the banner appears (the R15.3 case). */
  function appear(origin = 'https://a.com') {
    renderBanner();
    field.focus();
    act(() => {
      pending.value = [{ origin, local: false, insecure: false }];
    });
  }

  let stopFilter: () => void;

  beforeEach(() => {
    // Like the real derived state: a dismissed or allowed origin leaves the pending list.
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
    '%s returns the focus to the field, never to the body',
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

  it('without the field in the DOM, the focus goes to the canvas', async () => {
    const user = userEvent.setup();
    appear();
    field.remove();
    await user.click(screen.getByRole('button', { name: t('imageConsent.dismiss') }));
    expect(document.activeElement).toBe(canvas);
  });

  // CL1 (#1144): a URL longer than 60 characters swaps the field from `input` to `textarea`
  // (same id) while the banner is open; the focus returns to the new field, not to the canvas.
  it.each([
    ['with the focus already on the new field', true],
    ['with the new field still unfocused', false],
  ] as const)('field swapped for a textarea %s', async (_name, focusNew) => {
    const user = userEvent.setup();
    field.id = 'image-url';
    appear();
    const area = document.createElement('textarea');
    area.id = 'image-url';
    field.replaceWith(area);
    if (focusNew) area.focus();
    await user.click(screen.getByRole('button', { name: t('imageConsent.dismiss') }));
    expect(document.activeElement).toBe(area);
    area.remove();
  });

  it('if the focus was not on the banner, nothing is touched', () => {
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
