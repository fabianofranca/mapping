import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import {
  clearRemoteImageIssues,
  reportRemoteImageIssue,
} from '../../src/store/diagnostics';
import { createAutoSaver } from '../../src/storage/autosave';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../../src/ui/DiagnosticsView';
import { SCHEMA_VERSION } from '../../src/model';
import { locale } from '../../src/store/settings';
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
      `containers: ${project.containers.length}, markings: ${project.markings.length}, annotations: ${project.annotations.length}`,
    );
    expect(text).toContain('pendingSave: no');
    // O cabeçalho vem antes dos erros.
    expect(text.indexOf('build: ')).toBeLessThan(text.indexOf('[local.open] bloqueado'));
    // Privacidade: nem nome do projeto nem caminhos de imagem.
    expect(text).not.toContain(project.project.name);
    for (const image of project.containers) expect(text).not.toContain(image.file);
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

describe('Diagnóstico: imagens remotas', () => {
  it('lista as falhas e bloqueios com a URL encurtada e o motivo; só some com a sessão', () => {
    clearRemoteImageIssues();
    render(<Diagnostics />);
    expect(
      screen.queryByRole('region', { name: t('diagnostics.remoteImages') }),
    ).toBeNull();
    act(() => {
      reportRemoteImageIssue(
        'https://cdn.a.com/img/x.png?token=segredo#f',
        'blocked-consent',
      );
      reportRemoteImageIssue('https://cdn.a.com/img/x.png?token=segredo#f', 'failed');
      reportRemoteImageIssue('https://b.com/y.png', 'timeout');
    });
    const section = screen.getByRole('region', { name: t('diagnostics.remoteImages') });
    expect(section.textContent).toContain('https://cdn.a.com/img/x.png');
    expect(section.textContent).not.toContain('segredo');
    // A mesma URL aparece uma vez, com a razão mais recente (R15.9: "endereço não aceito"
    // vira "não carregou" quando a pessoa liga o interruptor e o pedido sai).
    expect(section.textContent).not.toContain(
      t('diagnostics.imageReason.blocked-consent'),
    );
    expect(section.textContent).toContain(t('diagnostics.imageReason.failed'));
    expect(section.textContent).toContain(t('diagnostics.imageReason.timeout'));
    expect(section.querySelectorAll('li')).toHaveLength(2);
    clearRemoteImageIssues();
  });

  it('troca a razão no lugar quando a mesma URL passa de "não aceito" a "não carregou"', () => {
    clearRemoteImageIssues();
    render(<Diagnostics />);
    act(() => {
      reportRemoteImageIssue('http://127.0.0.1:8765/foto.png', 'invalid');
      reportRemoteImageIssue('https://b.com/y.png', 'timeout');
      reportRemoteImageIssue('http://127.0.0.1:8765/foto.png', 'failed');
      reportRemoteImageIssue('http://127.0.0.1:8765/foto.png', 'failed');
    });
    const section = screen.getByRole('region', { name: t('diagnostics.remoteImages') });
    const rows = [...section.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('http://127.0.0.1:8765/foto.png');
    expect(rows[0]).toContain(t('diagnostics.imageReason.failed'));
    expect(rows[0]).not.toContain(t('diagnostics.imageReason.invalid'));
    expect(rows[1]).toContain('https://b.com/y.png');
    clearRemoteImageIssues();
  });
});

describe('Diagnóstico: pacote grande demais em en-US', () => {
  it('o problema TOO_BIG aparece traduzido', () => {
    locale.value = 'en-US';
    const issues = new Map([
      [
        'sdui',
        [
          {
            file: '',
            path: '',
            message:
              'pacote grande demais para conferir (limite de arquivos ou de bytes)',
            severity: 'error' as const,
            code: 'package-too-big' as const,
          },
        ],
      ],
    ]);
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.getByText(/package too big to check/)).toBeTruthy();
    expect(screen.queryByText(/grande demais/)).toBeNull();
    locale.value = 'pt-BR';
  });
});

describe('Diagnóstico: arquivo não encontrado em en-US', () => {
  it('a mensagem sai traduzida, sem o texto fixo em português', () => {
    locale.value = 'en-US';
    const issues = new Map([
      [
        'sdui',
        [
          {
            file: 'sdui.spec.json',
            path: 'layers[2].annotationTypes[1].component',
            message: 'arquivo não encontrado: components/button.json',
            severity: 'error' as const,
            code: 'file-not-found' as const,
            target: 'components/button.json',
          },
        ],
      ],
    ]);
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.getByText(/file not found: components\/button\.json/)).toBeTruthy();
    expect(screen.queryByText(/não encontrado/)).toBeNull();
    locale.value = 'pt-BR';
  });
});

describe('Diagnóstico: exemplo com linhas de table (decisão 24 da #897)', () => {
  const issues = new Map([
    [
      'abas',
      [
        {
          file: 'abas.spec.json',
          path: 'layers[0].annotationTypes[0].examples[0].values.rows',
          message: 'campo "table" aceita só a lista de linhas',
          severity: 'error' as const,
          code: 'example-table-needs-rows' as const,
        },
        {
          file: 'abas.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[0].nada',
          message: '"nada" não é coluna de "rows"',
          severity: 'error' as const,
          code: 'example-not-column' as const,
          params: { key: 'nada', field: 'rows' },
        },
        {
          file: 'abas.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[1]',
          message: 'deve ser um objeto (coluna → valor)',
          severity: 'error' as const,
          code: 'example-row-not-object' as const,
        },
        {
          file: 'abas.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[2].to',
          message: 'coluna "ref" não aceita valor em exemplo',
          severity: 'error' as const,
          code: 'example-ref-cell' as const,
        },
      ],
    ],
  ]);
  const renderList = () => {
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
  };

  it('em English (US), os quatro problemas saem traduzidos', () => {
    locale.value = 'en-US';
    renderList();
    expect(screen.getByText('a "table" field takes only the list of rows')).toBeTruthy();
    expect(screen.getByText('"nada" is not a column of "rows"')).toBeTruthy();
    expect(screen.getByText('must be an object (column → value)')).toBeTruthy();
    expect(screen.getByText('a "ref" column takes no value in an example')).toBeTruthy();
    expect(screen.queryByText(/aceita só/)).toBeNull();
    locale.value = 'pt-BR';
  });

  it('em Português, os quatro problemas saem em português', () => {
    locale.value = 'pt-BR';
    renderList();
    expect(screen.getByText('campo "table" aceita só a lista de linhas')).toBeTruthy();
    expect(screen.getByText('"nada" não é coluna de "rows"')).toBeTruthy();
    expect(screen.getByText('deve ser um objeto (coluna → valor)')).toBeTruthy();
    expect(screen.getByText('coluna "ref" não aceita valor em exemplo')).toBeTruthy();
  });
});

// Fase 1 da #954 (item 7): o "Copiado" volta ao normal e não sobra para um registro vazio.
describe('Diagnóstico: o resultado da cópia some sozinho', () => {
  function mockWrite() {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  }

  it('o "Copiado" volta a vazio depois de 2 s', async () => {
    vi.useFakeTimers();
    mockWrite();
    reportError('local.open', new Error('bloqueado'));
    render(<Diagnostics />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('status').textContent).toBe(t('diagnostics.copied'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('Copiar e depois Limpar não deixa "Copiado" para um registro vazio', async () => {
    vi.useFakeTimers();
    mockWrite();
    reportError('local.open', new Error('bloqueado'));
    render(<Diagnostics />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('diagnostics.clear') }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
