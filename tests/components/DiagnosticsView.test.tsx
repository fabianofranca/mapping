import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { createAutoSaver } from '../../src/storage/autosave';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../../src/ui/DiagnosticsView';
import { clearReportedErrors, reportError } from '../../src/utils/report';

beforeEach(() => {
  clearReportedErrors();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Registro com Copiar e Limpar, como no cabeçalho da janela (desktop e celular). */
function Diagnostics() {
  return (
    <>
      <DiagnosticsActions {...useCopyErrors()} />
      <DiagnosticsView />
    </>
  );
}

describe('Diagnóstico: registro, Copiar e Limpar', () => {
  it('sem erros, avisa e não oferece copiar', () => {
    render(<Diagnostics />);
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('diagnostics.copy') })
        .disabled,
    ).toBe(true);
  });

  it('um erro forçado de gravação aparece na lista', async () => {
    vi.useFakeTimers();
    const saver = createAutoSaver(async () => {
      throw new Error('sem permissão de escrita');
    }, 100);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(saver.status.value).toBe('error');
    vi.useRealTimers();

    render(<Diagnostics />);
    expect(screen.getByText('save')).toBeTruthy();
    expect(screen.getByText('sem permissão de escrita')).toBeTruthy();
  });

  it('copia a lista como texto e permite limpar', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    reportError('local.open', new Error('bloqueado'));
    render(<Diagnostics />);

    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('[local.open] bloqueado'),
    );
    expect(screen.getByText(t('diagnostics.copied'))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t('diagnostics.clear') }));
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });
});
