import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import {
  clearRemoteImageIssues,
  reportRemoteImageIssue,
} from '../../src/store/diagnostics';
import { createAutoSaver } from '../../src/storage/autosave';
import type { ProjectSession } from '../../src/store/session';
import { createFolderCalls } from '../../src/storage/folderCalls';
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
  locale.value = 'en-US';
  clearReportedErrors();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Log with Copy and Clear, as in the window header. */
function Diagnostics() {
  return (
    <>
      <DiagnosticsActions {...useCopyErrors()} />
      <DiagnosticsView />
    </>
  );
}

describe('Diagnostics: log, Copy and Clear', () => {
  it('with no errors, it says so and does not offer clearing', () => {
    render(<Diagnostics />);
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('diagnostics.clear') })
        .disabled,
    ).toBe(true);
  });

  it('a forced save error appears in the list', async () => {
    vi.useFakeTimers();
    const saver = createAutoSaver(async () => {
      throw new Error('no write permission');
    }, 100);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(saver.status.value).toBe('error');
    vi.useRealTimers();

    render(<Diagnostics />);
    expect(screen.getByText('save')).toBeTruthy();
    expect(screen.getByText('no write permission')).toBeTruthy();
  });

  // Stage 6 (6.4), finding 6: Time and Context do not break in the middle ("22:3" / "3:36").
  it('Time and Context stay on a single line', () => {
    reportError('open.repair', new Error('failed'));
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

  it('copies the list as text and allows clearing', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    reportError('local.open', new Error('blocked'));
    render(<Diagnostics />);

    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('[local.open] blocked'),
    );
    expect(screen.getByText(t('diagnostics.copied'))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t('diagnostics.clear') }));
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });
});

describe('Diagnostics: the copied text identifies the environment', () => {
  function mockClipboard() {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  }

  it('header with build, channel, schema, storage and counts, without names', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    reportError('local.open', new Error('blocked'));
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
    // The header comes before the errors.
    expect(text.indexOf('build: ')).toBeLessThan(text.indexOf('[local.open] blocked'));
    // Privacy: neither the project name nor image paths.
    expect(text).not.toContain(project.project.name);
    for (const image of project.containers) expect(text).not.toContain(image.file);
  });

  it('in a folder, the folder: line carries the measured operations; without a counter (outside a folder), there is no line', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    const harness = createHarness(sampleProject());
    const calls = createFolderCalls();
    const withCalls: ProjectSession = { ...harness.context.session, folderCalls: calls };
    const Copy = ({ session }: { session: ProjectSession }) => (
      <EditorContext.Provider value={{ ...harness.context, session }}>
        <Diagnostics />
      </EditorContext.Provider>
    );

    const view = render(<Copy session={withCalls} />);
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText.mock.calls[0]?.[0]).toContain('\nfolder: no measurements\n');

    await calls.measure('open', async () => undefined);
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText.mock.calls[1]?.[0]).toMatch(/\nfolder: open 0 calls \d+ ms\n/);

    view.unmount();
    render(<Copy session={{ ...withCalls, folderCalls: null }} />);
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText.mock.calls[2]?.[0]).not.toContain('folder:');
  });

  it('with no errors, Copy carries the header (to report a problem without an error)', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<Diagnostics />);
    await user.click(screen.getByRole('button', { name: t('diagnostics.copy') }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`build: ${BUILD_ID}`));
  });
});

describe('Diagnostics: library', () => {
  const issues = new Map([
    [
      'sdui',
      [
        {
          file: 'components/button.json',
          path: 'root.children[0]',
          message: 'content larger than the box',
          severity: 'warning' as const,
        },
        {
          file: 'sdui.spec.json',
          path: 'layers[0].annotationTypes[1].component',
          // pt-BR kept: raw pt-BR fallback message of the model issue, only input data
          message: 'arquivo não encontrado: components/fab.json',
          severity: 'error' as const,
        },
      ],
    ],
  ]);

  it('lists errors and warnings per specialization, with file, path and message', () => {
    const harness = createHarness(sampleProject(), false, { libraryIssues: issues });
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: t('diagnostics.library') })).toBeTruthy();
    expect(screen.getByText('components/button.json')).toBeTruthy();
    expect(screen.getByText('layers[0].annotationTypes[1].component')).toBeTruthy();
    expect(screen.getByText('content larger than the box')).toBeTruthy();
    expect(screen.getByText(t('library.error'))).toBeTruthy();
    expect(screen.getByText(t('library.warning'))).toBeTruthy();
    // The error log stays in the empty state.
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });

  it('with no library problems, the section does not appear', () => {
    const harness = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={harness.context}>
        <Diagnostics />
      </EditorContext.Provider>,
    );
    expect(screen.queryByRole('heading', { name: t('diagnostics.library') })).toBeNull();
  });

  it('Copy does not carry the library problems nor change the header', async () => {
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
    expect(text).not.toContain('content larger than the box');
  });
});

describe('Diagnostics: remote images', () => {
  it('lists the failures and blocks with the shortened URL and the reason; it only goes away with the session', () => {
    clearRemoteImageIssues();
    render(<Diagnostics />);
    expect(
      screen.queryByRole('region', { name: t('diagnostics.remoteImages') }),
    ).toBeNull();
    act(() => {
      reportRemoteImageIssue(
        'https://cdn.a.com/img/x.png?token=secret#f',
        'blocked-consent',
      );
      reportRemoteImageIssue('https://cdn.a.com/img/x.png?token=secret#f', 'failed');
      reportRemoteImageIssue('https://b.com/y.png', 'timeout');
    });
    const section = screen.getByRole('region', { name: t('diagnostics.remoteImages') });
    expect(section.textContent).toContain('https://cdn.a.com/img/x.png');
    expect(section.textContent).not.toContain('secret');
    // The same URL appears once, with the most recent reason (R15.9: "address not accepted"
    // becomes "did not load" when the person turns the switch on and the request goes out).
    expect(section.textContent).not.toContain(
      t('diagnostics.imageReason.blocked-consent'),
    );
    expect(section.textContent).toContain(t('diagnostics.imageReason.failed'));
    expect(section.textContent).toContain(t('diagnostics.imageReason.timeout'));
    expect(section.querySelectorAll('li')).toHaveLength(2);
    clearRemoteImageIssues();
  });

  it('swaps the reason in place when the same URL goes from "not accepted" to "did not load"', () => {
    clearRemoteImageIssues();
    render(<Diagnostics />);
    act(() => {
      reportRemoteImageIssue('http://127.0.0.1:8765/photo.png', 'invalid');
      reportRemoteImageIssue('https://b.com/y.png', 'timeout');
      reportRemoteImageIssue('http://127.0.0.1:8765/photo.png', 'failed');
      reportRemoteImageIssue('http://127.0.0.1:8765/photo.png', 'failed');
    });
    const section = screen.getByRole('region', { name: t('diagnostics.remoteImages') });
    const rows = [...section.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('http://127.0.0.1:8765/photo.png');
    expect(rows[0]).toContain(t('diagnostics.imageReason.failed'));
    expect(rows[0]).not.toContain(t('diagnostics.imageReason.invalid'));
    expect(rows[1]).toContain('https://b.com/y.png');
    clearRemoteImageIssues();
  });
});

describe('Diagnostics: package too big in en-US', () => {
  it('the TOO_BIG problem appears translated', () => {
    const issues = new Map([
      [
        'sdui',
        [
          {
            file: '',
            path: '',
            // pt-BR kept: raw pt-BR fallback message; the test asserts it is NOT shown in en-US
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
    // pt-BR kept: asserts that the Portuguese text is absent in en-US
    expect(screen.queryByText(/grande demais/)).toBeNull();
  });
});

describe('Diagnostics: file not found in en-US', () => {
  it('the message comes out translated, without the fixed Portuguese text', () => {
    const issues = new Map([
      [
        'sdui',
        [
          {
            file: 'sdui.spec.json',
            path: 'layers[2].annotationTypes[1].component',
            // pt-BR kept: raw pt-BR fallback message; the test asserts it is NOT shown in en-US
            message: 'arquivo não encontrado: components/button.json',
            severity: 'error' as const,
            code: 'library.fileNotFound' as const,
            params: { path: 'components/button.json' },
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
    // pt-BR kept: asserts that the Portuguese text is absent in en-US
    expect(screen.queryByText(/não encontrado/)).toBeNull();
  });
});

describe('Diagnostics: example with table rows (decision 24 of #897)', () => {
  const issues = new Map([
    [
      'tabs',
      [
        {
          file: 'tabs.spec.json',
          path: 'layers[0].annotationTypes[0].examples[0].values.rows',
          message: 'campo "table" aceita só a lista de linhas',
          severity: 'error' as const,
          code: 'spec.exampleTableNeedsRows' as const,
        },
        {
          file: 'tabs.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[0].nada',
          message: '"nada" não é coluna de "rows"',
          severity: 'error' as const,
          code: 'spec.exampleNotColumn' as const,
          params: { key: 'nada', field: 'rows' },
        },
        {
          file: 'tabs.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[1]',
          message: 'deve ser um objeto (coluna → valor)',
          severity: 'error' as const,
          code: 'spec.exampleRowNotObject' as const,
        },
        {
          file: 'tabs.spec.json',
          path: 'layers[0].annotationTypes[0].examples[1].values.rows[2].to',
          message: 'coluna "ref" não aceita valor em exemplo',
          severity: 'error' as const,
          code: 'spec.exampleRefCell' as const,
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

  it('in English (US), the four problems come out translated', () => {
    renderList();
    expect(screen.getByText('a "table" field takes only the list of rows')).toBeTruthy();
    expect(screen.getByText('"nada" is not a column of "rows"')).toBeTruthy();
    expect(screen.getByText('must be an object (column → value)')).toBeTruthy();
    expect(screen.getByText('a "ref" column takes no value in an example')).toBeTruthy();
    // pt-BR kept: asserts that the Portuguese text is absent in en-US
    expect(screen.queryByText(/aceita só/)).toBeNull();
  });

  it('in Portuguese (pt-BR), the four problems come out in Portuguese', () => {
    // pt-BR kept: the pt-BR rendering of the four example problems is the object of this test
    locale.value = 'pt-BR';
    renderList();
    expect(screen.getByText('campo "table" aceita só a lista de linhas')).toBeTruthy();
    expect(screen.getByText('"nada" não é coluna de "rows"')).toBeTruthy();
    expect(screen.getByText('deve ser um objeto (coluna → valor)')).toBeTruthy();
    expect(screen.getByText('coluna "ref" não aceita valor em exemplo')).toBeTruthy();
  });
});

// Phase 1 of #954 (item 7): the "Copied" goes back to normal and is not left for an empty log.
describe('Diagnostics: the copy result disappears by itself', () => {
  function mockWrite() {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  }

  it('the "Copied" goes back to empty after 2 s', async () => {
    vi.useFakeTimers();
    mockWrite();
    reportError('local.open', new Error('blocked'));
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

  it('Copy and then Clear does not leave "Copied" for an empty log', async () => {
    vi.useFakeTimers();
    mockWrite();
    reportError('local.open', new Error('blocked'));
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
