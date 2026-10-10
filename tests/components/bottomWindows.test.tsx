import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { diagnosticsUnseen, markDiagnosticsSeen } from '../../src/store/diagnostics';
import {
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
} from '../../src/store/toolWindows';
import { DiagnosticsView } from '../../src/ui/DiagnosticsView';
import { EditorContext } from '../../src/ui/EditorContext';
import { IncompleteView } from '../../src/ui/IncompleteView';
import { ListView } from '../../src/ui/ListView';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { clearReportedErrors, reportError } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';
import { createHarness, type Harness } from './harness';

// Janela inferior (R7): Lista em tabela (P7), Incompletas (B5) e Diagnóstico (B4).

beforeEach(() => {
  locale.value = 'pt-BR';
  clearReportedErrors();
  markDiagnosticsSeen();
  hideToolWindow('diagnostics');
  hideToolWindow('incomplete');
  hideToolWindow('list');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('Lista em tabela (P7)', () => {
  it('uma linha por anotação, com Marcação, Camada, Anotação e Conteúdo', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ListView onSelect={vi.fn()} />);
    const table = screen.getByRole<HTMLTableElement>('table', { name: t('list.title') });
    const headers = within(table.tHead as HTMLTableSectionElement)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      t('list.col.marking'),
      t('list.col.layer'),
      t('list.col.annotation'),
      t('list.col.content'),
    ]);
    // M1 tem A1 (Lataria) e A2 (Vidros); M2 tem A3 (Lataria); M4 tem A4 (Vidros).
    expect(within(table).getAllByRole('row').length).toBe(
      1 + 2 /* imagens */ + 4 /* anotações */,
    );
    expect(within(table).getByText('amassado')).toBeTruthy();
    expect(within(table).getByText('Amassado')).toBeTruthy();
  });

  it('escolher a linha seleciona a marcação', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    withContext(harness, <ListView onSelect={onSelect} />);
    await userEvent.click(
      screen.getByRole('button', {
        name: t('list.select', { name: 'Porta › Maçaneta' }),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M2' });
  });

  it('mantém os filtros: camadas visíveis, sem anotação e só incompletas', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ListView onSelect={vi.fn()} />);
    const user = userEvent.setup();

    // Esconder Vidros tira A2 e A4 (e a imagem I2) da tabela.
    await user.click(screen.getByLabelText(t('layer.visible', { name: 'Vidros' })));
    expect(screen.queryByText('trinca')).toBeNull();
    expect(screen.getAllByRole('row').length).toBe(1 + 1 + 2);

    // Mostrar marcações sem anotação inclui a Fechadura (M3).
    await user.click(screen.getByLabelText(t('list.showEmpty')));
    expect(screen.getAllByText(t('list.noAnnotations')).length).toBeGreaterThan(0);

    // Só incompletas: o projeto não tem pendência.
    await user.click(screen.getByLabelText(`⚠ ${t('list.incomplete')}`));
    expect(screen.getByText(t('list.emptyIncomplete'))).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Incompletas (B5)', () => {
  it('lista as pendências por imagem, com os motivos', () => {
    const harness = createHarness(cadastroProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('incomplete.title') });
    // O Text do Título está sem o campo obrigatório `id`.
    expect(within(table).getByText('Título')).toBeTruthy();
    expect(within(table).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(derivedCount(harness)).toBe(within(table).getAllByRole('listitem').length);
  });

  it('clicar leva à anotação', async () => {
    const harness = createHarness(cadastroProject());
    const onGoTo = vi.fn();
    withContext(harness, <IncompleteView onGoToAnnotation={onGoTo} />);
    await userEvent.click(
      screen.getByRole('button', { name: t('incomplete.go', { name: 'Título' }) }),
    );
    expect(onGoTo).toHaveBeenCalledWith(expect.objectContaining({ id: 'AT' }));
  });

  it('"Só camadas visíveis" esconde as pendências de camadas escondidas', async () => {
    const harness = createHarness(cadastroProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    const annotation = harness.project().annotations.find((a) => a.id === 'AT');
    if (!annotation) throw new Error('sem AT');
    const user = userEvent.setup();
    harness.ui.hiddenLayers.value = new Set([annotation.layerId]);
    await user.click(screen.getByLabelText(t('incomplete.visibleOnly')));
    expect(screen.queryByRole('button', { name: /Título/ })).toBeNull();
    expect(screen.getByText(t('incomplete.emptyVisible'))).toBeTruthy();
  });

  it('sem pendências avisa', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('incomplete.empty'))).toBeTruthy();
  });
});

function derivedCount(harness: Harness): number {
  const issues = harness.context.derived.issues.value;
  return [...issues.values()].reduce((sum, list) => sum + list.length, 0);
}

describe('Diagnóstico (B4)', () => {
  it('mostra o registro em tabela, do mais recente ao mais antigo', () => {
    reportError('save', new Error('primeiro'));
    reportError('folder.write', new Error('segundo'));
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('segundo');
    expect(rows[2]?.textContent).toContain('primeiro');
  });

  it('sem erros avisa', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });

  it('com a janela à vista os erros contam como vistos', () => {
    reportError('save', new Error('falhou'));
    expect(diagnosticsUnseen.value).toBe(true);
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    expect(diagnosticsUnseen.value).toBe(false);
  });
});

describe('janela inferior: abas e faixa', () => {
  it('as abas trocam de janela e a janela fecha pelo cabeçalho', async () => {
    const harness = createHarness(sampleProject());
    showToolWindow('list');
    withContext(
      harness,
      <ToolWindow id="list">
        <p>conteúdo</p>
      </ToolWindow>,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      t('view.list'),
      t('incomplete.title'),
      t('diagnostics.title'),
      t('proposals.title'),
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.click(tabs[1]!);
    expect(isToolWindowOpen('incomplete')).toBe(true);
    expect(isToolWindowOpen('list')).toBe(false);
  });

  it('a aba Incompletas mostra quantas anotações estão pendentes', () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('list');
    withContext(
      harness,
      <ToolWindow id="list">
        <p>conteúdo</p>
      </ToolWindow>,
    );
    const count = harness.context.derived.incompleteCount.value;
    expect(count).toBeGreaterThan(0);
    expect(
      screen.getByRole('tab', { name: new RegExp(`${t('incomplete.title')}${count}`) }),
    ).toBeTruthy();
  });

  it('erro novo acende o ponto na faixa e na aba; ver a janela apaga', async () => {
    const harness = createHarness(sampleProject());
    showToolWindow('list');
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolWindow id="list">
          <p>conteúdo</p>
        </ToolWindow>
      </>,
    );
    const name = t('diagnostics.title');
    const stripButton = () =>
      screen.getByRole('button', {
        name: new RegExp(`^${t('window.show', { name })}`),
      });
    expect(stripButton().getAttribute('aria-label')).toBe(t('window.show', { name }));
    reportError('save', new Error('falhou'));
    await vi.waitFor(() =>
      expect(stripButton().getAttribute('aria-label')).toContain(t('diagnostics.unseen')),
    );
    await userEvent.click(stripButton());
    expect(isToolWindowOpen('diagnostics')).toBe(true);
  });
});
