import { cleanup, render, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import type {
  EditorDialog,
  EditorDialogs as Dialogs,
} from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import { selectItems } from '../../src/store/ui';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Delete confirmation: when there are locked items inside, it says how many will be
// deleted along (the lock protects the item, it does not prevent deleting the parent).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function open(harness: Harness, current: EditorDialog) {
  // As in the editor, closing removes the dialog from the screen (it is not redrawn with the item already deleted).
  const close = vi.fn(() => cleanup());
  const dialogs = {
    current,
    show: vi.fn(),
    close,
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  } as unknown as Dialogs;
  render(
    <EditorContext.Provider value={harness.context}>
      <EditorDialogs dialogs={dialogs} />
    </EditorContext.Provider>,
  );
  const dialog = within(document.querySelector('dialog') as HTMLElement);
  return { dialog, close };
}

const marking = (h: Harness, id: string) => {
  const found = h.project().markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('confirm marking deletion', () => {
  it('without locked items inside, there is no warning', () => {
    const harness = createHarness(sampleProject());
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    expect(dialog.getByText(/will be deleted with 2 inner marking/)).toBeTruthy();
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('warns about the references that will break when an annotation of the marking is a target', () => {
    const base = sampleProject();
    const project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'A4' ? { ...a, values: { target: { annotationId: 'A3' } } } : a,
      ),
    };
    const harness = createHarness(project);
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    expect(dialog.getByText(t('ref.deleteMarking', { count: 1 }))).toBeTruthy();
  });

  it('without references to the marking annotations, there is no references warning', () => {
    const harness = createHarness(sampleProject());
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    expect(dialog.queryByText(/reference/)).toBeNull();
  });

  it('with locked descendants, warns how many will be deleted along', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M2', true);
    harness.actions.setMarkingLocked('M3', true);
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    const warning = dialog.getByRole('alert', { hidden: true });
    expect(warning.textContent).toBe(t('lock.deleteWarning', { locked: 2 }));
    expect(warning.textContent).toContain('2');
  });

  it('only counts the locked descendants of the item, not of other markings', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M3', true);
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M2'),
    });
    expect(dialog.getByRole('alert', { hidden: true }).textContent).toBe(
      t('lock.deleteWarning', { locked: 1 }),
    );
  });

  it('confirming deletes the parent with the locked ones and clears the selection', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M3', true);
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const { dialog, close } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    await userEvent.click(
      dialog.getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(close).toHaveBeenCalled();
    expect(harness.project().markings.map((m) => m.id)).toEqual(['M4']);
    expect(harness.ui.selection.value).toBeNull();
  });
});

describe('confirm image deletion', () => {
  it('without locked markings, there is no warning', () => {
    const harness = createHarness(sampleProject());
    const { dialog } = open(harness, {
      kind: 'deleteImage',
      image: harness.project().containers[0]!,
    });
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('with locked markings, warns how many will be deleted along', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setImageMarkingsLocked('I1', true);
    const { dialog } = open(harness, {
      kind: 'deleteImage',
      image: harness.project().containers[0]!,
    });
    expect(dialog.getByRole('alert', { hidden: true }).textContent).toBe(
      t('lock.deleteWarning', { locked: 3 }),
    );
  });

  it('the locked image itself never asks for confirmation, but the action would still be refused', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setImageLocked('I2', true);
    expect(harness.actions.removeContainer('I2')).toEqual({ ok: false, error: 'locked' });
  });
});

// Stage 8 (8.3), F10: destructive confirmations are alertdialog, described by the body; the
// aspect ratio question (non-destructive) remains a regular dialog.
describe('role of the confirmations', () => {
  it('deleting the marking is an alertdialog described by the body', () => {
    const harness = createHarness(sampleProject());
    open(harness, { kind: 'deleteMarking', marking: marking(harness, 'M1') });
    const el = document.querySelector('dialog') as HTMLElement;
    expect(el.getAttribute('role')).toBe('alertdialog');
    const body = document.getElementById(el.getAttribute('aria-describedby') ?? '');
    expect(body?.textContent).toMatch(/will be deleted/);
  });

  it('closing without saving too', () => {
    open(createHarness(sampleProject()), { kind: 'confirmClose' });
    expect(document.querySelector('dialog')?.getAttribute('role')).toBe('alertdialog');
  });

  it('the image aspect ratio is not', () => {
    open(createHarness(sampleProject()), {
      kind: 'aspect',
      change: { from: { width: 10, height: 10 }, to: { width: 20, height: 10 } },
      resolve: () => undefined,
    } as EditorDialog);
    expect(document.querySelector('dialog')?.hasAttribute('role')).toBe(false);
  });
});

describe('confirm selection deletion', () => {
  it('shows the summed impact and deletes everything in one undo entry', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M3', true);
    const items = [
      { kind: 'marking', id: 'M1' },
      { kind: 'image', id: 'I2' },
    ] as const;
    selectItems(harness.ui, items);
    const { dialog, close } = open(harness, { kind: 'deleteItems', items });
    expect(
      dialog.getByText(
        t('multi.deleteMessage', { markings: 4, containers: 1, annotations: 4 }),
      ),
    ).toBeTruthy();
    expect(dialog.getByRole('alert', { hidden: true }).textContent).toBe(
      t('lock.deleteWarning', { locked: 1 }),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(close).toHaveBeenCalled();
    expect(harness.project().markings).toHaveLength(0);
    expect(harness.project().containers.map((c) => c.id)).toEqual(['I1']);
    expect(harness.ui.selection.value).toBeNull();
    harness.store.undo();
    expect(harness.project().markings).toHaveLength(4);
  });
});
