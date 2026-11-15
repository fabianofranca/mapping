import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { typeOfAnnotation, type Project } from '../../src/model';
import { goToAnnotation } from '../../src/store/ui';
import { locale } from '../../src/store/settings';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { IncompleteView } from '../../src/ui/IncompleteView';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { NoticesView } from '../../src/ui/NoticesView';
import { StatusBar } from '../../src/ui/StatusBar';
import { TypedField } from '../../src/ui/TypedFields';
import { issueMessage, issueReason } from '../../src/ui/typedText';
import { a11yPut, a11yRows, a11yWorld } from '../model/accessibilityProject';
import { annotationOf, createHarness, renderLive } from './harness';

// Accessibility in the app (stage #1127, A2; decision 8 of #1081): the pending item with the part in the
// Incomplete window and in the field, the Accessibility section of the Notices window, the status bar
// count and the notice line in the marking's Details.

beforeEach(() => {
  locale.value = 'en-US';
  hideToolWindow('notices');
});
afterEach(cleanup);

const SMALL = { x: 0, y: 0, width: 108, height: 120 };
const UNITS = '36 × 40; minimum 44 × 44 units (132 × 132 px at 3x)';

/** A button below the minimum at 3x (the warning) and a bar with a button pending a label (the pending item). */
function world(): Project {
  let p = a11yWorld(3);
  p = a11yPut(p, 'button', 'A', SMALL, { label: 'Buy' });
  p = a11yPut(
    p,
    'bar',
    'B',
    { x: 300, y: 0, width: 600, height: 300 },
    {
      actionIcon1: 'search',
    },
  );
  return p;
}

function withContext(
  harness: ReturnType<typeof createHarness>,
  ui: preact.ComponentChildren,
) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('the texts of the pending item', () => {
  it('names the field of the type, the part of a field and the part and row of a table', () => {
    let p = a11yPut(a11yWorld(), 'button', 'A', undefined, { label: '' });
    p = a11yPut(p, 'bar', 'B', undefined, { actionIcon1: 'search' });
    p = a11yPut(p, 'tabs', 'T');
    p = a11yRows(p, 'T', [{ label: 'Home' }, { label: '' }]);
    const harness = createHarness(p);
    const issues = harness.context.derived.issues.value;
    const [typeIssue] = issues.get('A') ?? [];
    const partIssue = issues.get('B')?.find((i) => i.part?.id === 'action1');
    const rowIssue = issues.get('T')?.[0];
    expect(typeIssue && issueMessage(p, annotationOf(p, 'A'), typeIssue)).toBe(
      'Missing accessible label: label',
    );
    expect(typeIssue && issueReason(p, annotationOf(p, 'A'), typeIssue)).toBe(
      'missing accessible label',
    );
    expect(partIssue && issueMessage(p, annotationOf(p, 'B'), partIssue)).toBe(
      'Missing accessible label on the part First action',
    );
    expect(partIssue && issueReason(p, annotationOf(p, 'B'), partIssue)).toBe(
      'Missing accessible label on the part First action',
    );
    expect(rowIssue && issueMessage(p, annotationOf(p, 'T'), rowIssue)).toBe(
      'Missing accessible label on the part Tab, row 2',
    );
  });

  it('names no row position when the row of the issue is gone', () => {
    let p = a11yPut(a11yWorld(), 'tabs', 'T');
    p = a11yRows(p, 'T', [{ label: 'Home' }, { label: '' }]);
    const issue = createHarness(p).context.derived.issues.value.get('T')?.[0];
    if (!issue) throw new Error('no issue');
    const stale = { ...issue, rowId: 'gone' };
    expect(issueMessage(p, annotationOf(p, 'T'), stale)).toBe(
      'Missing accessible label on the part Tab',
    );
  });

  it('is translated in pt-BR', () => {
    locale.value = 'pt-BR';
    const p = a11yPut(a11yWorld(), 'bar', 'B', undefined, { actionIcon1: 'search' });
    const harness = createHarness(p);
    const issue = harness.context.derived.issues.value
      .get('B')
      ?.find((i) => i.part?.id === 'action1');
    const message = issue ? issueMessage(p, annotationOf(p, 'B'), issue) : '';
    // The pt-BR text of the key, with the part's name filled in (not the English one).
    expect(message).toBe(
      t('issue.accessible-label-missing-part', { part: 'First action' }),
    );
    expect(message).not.toBe('Missing accessible label on the part First action');
  });
});

describe('the pending item in the field and in the Incomplete window', () => {
  it('the companion field of a part shows the pending item with the part name, and filling it clears it', async () => {
    const p = a11yPut(a11yWorld(), 'bar', 'B', undefined, {
      actionIcon1: 'search',
      actionIcon2: '',
    });
    const harness = createHarness(p);
    renderLive(harness, (q) => {
      const annotation = annotationOf(q, 'B');
      const field = typeOfAnnotation(q, annotation)?.type.fields.find(
        (f) => f.key === 'actionIcon1Description',
      );
      if (!field) throw new Error('no field');
      return (
        <TypedField
          field={field}
          project={q}
          annotation={annotation}
          readOnly={false}
          onGoToAnnotation={vi.fn()}
        />
      );
    });
    expect(
      screen.getByText('Missing accessible label on the part First action'),
    ).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox'), 'Search{Enter}');
    expect(screen.queryByText(/Missing accessible label/)).toBeNull();
    // Ctrl+Z (undo) brings it back.
    act(() => {
      harness.store.undo();
    });
    expect(
      screen.getByText('Missing accessible label on the part First action'),
    ).toBeTruthy();
  });

  it('the cell of a table part shows the pending item, and the Incomplete window lists it with the part and the row', () => {
    let p = a11yPut(a11yWorld(), 'tabs', 'T');
    p = a11yRows(p, 'T', [{ label: 'Home' }, { label: '' }]);
    const harness = createHarness(p);
    renderLive(harness, (q) => {
      const annotation = annotationOf(q, 'T');
      const field = typeOfAnnotation(q, annotation)?.type.fields.find(
        (f) => f.key === 'items',
      );
      if (!field) throw new Error('no field');
      return (
        <>
          <TypedField
            field={field}
            project={q}
            annotation={annotation}
            readOnly={false}
            onGoToAnnotation={vi.fn()}
          />
          <IncompleteView onGoToAnnotation={vi.fn()} />
        </>
      );
    });
    const message = 'Missing accessible label on the part Tab, row 2';
    // The cell (`label` column of the row) carries it as its title and is invalid; the window lists it.
    const cell = document.querySelector('[data-focus="items:R2:label"]');
    expect(cell?.querySelector('[title]')?.getAttribute('title')).toBe(message);
    expect(cell?.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(
      within(screen.getByRole('table', { name: t('incomplete.title') })).getByText(
        message,
      ),
    ).toBeTruthy();
  });
});

describe('the Accessibility section of the Notices window', () => {
  it('lists the marking, the layer and the text, below an empty table, without the empty text', async () => {
    const harness = createHarness(world());
    const onGo = vi.fn();
    withContext(harness, <NoticesView onGoToAnnotation={onGo} />);
    expect(screen.queryByText(t('notices.empty'))).toBeNull();
    expect(screen.getByText(t('notices.accessibility.title'))).toBeTruthy();
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('list-row'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain(UNITS);
    expect(rows[0]?.textContent).toContain('Interface');
    await userEvent.click(within(rows[0] as HTMLElement).getByRole('button'));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
  });

  it('is not affected by the kind filter or "Only notices in use", but follows "Only visible layers"', async () => {
    const harness = createHarness(world());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const count = () =>
      screen.getAllByRole('row').filter((r) => r.classList.contains('list-row')).length;
    act(() => {
      harness.ui.noticeKind.value = 'removed';
      harness.ui.noticesInUseOnly.value = false;
    });
    expect(count()).toBe(1);
    expect(screen.queryByText(t('notices.empty'))).toBeNull();
    expect(screen.queryByText(t('notices.emptyFiltered'))).toBeNull();
    act(() => {
      harness.ui.noticesVisibleOnly.value = true;
      harness.ui.hiddenLayers.value = new Set(harness.project().layers.map((l) => l.id));
    });
    expect(screen.queryByText(t('notices.accessibility.title'))).toBeNull();
    expect(screen.getByText(t('notices.emptyFiltered'))).toBeTruthy();
  });

  it('does not appear without warnings', () => {
    const harness = createHarness(
      a11yPut(a11yWorld(3), 'button', 'A', undefined, { label: 'Buy' }),
    );
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.queryByText(t('notices.accessibility.title'))).toBeNull();
    expect(screen.getByText(t('notices.empty'))).toBeTruthy();
  });
});

describe('the status bar count and the Details line', () => {
  it('the status bar adds the annotations with the warning, and the click opens the window', async () => {
    const harness = createHarness(world());
    withContext(harness, <StatusBar />);
    const item = screen.getByRole('button', { name: t('notices.status', { count: 1 }) });
    await userEvent.click(item);
    expect(isToolWindowOpen('notices')).toBe(true);
    // The warning is not an incomplete annotation: only the bar's pending item is.
    expect(harness.context.derived.incompleteCount.value).toBe(1);
  });

  it('the marking Details show the warning with the size in units and in pixels', () => {
    const harness = createHarness(world());
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === 'M_A');
      const image = p.containers.find((i) => i.id === marking?.containerId);
      if (!marking || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
        />
      );
    });
    const line = screen.getByText(UNITS);
    expect(line.closest('.notice-box-warning')).not.toBeNull();
  });

  it('a marking without a warning has no such line', () => {
    const harness = createHarness(world());
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === 'M_B');
      const image = p.containers.find((i) => i.id === marking?.containerId);
      if (!marking || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    expect(screen.queryByText(/units \(/)).toBeNull();
  });
});
