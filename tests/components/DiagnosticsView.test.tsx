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
import { SCHEMA_VERSION } from '../../src/model';
import { EditorContext } from '../../src/ui/EditorContext';
import { BUILD_ID } from '../../src/utils/build';
import { clearReportedErrors, reportError } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

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
  it('sem erros, avisa e não oferece limpar', () => {
    render(<Diagnostics />);
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('diagnostics.clear') })
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

describe('Diagnóstico: o texto copiado identifica o ambiente', () => {
  function mockClipboard() {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  }

  it('cabeçalho com build, canal, schema, armazenamento e contagens, sem nomes', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    reportError('local.open', new Error('bloqueado'));
    const harness = createHarness(sampleProject());
    const project = harness.project();
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    const text = writeText.mock.calls[0]?.[0] ?? '';
    expect(text).toContain(`build: ${BUILD_ID}`);
    expect(text).toContain('channel: main');
    expect(text).toContain(`schema: ${SCHEMA_VERSION}`);
    expect(text).toContain('storage: folder');
    expect(text).toContain(`userAgent: ${navigator.userAgent}`);
    expect(text).toContain(`window: ${window.innerWidth}x${window.innerHeight}`);
    expect(text).toContain('language: ');
    expect(text).toContain('theme: ');
    expect(text).toContain(
      `images: ${project.images.length}, markings: ${project.markings.length}, annotations: ${project.annotations.length}`,
    );
    expect(text).toContain('pendingSave: no');
    // O cabeçalho vem antes dos erros.
    expect(text.indexOf('build: ')).toBeLessThan(text.indexOf('[local.open] bloqueado'));
    // Privacidade: nem nome do projeto nem caminhos de imagem.
    expect(text).not.toContain(project.name);
    for (const image of project.images) expect(text).not.toContain(image.file);
  });

  it('sem erros, Copiar leva o cabeçalho (para relatar um problema sem erro)', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<Diagnostics />);
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`build: ${BUILD_ID}`));
  });
});
