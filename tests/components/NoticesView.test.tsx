import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import {
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
  toolWindowByNumber,
} from '../../src/store/toolWindows';
import { BottomTabs } from '../../src/ui/BottomTabs';
import { EditorContext } from '../../src/ui/EditorContext';
import { NoticesView } from '../../src/ui/NoticesView';
import { StatusBar } from '../../src/ui/StatusBar';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';
import { noticeProject } from './noticeFixtures';

// Notices window (stage #486, AV3): groups per notice, filters, go to the annotation, tab and status.

beforeEach(() => {
  locale.value = 'en-US';
  hideToolWindow('notices');
});
afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('Notices window', () => {
  it('lists one group per notice, from the most to the least severe, with badge, place, message and count', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('notices.title') });
    const groups = within(table).getAllByRole('rowgroup').slice(1); // without the thead
    expect(groups).toHaveLength(4);
    const head = (i: number) =>
      groups[i]!.querySelector('.notices-group-row')!.textContent ?? '';
    expect(head(0)).toContain('Removed');
    expect(head(0)).toContain('Gone');
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (message of noticeFixtures)
    expect(head(0)).toContain('Saiu do contrato.');
    expect(head(1)).toContain('Deprecated');
    expect(head(1)).toContain('Alert › legacyStyle');
    expect(head(2)).toContain('Alert › events › handler');
    expect(head(3)).toContain('Pending');
    expect(head(3)).toContain('2026-11-04');
    // 1 annotation affected per notice
    expect(head(0)).toContain(t('notices.count', { count: 1 }));
  });

  it('each row carries marking, layer, annotation and the value in the field', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('list-row'));
    expect(rows).toHaveLength(4);
    const deprecated = rows[1]!;
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (marking and layer names of noticeFixtures)
    expect(deprecated.textContent).toContain('Alvo');
    expect(deprecated.textContent).toContain('Componentes');
    expect(deprecated.textContent).toContain('x');
  });

  it('the Segmented by kind carries "All" and one button per kind with the count', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const group = screen.getByRole('group', { name: t('notices.kindFilter') });
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual([
      'All 2',
      'Removed 1',
      'Deprecated 1',
      'Diverges 1',
      'Pending 1',
    ]);
    await userEvent.click(within(group).getByRole('button', { name: /Deprecated/ }));
    expect(harness.ui.noticeKind.value).toBe('deprecated');
    expect(
      screen.getAllByRole('row').filter((r) => r.classList.contains('list-row')),
    ).toHaveLength(1);
  });

  it('choosing the row leads to the annotation', async () => {
    const harness = createHarness(noticeProject());
    const onGo = vi.fn();
    withContext(harness, <NoticesView onGoToAnnotation={onGo} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('list-row'));
    await userEvent.click(within(rows[1]!).getByRole('button'));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'AA' }));
  });

  it('"Only notices in use" unchecked shows the notice without an annotation', async () => {
    const harness = createHarness({
      ...noticeProject(),
      annotations: noticeProject().annotations.filter((a) => a.id !== 'AG'),
    });
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.queryByText(t('notices.unused'))).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: t('notices.inUseOnly') }));
    expect(harness.ui.noticesInUseOnly.value).toBe(false);
    expect(screen.getByText(t('notices.unused'))).toBeTruthy();
  });

  it('"Only visible layers" and the empty states', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    harness.ui.noticesVisibleOnly.value = true;
    harness.ui.noticeKind.value = null;
    // the layer is visible: the list stays
    expect(
      screen.getAllByRole('row').filter((r) => r.classList.contains('list-row')),
    ).toHaveLength(4);
    cleanup();

    const empty = createHarness(sampleProject());
    withContext(empty, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('notices.empty'))).toBeTruthy();
  });

  it('shows the empty state with a filter when nothing passes through it', () => {
    const harness = createHarness(noticeProject());
    harness.ui.noticesVisibleOnly.value = true;
    harness.ui.hiddenLayers.value = new Set(harness.project().layers.map((l) => l.id));
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('notices.emptyFiltered'))).toBeTruthy();
  });
});

describe('tab, shortcut and status bar', () => {
  it('Ctrl+Shift+8 is the Notices window, in the bottom window', () => {
    expect(toolWindowByNumber(8)).toBe('notices');
    showToolWindow('notices');
    expect(isToolWindowOpen('notices')).toBe(true);
    hideToolWindow('notices');
    expect(isToolWindowOpen('notices')).toBe(false);
  });

  it('the tab sits between Incomplete and Diagnostics and shows the count', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <BottomTabs active="list" />);
    const tabs = screen.getAllByRole('tab');
    const names = tabs.map((tab) => tab.textContent ?? '');
    const i = names.findIndex((n) => n.startsWith(t('notices.title')));
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1]).toContain(t('incomplete.title'));
    expect(names[i + 1]).toContain(t('diagnostics.title'));
    expect(names[i]).toContain('2');
  });

  it('"Notices: N" only with N > 0 and the click opens the window', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <StatusBar />);
    const item = screen.getByRole('button', { name: t('notices.status', { count: 2 }) });
    expect(item.textContent).toContain('2');
    await userEvent.click(item);
    expect(isToolWindowOpen('notices')).toBe(true);
    cleanup();

    const without = createHarness(sampleProject());
    withContext(without, <StatusBar />);
    expect(screen.queryByRole('button', { name: /Notices/ })).toBeNull();
  });

  it('the Incomplete count does not change because of a notice', () => {
    const harness = createHarness(noticeProject());
    expect(harness.context.derived.noticedCount.value).toBe(2);
    expect(harness.context.derived.incompleteCount.value).toBe(0);
  });
});
