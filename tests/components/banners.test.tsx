import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { previewBannerDismissed } from '../../src/store/banners';

const channel = vi.hoisted(() => ({ isPreview: true }));

vi.mock('../../src/utils/channel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/channel')>()),
  get isPreview() {
    return channel.isPreview;
  },
}));

import { PreviewBadge, PreviewBanner } from '../../src/ui/PreviewBanner';

beforeEach(() => {
  channel.isPreview = true;
  previewBannerDismissed.value = false;
});
afterEach(cleanup);

describe('canal de preview (B9, P8)', () => {
  it('selo PREVIEW sempre na barra, mesmo com a faixa dispensada', async () => {
    render(
      <>
        <PreviewBadge />
        <PreviewBanner />
      </>,
    );
    expect(screen.getByText(t('pwa.previewBadge'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText(t('pwa.previewBadge'))).toBeTruthy();
  });

  it('a faixa mostra o aviso e pode ser dispensada na sessão', async () => {
    const { rerender } = render(<PreviewBanner />);
    expect(screen.getByRole('note').textContent).toContain(t('pwa.previewBanner'));
    await userEvent.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(previewBannerDismissed.value).toBe(true);
    expect(screen.queryByRole('note')).toBeNull();
    // Montar de novo (ex.: voltar à tela inicial) mantém dispensada.
    rerender(<PreviewBanner />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('na versão principal não aparece nada', () => {
    channel.isPreview = false;
    render(
      <>
        <PreviewBadge />
        <PreviewBanner />
      </>,
    );
    expect(screen.queryByText(t('pwa.previewBadge'))).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
