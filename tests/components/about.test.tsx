import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { SCHEMA_VERSION } from '../../src/model';
import { SettingsDialog } from '../../src/ui/SettingsDialog';
import { BUILD_ID } from '../../src/utils/build';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Configurações › Sobre', () => {
  it('mostra build, canal e schema, e copia os três', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);

    const about = screen.getByRole('region', { name: t('about.title') });
    expect(within(about).getByText(BUILD_ID)).toBeTruthy();
    expect(within(about).getByText(t('status.channelMain'))).toBeTruthy();
    expect(within(about).getByText(String(SCHEMA_VERSION))).toBeTruthy();

    await user.click(within(about).getByRole('button', { name: t('about.copy') }));
    expect(writeText).toHaveBeenCalledWith(
      `build: ${BUILD_ID}\nchannel: main\nschema: ${SCHEMA_VERSION}`,
    );
    expect(within(about).getByText(t('diagnostics.copied'))).toBeTruthy();
  });
});
