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

describe('preview channel (B9, P8)', () => {
  it('PREVIEW badge always in the bar, even with the banner dismissed', async () => {
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

  it('the banner shows the notice and can be dismissed for the session', async () => {
    const { rerender } = render(<PreviewBanner />);
    expect(screen.getByRole('note').textContent).toContain(t('pwa.previewBanner'));
    await userEvent.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(previewBannerDismissed.value).toBe(true);
    expect(screen.queryByRole('note')).toBeNull();
    // Mounting again (e.g. going back to the home screen) keeps it dismissed.
    rerender(<PreviewBanner />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('on the main version nothing shows up', () => {
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
