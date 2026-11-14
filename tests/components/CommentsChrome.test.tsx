import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shortcutFor } from '../../src/app/shortcuts';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor } from '../../src/store/threadUi';
import {
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
} from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { LayersPanel } from '../../src/ui/LayersPanel';
import { StatusBar } from '../../src/ui/StatusBar';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Comments window in the strip, in the tabs, in the status bar and in the layer menu (CM3).

const OPEN_A = sampleThread({
  id: 'oa',
  messages: [message('a1', T0, HUMAN, 'hi'), message('a2', T1, AGENT, 'hello')],
});
// The last one is from the person: it awaits the agent.
const OPEN_B = sampleThread({
  id: 'ob',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('b1', T0, HUMAN, 'and now?')],
});

async function harnessWith(threads: readonly Thread[], readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  for (const th of threads) await harness.context.session.threads.create(th);
  return harness;
}

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  setIdentity('Marina Alves', 'marina@example.com');
  locale.value = 'en-US';
  hideToolWindow('comments');
});
afterEach(cleanup);

describe('Comments window shortcuts', () => {
  it('Ctrl+Shift+0 and Alt+0 toggle the Comments window', () => {
    const key = (k: string, mods: Partial<KeyboardEvent>) =>
      shortcutFor({
        key: k,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        ...mods,
      });
    expect(key('0', { ctrlKey: true, shiftKey: true })).toEqual({
      kind: 'toggle-window',
      window: 'comments',
    });
    expect(key('0', { altKey: true })).toEqual({
      kind: 'toggle-window',
      window: 'comments',
    });
  });
});

// pt-BR kept: the strip, tab and status bar are checked in both locales
describe.each(['pt-BR', 'en-US'] as const)('strip, tab and status bar (%s)', (lang) => {
  beforeEach(() => {
    locale.value = lang;
  });

  it('the strip and the tab show the count of open threads', async () => {
    const harness = await harnessWith([OPEN_A, OPEN_B]);
    showToolWindow('comments');
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolWindow id="comments">
          <span>body</span>
        </ToolWindow>
      </>,
    );
    const strip = document.querySelector<HTMLElement>('[data-strip-window="comments"]');
    expect(strip?.textContent).toContain('2');
    expect(strip?.getAttribute('aria-label')).toContain(
      t('comments.openCount', { count: 2 }),
    );
    const tab = screen
      .getAllByRole('tab')
      .find((el) => el.getAttribute('aria-label') === t('comments.title'));
    expect(tab?.textContent).toContain('2');
  });

  it('with no open threads there is no badge', async () => {
    const harness = await harnessWith([]);
    withContext(harness, <ToolStrip side="left" />);
    const strip = document.querySelector<HTMLElement>('[data-strip-window="comments"]');
    expect(strip?.getAttribute('aria-label') ?? '').not.toContain('(');
  });

  it('the status bar says how many are open and awaiting the agent, and opens the window', async () => {
    const user = userEvent.setup();
    const harness = await harnessWith([OPEN_A, OPEN_B]);
    renderLive(harness, () => (
      <EditorContext.Provider value={harness.context}>
        <StatusBar />
      </EditorContext.Provider>
    ));
    const item = screen.getByRole('button', {
      name: new RegExp(t('comments.statusBar.open', { count: 2 })),
    });
    expect(item.textContent).toContain(
      t('comments.statusBar.awaiting', {
        open: t('comments.statusBar.open', { count: 2 }),
        count: 1,
      }),
    );
    await user.click(item);
    expect(isToolWindowOpen('comments')).toBe(true);
  });

  it('singular, and disappears with zero open', async () => {
    const harness = await harnessWith([OPEN_B]);
    renderLive(harness, () => (
      <EditorContext.Provider value={harness.context}>
        <StatusBar />
      </EditorContext.Provider>
    ));
    expect(screen.getByText(new RegExp(t('comments.statusBar.openOne')))).toBeTruthy();
    await act(async () => {
      await harness.context.session.threads.remove('ob');
    });
    expect(screen.queryByText(new RegExp(t('comments.statusBar.openOne')))).toBeNull();
    expect(
      screen.queryByRole('button', { name: new RegExp(t('comments.statusBar.tip')) }),
    ).toBeNull();
  });
});

describe('Comment in the layer menu', () => {
  it('opens a draft thread anchored to the layer and goes to the Details', async () => {
    const user = userEvent.setup();
    hideToolWindow('details');
    const harness = await harnessWith([]);
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={false} />);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    const menu = screen.getByRole('menu', {
      name: t('layer.more', { name: layer.name }),
    });
    await user.click(within(menu).getByRole('menuitem', { name: t('comments.layer') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'layer', id: layer.id });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('is disabled in read-only and in review', async () => {
    const user = userEvent.setup();
    const harness = await harnessWith([], true);
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={true} />);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    expect(
      (screen.getByRole('menuitem', { name: t('comments.layer') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
    const h2 = await harnessWith([]);
    renderLive(h2, (p) => <LayersPanel project={p} readOnly={false} />);
    act(() => h2.store.setReviewing('R'));
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    expect(
      (screen.getByRole('menuitem', { name: t('comments.layer') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('focus when closing the Comments window', () => {
  it('closing with focus inside returns the focus to the strip button', async () => {
    const user = userEvent.setup();
    const harness = await harnessWith([OPEN_A]);
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolWindow id="comments">
          <button type="button">inside</button>
        </ToolWindow>
      </>,
    );
    showToolWindow('comments');
    await user.click(screen.getByRole('button', { name: 'inside' }));
    await user.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: t('comments.title') }),
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(
      document.querySelector('[data-strip-window="comments"]'),
    );
  });
});
