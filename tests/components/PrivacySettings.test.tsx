import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import {
  allowAnyOrigin,
  allowHttp,
  allowLocalNetwork,
  allowNoCors,
  allowOrigins,
  allowedOrigins,
  revokeOrigin,
  setAllowAnyOrigin,
  setAllowHttp,
  setAllowLocalNetwork,
  setAllowNoCors,
} from '../../src/store/imagePermissions';
import { SettingsDialog } from '../../src/ui/SettingsDialog';

beforeEach(() => {
  localStorage.clear();
  for (const o of allowedOrigins.peek()) revokeOrigin(o);
  setAllowAnyOrigin(false);
  setAllowHttp(false);
  setAllowLocalNetwork(false);
  setAllowNoCors(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () => render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
const privacy = () => screen.getByRole('region', { name: t('privacy.title') });

describe('Configurações › Privacidade', () => {
  it('sem origens, diz que não há; os quatro interruptores começam desligados com o aviso', () => {
    open();
    expect(within(privacy()).getByText(t('privacy.noOrigins'))).toBeTruthy();
    const boxes = within(privacy()).getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    for (const key of [
      'privacy.anyOriginWarning',
      'privacy.httpWarning',
      'privacy.localNetworkWarning',
      'privacy.noCorsWarning',
    ] as const) {
      expect(within(privacy()).getByText(t(key))).toBeTruthy();
    }
  });

  it('lista as origens e Revogar remove a origem', async () => {
    const user = userEvent.setup();
    allowOrigins(['https://a.com', 'http://a.com']);
    open();
    expect(within(privacy()).getByText('https://a.com')).toBeTruthy();
    expect(within(privacy()).getByText('http://a.com')).toBeTruthy();
    await user.click(
      within(privacy()).getByRole('button', {
        name: t('privacy.revokeOrigin', { origin: 'https://a.com' }),
      }),
    );
    expect(allowedOrigins.value).toEqual(['http://a.com']);
    expect(within(privacy()).queryByText('https://a.com')).toBeNull();
  });

  it('cada interruptor liga o seu sinal e grava', async () => {
    const user = userEvent.setup();
    open();
    await user.click(
      within(privacy()).getByRole('checkbox', { name: t('privacy.anyOrigin') }),
    );
    await user.click(
      within(privacy()).getByRole('checkbox', { name: t('privacy.http') }),
    );
    await user.click(
      within(privacy()).getByRole('checkbox', { name: t('privacy.localNetwork') }),
    );
    await user.click(
      within(privacy()).getByRole('checkbox', { name: t('privacy.noCors') }),
    );
    expect([
      allowAnyOrigin.value,
      allowHttp.value,
      allowLocalNetwork.value,
      allowNoCors.value,
    ]).toEqual([true, true, true, true]);
  });

  it('o Sobre mostra quantas origens estão permitidas e o Copiar leva a linha', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    allowOrigins(['https://a.com', 'https://b.com']);
    open();
    const about = screen.getByRole('region', { name: t('about.title') });
    expect(
      within(about).getByText(t('about.remoteImagesValue', { count: 2 })),
    ).toBeTruthy();
    await user.click(within(about).getByRole('button', { name: t('about.copy') }));
    expect(writeText.mock.calls[0]?.[0]).toContain('remoteImages: 2 allowed origins');
  });
});
