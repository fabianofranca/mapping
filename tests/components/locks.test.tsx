import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { descriptionOf } from './describedBy';
import { createHarness, renderLive, type Harness } from './harness';

// Stage 2.5: the padlock in the Tree and in the Details. Selection and annotations stay free;
// only moving, resizing and deleting are blocked.
// pt-BR kept: shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta', 'Fechadura', 'images/lateral.jpg')

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(cleanup);

/** The tooltip text (`Tooltip`) of an `IconButton`. */
const tipOf = (button: HTMLElement) =>
  button.parentElement?.querySelector('[data-tooltip]')?.textContent;

const marking = (p: Project, id: string) => {
  const found = p.markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

function renderMarkingPanel(
  markingId: string,
  { readOnly = false, setup }: { readOnly?: boolean; setup?: (h: Harness) => void } = {},
) {
  const harness = createHarness(sampleProject(), readOnly);
  setup?.(harness);
  const onDelete = vi.fn();
  renderLive(harness, (p) => {
    const m = p.markings.find((x) => x.id === markingId);
    const image = p.containers.find((i) => i.id === m?.containerId);
    if (!m || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={m}
        image={image}
        readOnly={readOnly}
        onDelete={onDelete}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return { harness, onDelete, user: userEvent.setup() };
}

/** The lock help icon (decision 8 of #353): only exists with a lock. */
const lockHelp = () => screen.queryByRole('button', { name: 'About the lock' });

const lockButton = () =>
  screen.getByRole('button', { name: t('lock.markingLock') }) as HTMLButtonElement;

describe('Marking Details: padlock', () => {
  it('locked: name and tooltip stay "Lock marking", with aria-pressed="true"', async () => {
    const { user } = renderMarkingPanel('M2');
    await user.click(lockButton());
    const locked = screen.getByRole('button', { name: 'Lock marking' });
    expect(locked.getAttribute('aria-pressed')).toBe('true');
    expect(tipOf(locked)).toContain('Lock marking');
  });

  it('the button locks and unlocks, with the state in aria-pressed and one undo entry per click', async () => {
    const { harness, user } = renderMarkingPanel('M2');
    expect(lockButton().getAttribute('aria-pressed')).toBe('false');
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(true);
    expect(lockButton().getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.notice')).toBeNull();
    const help = lockHelp();
    expect(help).not.toBeNull();
    expect(descriptionOf(help as HTMLElement)).toBe(t('lock.markingNotice'));
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(false);
    expect(lockHelp()).toBeNull();
    harness.store.undo();
    expect(marking(harness.project(), 'M2').locked).toBe(true);
  });

  it('the shortcut appears in the button tooltip', () => {
    renderMarkingPanel('M2');
    expect(lockButton().getAttribute('aria-keyshortcuts')).toBe('Alt+L');
  });

  it('locked: position, size and Delete are disabled; name and parent stay editable', async () => {
    const { harness, onDelete, user } = renderMarkingPanel('M2', {
      setup: (h) => h.actions.setMarkingLocked('M2', true),
    });
    for (const label of ['X', 'Y', 'Width', 'Height']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(remove.getAttribute('title')).toBe(t('lock.deleteBlocked'));
    await user.click(remove);
    expect(onDelete).not.toHaveBeenCalled();

    const name = screen.getByLabelText(t('marking.name'));
    expect((name as HTMLInputElement).disabled).toBe(false);
    await user.clear(name);
    await user.type(name, 'Other{Enter}');
    expect(marking(harness.project(), 'M2').name).toBe('Other');
  });

  it('unlocked, the fields and Delete come back', () => {
    renderMarkingPanel('M2');
    expect((screen.getByLabelText('X') as HTMLInputElement).disabled).toBe(false);
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
  });

  it('child of a locked parent: fields disabled and a notice with the parent name; its own padlock stays free', async () => {
    const { harness, user } = renderMarkingPanel('M2', {
      setup: (h) => h.actions.setMarkingLocked('M1', true),
    });
    expect(document.querySelector('.notice')).toBeNull();
    const help = lockHelp();
    expect(help).not.toBeNull();
    expect(descriptionOf(help as HTMLElement)).toBe(
      t('lock.inheritedNotice', { parent: 'Porta' }),
    );
    expect((screen.getByLabelText('Width') as HTMLInputElement).disabled).toBe(true);
    // Only the geometry locks: deleting the child is still allowed.
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
    expect(lockButton().getAttribute('aria-pressed')).toBe('false');
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(true);
  });

  it('parent with a locked child: nothing is blocked or warned', () => {
    renderMarkingPanel('M1', { setup: (h) => h.actions.setMarkingLocked('M3', true) });
    expect(document.querySelector('.notice')).toBeNull();
    expect(lockHelp()).toBeNull();
    for (const label of ['X', 'Y', 'Width', 'Height']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(false);
    }
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
  });

  it('moving the parent through X takes the locked child along', async () => {
    const { harness, user } = renderMarkingPanel('M1', {
      setup: (h) => h.actions.setMarkingLocked('M3', true),
    });
    const before = marking(harness.project(), 'M3').rect;
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '1010{Enter}');
    expect(marking(harness.project(), 'M1').rect.x).toBe(1010);
    expect(marking(harness.project(), 'M3').rect.x).toBe(before.x + 10);
  });

  it('read-only: the padlock is disabled', () => {
    renderMarkingPanel('M2', { readOnly: true });
    expect(lockButton().disabled).toBe(true);
  });
});

function renderImagePanel(
  containerId: string,
  { readOnly = false, setup }: { readOnly?: boolean; setup?: (h: Harness) => void } = {},
) {
  const harness = createHarness(sampleProject(), readOnly);
  setup?.(harness);
  const onDelete = vi.fn();
  renderLive(harness, (p) => (
    <SelectionPanel
      image={p.containers.find((i) => i.id === containerId) ?? null}
      display={undefined}
      readOnly={readOnly}
      busy={false}
      onReplace={() => undefined}
      onDelete={onDelete}
    />
  ));
  return { harness, onDelete, user: userEvent.setup() };
}

describe('Image Details: padlock', () => {
  const imageLock = () =>
    screen.getByRole('button', { name: t('lock.imageLock') }) as HTMLButtonElement;

  it('locks and unlocks the image, with a notice and Delete blocked', async () => {
    const { harness, onDelete, user } = renderImagePanel('I2');
    await user.click(imageLock());
    expect(harness.project().containers[1]?.locked).toBe(true);
    expect(imageLock().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Lock image' })).toBe(imageLock());
    expect(tipOf(imageLock())).toContain('Lock image');
    // Same treatment as the marking and the arrow: no written box; the icon next to the padlock.
    expect(document.querySelector('.notice')).toBeNull();
    const help = lockHelp() as HTMLElement;
    expect(descriptionOf(help)).toBe(t('lock.imageNotice'));
    expect(help.closest('.identity-lock')).toBe(imageLock().closest('.identity-lock'));
    const remove = screen.getByRole('button', { name: t('image.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    await user.click(remove);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(imageLock());
    expect(harness.project().containers[1]?.locked).toBe(false);
  });

  it('"Lock all markings of this image" is a single undo entry', async () => {
    const { harness, user } = renderImagePanel('I1');
    await user.click(screen.getByRole('button', { name: t('lock.lockAll') }));
    const locked = harness.project().markings.filter((m) => m.locked);
    expect(locked.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
    expect(harness.store.revision.value).toBe(1);
    // With all locked, the button offers to unlock all.
    await user.click(screen.getByRole('button', { name: t('lock.unlockAll') }));
    expect(harness.project().markings.some((m) => m.locked)).toBe(false);
    harness.store.undo();
    expect(harness.project().markings.filter((m) => m.locked)).toHaveLength(3);
    harness.store.undo();
    expect(harness.project().markings.some((m) => m.locked)).toBe(false);
  });

  it('image without markings does not show "lock all"', () => {
    const harness = createHarness(sampleProject());
    harness.actions.removeMarking('M4');
    renderLive(harness, (p) => (
      <SelectionPanel
        image={p.containers[1] ?? null}
        display={undefined}
        readOnly={false}
        busy={false}
        onReplace={() => undefined}
        onDelete={() => undefined}
      />
    ));
    expect(screen.queryByRole('button', { name: t('lock.lockAll') })).toBeNull();
  });

  it('with a locked marking, the image can still be deleted', () => {
    renderImagePanel('I1', { setup: (h) => h.actions.setMarkingLocked('M3', true) });
    const remove = screen.getByRole('button', { name: t('image.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
  });

  it('read-only: the lock buttons are disabled', () => {
    renderImagePanel('I1', { readOnly: true });
    expect(imageLock().disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: t('lock.lockAll') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

function renderTree(harness: Harness, onSelect = vi.fn()) {
  renderLive(harness, (p) => (
    <MarkingTree project={p} selection={harness.ui.selection.value} onSelect={onSelect} />
  ));
  return { onSelect, user: userEvent.setup() };
}

describe('Tree: padlock on the row', () => {
  const treeLock = (name: string) =>
    screen.getByRole('button', {
      name: t('lock.treeLock', { name }),
    }) as HTMLButtonElement;

  // SN2: the name and the tooltip are the same in both states; the state stays in aria-pressed.
  it('locked: the name and the tooltip stay "Lock {name}", with aria-pressed="true"', async () => {
    const harness = createHarness(sampleProject());
    const { user } = renderTree(harness);
    await user.click(treeLock('Porta'));
    const locked = screen.getByRole('button', { name: 'Lock Porta' });
    expect(locked.getAttribute('aria-pressed')).toBe('true');
    expect(locked.title).toBe('Lock Porta');
    expect(screen.queryByRole('button', { name: 'Unlock Porta' })).toBeNull();
  });

  it('each image and marking row has the padlock, and clicking toggles without selecting', async () => {
    const harness = createHarness(sampleProject());
    const { onSelect, user } = renderTree(harness);
    expect(treeLock('Porta').getAttribute('aria-pressed')).toBe('false');
    await user.click(treeLock('Porta'));
    expect(marking(harness.project(), 'M1').locked).toBe(true);
    expect(treeLock('Porta').getAttribute('aria-pressed')).toBe('true');
    expect(treeLock('Porta').className).toContain('tree-lock-on');
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(treeLock('images/lateral.jpg'));
    expect(harness.project().containers[0]?.locked).toBe(true);
    await user.click(treeLock('Porta'));
    expect(marking(harness.project(), 'M1').locked).toBe(false);
  });

  it('the descendant of a locked parent shows the dimmed padlock, without a button', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M1', true);
    renderTree(harness);
    expect(
      screen.queryByRole('button', { name: t('lock.treeLock', { name: 'Maçaneta' }) }),
    ).toBeNull();
    const signs = document.querySelectorAll('.tree-lock-inherited');
    // M2 and M3 inherit; M1 has its own button.
    expect(signs).toHaveLength(2);
    expect(within(signs[0] as HTMLElement).getByText(t('lock.inherited'))).toBeTruthy();
  });

  it('the locked row is still selectable', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M2', true);
    const { onSelect, user } = renderTree(harness);
    await user.click(screen.getByRole('button', { name: /^Maçaneta/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M2' });
  });

  it('read-only: the state shows, but the button is disabled', () => {
    const harness = createHarness(sampleProject(), true);
    renderTree(harness);
    expect(treeLock('Porta').disabled).toBe(true);
  });

  it('the button label carries the item name', () => {
    const harness = createHarness(sampleProject());
    renderTree(harness);
    expect(treeLock('Fechadura').title).toBe(t('lock.treeLock', { name: 'Fechadura' }));
  });
});
