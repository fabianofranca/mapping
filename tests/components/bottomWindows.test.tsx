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
import { addChild, forceRole, roleProject, withRoles } from '../model/roleFixtures';
import { createHarness, type Harness } from './harness';

// Bottom window (R7): table List (P7), Incomplete (B5) and Diagnostics (B4).
// pt-BR kept: shared fixture data (Porta, Maçaneta, Vidros, amassado, trinca, Título, Clique) asserted by tests/model

beforeEach(() => {
  locale.value = 'en-US';
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

describe('Table list (P7)', () => {
  it('one row per annotation, with Marking, Layer, Annotation and Content', () => {
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
    // M1 has A1 (Lataria) and A2 (Vidros); M2 has A3 (Lataria); M4 has A4 (Vidros).
    expect(within(table).getAllByRole('row').length).toBe(
      1 + 2 /* images */ + 4 /* annotations */,
    );
    expect(within(table).getByText('amassado')).toBeTruthy();
    expect(within(table).getByText('Amassado')).toBeTruthy();
  });

  it('choosing the row selects the marking', async () => {
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

  it('keeps the filters: visible layers, no annotation and only incomplete', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ListView onSelect={vi.fn()} />);
    const user = userEvent.setup();

    // Hiding Vidros removes A2 and A4 (and image I2) from the table.
    await user.click(screen.getByLabelText(t('layer.visible', { name: 'Vidros' })));
    expect(screen.queryByText('trinca')).toBeNull();
    expect(screen.getAllByRole('row').length).toBe(1 + 1 + 2);

    // Showing markings without an annotation includes the Fechadura (M3).
    await user.click(screen.getByLabelText(t('list.showEmpty')));
    expect(screen.getAllByText(t('list.noAnnotations')).length).toBeGreaterThan(0);

    // Only incomplete: the project has no pending item.
    await user.click(screen.getByLabelText(t('list.incomplete')));
    expect(screen.getByText(t('list.emptyIncomplete'))).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('List: link by role (stage #559, PD4)', () => {
  const linked = (role: string | null) =>
    role === 'gone'
      ? forceRole(addChild(roleProject(withRoles), 'E1', 'A1', 'click'), 'E1', role)
      : addChild(roleProject(withRoles), 'E1', 'A1', role);

  function linkedText(role: string | null): string | undefined {
    const harness = createHarness(linked(role));
    const { container } = withContext(harness, <ListView onSelect={vi.fn()} />);
    return container.querySelector('.list-linked')?.textContent ?? undefined;
  }

  it('shows the role name after the owner', () => {
    expect(linkedText('click')).toMatch(/^↳ of .+ \(Clique\)$/);
  });

  it('unknown role: the raw id in parentheses', () => {
    expect(linkedText('gone')).toMatch(/\(gone\)$/);
  });

  it('no role: only the owner', () => {
    expect(linkedText(null)).toMatch(/^↳ of [^()]+$/);
  });
});

describe('Incomplete (B5)', () => {
  it('lists the pending items per image, with the reasons', () => {
    const harness = createHarness(cadastroProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('incomplete.title') });
    // The Text of the Título lacks the required `id` field.
    expect(within(table).getByText('Título')).toBeTruthy();
    expect(within(table).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(derivedCount(harness)).toBe(within(table).getAllByRole('listitem').length);
  });

  it('clicking leads to the annotation', async () => {
    const harness = createHarness(cadastroProject());
    const onGoTo = vi.fn();
    withContext(harness, <IncompleteView onGoToAnnotation={onGoTo} />);
    await userEvent.click(
      screen.getByRole('button', { name: t('incomplete.go', { name: 'Título' }) }),
    );
    expect(onGoTo).toHaveBeenCalledWith(expect.objectContaining({ id: 'AT' }));
  });

  it('"Visible layers only" hides the pending items of hidden layers', async () => {
    const harness = createHarness(cadastroProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    const annotation = harness.project().annotations.find((a) => a.id === 'AT');
    if (!annotation) throw new Error('no AT');
    const user = userEvent.setup();
    harness.ui.hiddenLayers.value = new Set([annotation.layerId]);
    await user.click(screen.getByLabelText(t('incomplete.visibleOnly')));
    expect(screen.queryByRole('button', { name: /Título/ })).toBeNull();
    expect(screen.getByText(t('incomplete.emptyVisible'))).toBeTruthy();
  });

  it('with no pending items it says so', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('incomplete.empty'))).toBeTruthy();
  });
});

function derivedCount(harness: Harness): number {
  const issues = harness.context.derived.issues.value;
  return [...issues.values()].reduce((sum, list) => sum + list.length, 0);
}

describe('Diagnostics (B4)', () => {
  it('shows the log in a table, from the newest to the oldest', () => {
    reportError('save', new Error('first'));
    reportError('folder.write', new Error('second'));
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('second');
    expect(rows[2]?.textContent).toContain('first');
  });

  it('with no errors it says so', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    expect(screen.getByText(t('diagnostics.empty'))).toBeTruthy();
  });

  it('with the window in view the errors count as seen', () => {
    reportError('save', new Error('failed'));
    expect(diagnosticsUnseen.value).toBe(true);
    const harness = createHarness(sampleProject());
    withContext(harness, <DiagnosticsView />);
    expect(diagnosticsUnseen.value).toBe(false);
  });
});

describe('bottom window: tabs and strip', () => {
  it('the tabs switch windows and the window closes from the header', async () => {
    const harness = createHarness(sampleProject());
    showToolWindow('list');
    withContext(
      harness,
      <ToolWindow id="list">
        <p>content</p>
      </ToolWindow>,
    );
    const tabs = screen.getAllByRole('tab');
    // Comments is only an icon and a count: the name comes from the `aria-label`.
    expect(tabs.map((tab) => tab.getAttribute('aria-label') ?? tab.textContent)).toEqual([
      t('view.list'),
      t('incomplete.title'),
      t('notices.title'),
      t('diagnostics.title'),
      t('proposals.title'),
      t('comments.title'),
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.click(tabs[1]!);
    expect(isToolWindowOpen('incomplete')).toBe(true);
    expect(isToolWindowOpen('list')).toBe(false);
  });

  it('the Incomplete tab shows how many annotations are pending', () => {
    const harness = createHarness(cadastroProject());
    showToolWindow('list');
    withContext(
      harness,
      <ToolWindow id="list">
        <p>content</p>
      </ToolWindow>,
    );
    const count = harness.context.derived.incompleteCount.value;
    expect(count).toBeGreaterThan(0);
    expect(
      screen.getByRole('tab', { name: new RegExp(`${t('incomplete.title')}${count}`) }),
    ).toBeTruthy();
  });

  it('a new error lights the dot on the strip and the tab; viewing the window clears it', async () => {
    const harness = createHarness(sampleProject());
    showToolWindow('list');
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolWindow id="list">
          <p>content</p>
        </ToolWindow>
      </>,
    );
    const name = t('diagnostics.title');
    const stripButton = () =>
      screen.getByRole('button', {
        name: new RegExp(`^${name}`),
      });
    expect(stripButton().getAttribute('aria-label')).toBe(name);
    reportError('save', new Error('failed'));
    await vi.waitFor(() =>
      expect(stripButton().getAttribute('aria-label')).toContain(t('diagnostics.unseen')),
    );
    await userEvent.click(stripButton());
    expect(isToolWindowOpen('diagnostics')).toBe(true);
    // Open, the name stays the same; only aria-pressed changes.
    expect(stripButton().getAttribute('aria-label')).toBe(name);
    expect(stripButton().getAttribute('aria-pressed')).toBe('true');
  });
});
