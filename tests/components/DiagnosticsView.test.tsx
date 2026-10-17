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

/** Registro com Copiar e Limpar, como no cabeçalho da janela. */
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

  // Etapa 6 (6.4), achado 6: Hora e Contexto não quebram no meio ("22:3" / "3:36").
  it('Hora e Contexto ficam numa linha só', () => {
    reportError('open.repair', new Error('falhou'));
    render(<Diagnostics />);
    const time = screen.getByText((_, el) => el?.tagName === 'TIME');
    expect(time.closest('td')?.classList.contains('diagnostics-nowrap')).toBe(true);
    expect(
      screen
        .getByText('open.repair')
        .closest('td')
        ?.classList.contains('diagnostics-nowrap'),
    ).toBe(true);
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
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
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
    expect(text).not.toContain(project.project.name);
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

describe('Diagnóstico: biblioteca', () => {
  const issues = new Map([
    [
      'sdui',
      [
        {
          file: 'components/button.json',
          path: 'root.children[0]',
          message: 'conteúdo maior que a caixa',
          severity: 'warning' as const,
        },
        {
          file: 'sdui.spec.json',
          path: 'layers[0].annotationTypes[1].component',
          message: 'arquivo não encontrado: components/fab.json',
          severity: 'error' as const,
        },
      ],
    ],
  ]);

  it('lista erros e avisos por especialização, com arquivo, caminho e mensagem', () => {
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: t('diagnostics.library') })).toBeTruthy();
    expect(screen.getByText('components/button.json')).toBeTruthy();
    expect(screen.getByText('layers[0].annotationTypes[1].component')).toBeTruthy();
    expect(screen.getByText('conteúdo maior que a caixa')).toBeTruthy();
    expect(screen.getByText(t('library.error'))).toBeTruthy();
    expect(screen.getByText(t('library.warning'))).toBeTruthy();
    // O registro de erros continua no estado vazio.
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });

  it('sem problemas na biblioteca, a seção não aparece', () => {
    const harness = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.queryByRole('heading', { name: t('diagnostics.library') })).toBeNull();
  });

  it('o Copiar não leva os problemas da biblioteca nem muda o cabeçalho', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    const text = writeText.mock.calls[0]?.[0] ?? '';
    expect(text).toContain('pendingSave: no');
    expect(text).not.toContain('conteúdo maior que a caixa');
  });
});
