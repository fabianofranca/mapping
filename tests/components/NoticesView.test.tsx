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
import { a11yPut, a11yWorld } from '../model/accessibilityProject';

// Notices window (stage #486, AV3; stage #2085): only the Accessibility section, go to the annotation, tab and status.

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

const SMALL = { x: 0, y: 0, width: 108, height: 120 };

/** An accessibility world with one button below the touch minimum (one warning). */
const warned = () => a11yPut(a11yWorld(3), 'button', 'A', SMALL, { label: 'Buy' });

const listRows = () =>
  screen.getAllByRole('row').filter((r) => r.classList.contains('list-row'));

describe('Notices window', () => {
  it('shows the empty state, with no library notice, in a project without accessibility warnings', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText('No accessibility warnings.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Saiu do contrato.')).toBeNull();
    expect(screen.queryByText(/Deprecated|Removed|Pending/)).toBeNull();
  });

  it('lists only the Accessibility section, with the header and the warning count', () => {
    const harness = createHarness(warned());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('notices.title') });
    expect(within(table).getAllByRole('rowgroup')).toHaveLength(2); // thead + the section
    const head = table.querySelector('.notices-group-row')?.textContent ?? '';
    expect(head).toContain(t('notices.accessibility.title'));
    expect(head).toContain(t('notices.accessibility.count', { count: 1 }));
    expect(listRows()).toHaveLength(1);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('the headers carry their full text as a title', () => {
    const harness = createHarness(warned());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('notices.title') });
    const heads = [...table.querySelectorAll('thead th')];
    expect(heads).toHaveLength(4);
    for (const th of heads) expect(th.getAttribute('title')).toBe(th.textContent);
    expect(table.classList.contains('notices-table')).toBe(true);
    expect(table.querySelector('.list-row .notices-cell')).toBeTruthy();
  });

  it('choosing the row leads to the annotation', async () => {
    const harness = createHarness(warned());
    const onGo = vi.fn();
    withContext(harness, <NoticesView onGoToAnnotation={onGo} />);
    await userEvent.click(within(listRows()[0]!).getByRole('button'));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
  });

  it('"Only visible layers" empties the list when no layer is visible', () => {
    const harness = createHarness(warned());
    harness.ui.noticesVisibleOnly.value = true;
    harness.ui.hiddenLayers.value = new Set(harness.project().layers.map((l) => l.id));
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText('No warnings in the visible layers.')).toBeTruthy();
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

  it('the tab sits between Incomplete and Diagnostics and counts annotations with a warning', () => {
    const harness = createHarness(warned());
    withContext(harness, <BottomTabs active="list" />);
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
    const i = names.findIndex((n) => n.startsWith(t('notices.title')));
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1]).toContain(t('incomplete.title'));
    expect(names[i + 1]).toContain(t('diagnostics.title'));
    expect(names[i]).toContain('1');
  });

  it('a library notice gives the tab no number and the bar no "Notices" segment', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <BottomTabs active="list" />);
    const tab = screen
      .getAllByRole('tab')
      .find((el) => (el.textContent ?? '').startsWith(t('notices.title')));
    expect(tab?.textContent).toBe(t('notices.title'));
    cleanup();
    withContext(harness, <StatusBar />);
    expect(screen.queryByRole('button', { name: /Notices/ })).toBeNull();
    expect(harness.context.derived.auditedCount.value).toBe(0);
  });

  it('"Notices: N" only with N > 0 and the click opens the window', async () => {
    const harness = createHarness(warned());
    withContext(harness, <StatusBar />);
    const item = screen.getByRole('button', { name: t('notices.status', { count: 1 }) });
    await userEvent.click(item);
    expect(isToolWindowOpen('notices')).toBe(true);
    cleanup();

    const without = createHarness(sampleProject());
    withContext(without, <StatusBar />);
    expect(screen.queryByRole('button', { name: /Notices/ })).toBeNull();
  });

  it('the Incomplete count does not change because of a warning', () => {
    const harness = createHarness(warned());
    expect(harness.context.derived.auditedCount.value).toBe(1);
    expect(harness.context.derived.incompleteCount.value).toBe(0);
  });
});
