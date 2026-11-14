import type { Signal } from '@preact/signals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { addPerspective, buildPerspective } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';
import { libraryHarness } from './libraryHarness';

// Perspectives stage (PE3, C1): the right-click menu sends the item's root to another
// perspective, removes it from the open one and disables what only applies on Main.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(options: { open?: boolean; others?: number } = {}) {
  const harness = createHarness(sampleProject());
  const actions = harness.context.session.perspectiveActions;
  const ids: string[] = [];
  const names = ['View A', 'View B'];
  for (let i = 0; i < (options.others ?? 1); i++) {
    const created = actions.createPerspective({
      name: names[i] ?? `V${i}`,
      startFrom: 'empty',
      local: false,
    });
    if (!created.ok) throw new Error(`perspective not created: ${created.error}`);
    ids.push(created.value);
  }
  // "Only me" without IndexedDB in the test: mark the second one in the `localIds` set (only the interface reads it).
  if (ids[1] !== undefined) {
    (harness.context.session.perspective.localIds as Signal<ReadonlySet<string>>).value =
      new Set([ids[1]]);
  }
  if (options.open && ids[0] !== undefined)
    harness.context.session.perspective.open(ids[0]);
  render(
    <EditorContext.Provider value={harness.context}>
      <CanvasContextMenu />
    </EditorContext.Provider>,
  );
  return { harness, ids };
}

function openMenu(harness: Harness, kind: 'i' | 'm', id: string) {
  act(() => {
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind, id } };
  });
}

const itemsOf = (harness: Harness, id: string) =>
  harness
    .project()
    .perspectives.find((x) => x.id === id)
    ?.items.map((i) => i.root) ?? [];

const sendItem = () => screen.getByRole('menuitem', { name: t('perspective.menu.send') });

describe('Send to perspective', () => {
  it('the item opens a submenu with Main and the open one checked and locked', () => {
    const { harness, ids } = setup({ open: true, others: 2 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    expect(send.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(send);
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    expect(within(sub).getByText(t('perspective.menu.sendHeading'))).toBeTruthy();
    const boxes = within(sub).getAllByRole('menuitemcheckbox');
    expect(boxes.map((b) => b.textContent)).toEqual([
      `${t('perspective.principal')}${t('perspective.menu.always')}`,
      `View A${t('perspective.menu.current')}`,
      `View B${t('perspective.menu.mine')}`,
    ]);
    expect(boxes[0]?.getAttribute('aria-checked')).toBe('true');
    expect((boxes[0] as HTMLButtonElement).disabled).toBe(true);
    expect(boxes[1]?.getAttribute('aria-checked')).toBe('true');
    expect((boxes[1] as HTMLButtonElement).disabled).toBe(true);
    expect(boxes[2]?.getAttribute('aria-checked')).toBe('false');
    expect((boxes[2] as HTMLButtonElement).disabled).toBe(false);
    expect(ids).toHaveLength(2);
  });

  it('hovering the item opens the submenu, without stealing the focus', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
    const send = sendItem();
    send.focus();
    fireEvent.pointerEnter(send.parentElement as HTMLElement);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
    expect(send.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(send);
  });

  it('clicking the item after the pointer opened it keeps the submenu open', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    fireEvent.pointerEnter(send.parentElement as HTMLElement);
    fireEvent.click(send);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
    expect(send.getAttribute('aria-expanded')).toBe('true');
  });

  // Phase 1 of #954 (item 31): the hover that opens also closes, and ← does not leave the mark behind.
  it('on Main, leaving the item with the pointer closes the submenu opened by hover', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const host = sendItem().parentElement as HTMLElement;
    fireEvent.pointerEnter(host);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
    fireEvent.pointerLeave(host);
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
  });

  it('closing with ← after the hover does not swallow the next click', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    fireEvent.pointerEnter(send.parentElement as HTMLElement);
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    fireEvent.keyDown(within(sub).getAllByRole('menuitemcheckbox')[0] as HTMLElement, {
      key: 'ArrowLeft',
    });
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
    fireEvent.click(send);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
  });

  it('near the right edge, the submenu opens to the left of the item', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const right =
          this.dataset.submenu !== undefined ? globalThis.innerWidth + 50 : 100;
        return {
          left: right - 200,
          right,
          top: 0,
          bottom: 0,
          width: 200,
          height: 0,
        } as DOMRect;
      });
    try {
      fireEvent.click(sendItem());
      const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
      expect(sub.classList.contains('menu-submenu-left')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('on Main, with another perspective, its box starts unchecked', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    const boxes = within(sub).getAllByRole('menuitemcheckbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[1]?.getAttribute('aria-checked')).toBe('false');
  });

  it('checking sends the root and unchecking removes it', () => {
    const { harness, ids } = setup({ others: 1 });
    const [target] = ids as [string];
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    let box = within(
      screen.getByRole('menu', { name: t('perspective.menu.send') }),
    ).getByRole('menuitemcheckbox', { name: /View A/ });
    fireEvent.click(box);
    expect(itemsOf(harness, target)).toContain('I1');
    // The submenu stays open, now with the box checked: unchecking removes it.
    box = within(
      screen.getByRole('menu', { name: t('perspective.menu.send') }),
    ).getByRole('menuitemcheckbox', { name: /View A/ });
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box);
    expect(itemsOf(harness, target)).not.toContain('I1');
  });

  it("the target is the item's root: a marking inside the container sends the container", () => {
    const { harness, ids } = setup({ others: 1 });
    openMenu(harness, 'm', 'M3');
    fireEvent.click(sendItem());
    fireEvent.click(
      within(screen.getByRole('menu', { name: t('perspective.menu.send') })).getByRole(
        'menuitemcheckbox',
        { name: /View A/ },
      ),
    );
    expect(itemsOf(harness, ids[0] as string)).toEqual(['I1']);
  });

  it('with several roots selected, sends all of them', () => {
    const { harness, ids } = setup({ others: 1 });
    act(() => {
      selectItems(harness.ui, [
        { kind: 'image', id: 'I1' },
        { kind: 'image', id: 'I2' },
      ]);
    });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    fireEvent.click(
      within(screen.getByRole('menu', { name: t('perspective.menu.send') })).getByRole(
        'menuitemcheckbox',
        { name: /View A/ },
      ),
    );
    expect(itemsOf(harness, ids[0] as string).sort()).toEqual(['I1', 'I2']);
  });

  it('read-only, Send and Remove are disabled', () => {
    const base = sampleProject();
    const project = addPerspective(
      base,
      buildPerspective(base, {
        id: 'V',
        name: 'View A',
        startFrom: 'empty',
        hiddenLayers: [],
      }),
    );
    const harness = createHarness(project, true);
    harness.context.session.perspective.open('V');
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    openMenu(harness, 'i', 'I1');
    expect((sendItem() as HTMLButtonElement).disabled).toBe(true);
    const remove = screen.getByRole('menuitem', { name: t('perspective.menu.remove') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Remove from this perspective', () => {
  it('removes only from the open one and the project stays as it is', () => {
    const { harness, ids } = setup({ open: true, others: 1 });
    const [open] = ids as [string];
    const actions = harness.context.session.perspectiveActions;
    actions.sendRootsToPerspective(open, ['I1', 'I2']);
    openMenu(harness, 'i', 'I1');
    fireEvent.click(screen.getByRole('menuitem', { name: t('perspective.menu.remove') }));
    expect(itemsOf(harness, open)).toEqual(['I2']);
    expect(harness.project().containers.map((c) => c.id)).toContain('I1');
  });

  it('on Main there is nothing to remove from: the item does not appear', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(
      screen.queryByRole('menuitem', { name: t('perspective.menu.remove') }),
    ).toBeNull();
  });
});

describe('Main only', () => {
  const arrange = () => screen.getByRole('menuitem', { name: t('arrange.action') });

  async function arrangeScene(open: boolean) {
    const harness = await libraryHarness();
    const add = (typeId: string, parentId: string | null) => {
      const result = harness.actions.addComponent({
        containerId: 'I1',
        parentId,
        specId: 'material3',
        typeId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const column = add('m3-column', null);
    add('m3-button', column);
    if (open) {
      const actions = harness.context.session.perspectiveActions;
      const created = actions.createPerspective({
        name: 'View A',
        startFrom: 'empty',
        local: false,
      });
      if (!created.ok) throw new Error(created.error);
      actions.sendRootsToPerspective(created.value, ['I1']);
      harness.context.session.perspective.open(created.value);
    }
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    openMenu(harness, 'm', column);
  }

  it('outside Main, Arrange is disabled with the hint', async () => {
    await arrangeScene(true);
    const item = arrange() as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getAllByText(t('perspective.principalOnly')).length).toBeGreaterThan(0);
  });

  it('on Main, Arrange stays enabled', async () => {
    await arrangeScene(false);
    expect((arrange() as HTMLButtonElement).disabled).toBe(false);
  });

  it('Delete of a root appears disabled outside Main', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    const del = screen.getByRole('menuitem', { name: t('common.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it('Delete does not appear on Main', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(screen.queryByRole('menuitem', { name: t('common.delete') })).toBeNull();
  });

  it('Comment here on a canvas point is disabled outside Main', () => {
    const { harness } = setup({ open: true, others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: null, x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });

  it('Comment here on a container point stays enabled outside Main', () => {
    const { harness } = setup({ open: true, others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: 'I1', x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(false);
  });

  it('Comment here on a canvas point stays enabled on Main', () => {
    const { harness } = setup({ others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: null, x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Keyboard', () => {
  it('→ opens the submenu, ← closes and returns to the item, ↓ and ↑ move', () => {
    const { harness } = setup({ open: true, others: 2 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    send.focus();
    fireEvent.keyDown(send, { key: 'ArrowRight' });
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    // The focus goes to the first enabled box.
    const enabled = within(sub)
      .getAllByRole('menuitemcheckbox')
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(document.activeElement).toBe(enabled[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(enabled[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
    expect(document.activeElement).toBe(sendItem());
  });

  it('↓ and ↑ walk through the menu items', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    send.focus();
    fireEvent.keyDown(send, { key: 'ArrowDown' });
    const remove = screen.getByRole('menuitem', { name: t('perspective.menu.remove') });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(remove, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(send);
  });

  it('Esc closes the menu', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
