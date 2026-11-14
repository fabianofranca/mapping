import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { openLocalPerspectives } from '../../src/storage/localPerspectives';
import { createDisplayImages } from '../../src/store/displayImages';
import { openSession } from '../../src/store/session';
import { locale } from '../../src/store/settings';
import { DeletePerspectiveDialog } from '../../src/ui/DeletePerspectiveDialog';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { ManagePerspectivesDialog } from '../../src/ui/ManagePerspectivesDialog';
import { NewPerspectiveDialog } from '../../src/ui/NewPerspectiveDialog';
import { sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Stage #659, PE3: the three perspective dialogs (New, Manage and Delete).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(cleanup);

async function makeContext(local: boolean, project: Project = sampleProject()) {
  const store = local ? await openLocalPerspectives() : null;
  const session = openSession({
    storage: createFolderStorage(new MemoryDirectory('project'), { copyId: 'harness' }),
    project,
    readOnly: false,
    localPerspectives: { store, initial: [] },
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => '2026-10-02T12:00:00.000Z',
  });
  const context = createEditorContextValue({
    kind: 'folder',
    session,
    display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
    localId: null,
    unexported: signal(false),
  });
  return { session, context };
}
type Ctx = Awaited<ReturnType<typeof makeContext>>;

function mount(ctx: Ctx, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={ctx.context}>{ui}</EditorContext.Provider>,
  );
}

const dlg = () => within(document.querySelector('dialog') as HTMLElement);
const perspectives = (ctx: Ctx) => ctx.context.store.project.value?.perspectives ?? [];

function seed(ctx: Ctx, name: string, extra: { local?: boolean; hide?: string[] } = {}) {
  const r = ctx.session.perspectiveActions.createPerspective({
    name,
    startFrom: 'empty',
    local: extra.local ?? false,
    hiddenLayers: extra.hide ?? [],
  });
  if (!r.ok) throw new Error('seed');
  return r.value;
}

describe('NewPerspectiveDialog', () => {
  it('empty name blocks Create; a repeated one shows an alert next to the field', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Facade');
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    const create = dlg().getByRole<HTMLButtonElement>('button', {
      name: t('perspective.new.create'),
      hidden: true,
    });
    expect(create.disabled).toBe(true);
    const field = dlg().getByRole('textbox', {
      name: t('perspective.new.name'),
      hidden: true,
    });
    await userEvent.type(field, 'facade');
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameTaken', { name: 'facade' }),
    );
    expect(create.disabled).toBe(true);
    await userEvent.clear(field);
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameEmpty'),
    );
    await userEvent.type(field, 'Other');
    expect(dlg().queryByRole('alert', { hidden: true })).toBeNull();
    expect(create.disabled).toBe(false);
  });

  it('Create saves, opens the new one and closes', async () => {
    const ctx = await makeContext(true);
    const onClose = vi.fn();
    mount(ctx, <NewPerspectiveDialog onClose={onClose} />);
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'View 1',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const created = perspectives(ctx);
    expect(created.map((p) => p.name)).toEqual(['View 1']);
    expect(ctx.session.perspective.id.value).toBe(created[0]?.id);
    expect(onClose).toHaveBeenCalled();
  });

  it('Start from copies the hidden layers; unchecking becomes hiddenLayers', async () => {
    const ctx = await makeContext(true);
    const src = seed(ctx, 'Source', { hide: ['L2'] });
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    // pt-BR kept: shared fixture data asserted by tests/model, tests/store (layer name L2 of sampleProject)
    const box = () =>
      dlg().getByRole<HTMLInputElement>('checkbox', { name: /Vidros/, hidden: true });
    expect(box().checked).toBe(true);
    await userEvent.selectOptions(
      dlg().getByRole('combobox', { name: t('perspective.new.startFrom'), hidden: true }),
      'Source',
    );
    expect(box().checked).toBe(false);
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Copy',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const copy = perspectives(ctx).find((p) => p.name === 'Copy');
    expect(copy?.hiddenLayers).toEqual(['L2']);
    expect(copy?.id).not.toBe(src);
  });

  it('a layer unchecked on Main becomes hiddenLayers', async () => {
    const ctx = await makeContext(true);
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    await userEvent.click(dlg().getByRole('checkbox', { name: /Vidros/, hidden: true }));
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Without glass',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    expect(perspectives(ctx)[0]?.hiddenLayers).toEqual(['L2']);
  });

  it('Only me creates a local perspective', async () => {
    const ctx = await makeContext(true);
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.whoMine'), hidden: true }),
    );
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Private',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const id = perspectives(ctx)[0]?.id ?? '';
    expect(ctx.session.perspective.localIds.value.has(id)).toBe(true);
  });

  it('without IndexedDB, Only me is disabled with the hint', async () => {
    const ctx = await makeContext(false);
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    expect(
      dlg().getByRole<HTMLButtonElement>('button', {
        name: t('perspective.new.whoMine'),
        hidden: true,
      }).disabled,
    ).toBe(true);
    expect(screen.getByText(t('perspective.new.localUnavailable'))).toBeTruthy();
  });
});

describe('ManagePerspectivesDialog', () => {
  const props = (over: Record<string, unknown> = {}) => ({
    onClose: () => undefined,
    onNew: () => undefined,
    onDelete: () => undefined,
    ...over,
  });
  const row = (name: string) =>
    within(
      dlg()
        .getAllByRole('row', { hidden: true })
        .find(
          (r) => within(r).queryByText(name) || r.textContent?.includes(name),
        ) as HTMLElement,
    );

  it('Main has rename and delete disabled', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    expect(dlg().getByRole('table', { hidden: true })).toBeTruthy();
    const main = row(t('perspective.principal'));
    const rename = main.getByRole<HTMLButtonElement>('button', {
      name: t('perspective.manage.rename', { name: t('perspective.principal') }),
      hidden: true,
    });
    const del = main.getByRole<HTMLButtonElement>('button', {
      name: t('perspective.manage.delete', { name: t('perspective.principal') }),
      hidden: true,
    });
    expect(rename.disabled).toBe(true);
    expect(del.disabled).toBe(true);
    expect(main.getByText(t('perspective.manage.fixed'))).toBeTruthy();
  });

  it('changing Who sees it moves the perspective to Only me', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    await userEvent.selectOptions(
      dlg().getByRole('combobox', {
        name: t('perspective.manage.who', { name: 'Facade' }),
        hidden: true,
      }),
      t('perspective.new.whoMine'),
    );
    await waitFor(() =>
      expect(ctx.session.perspective.localIds.value.has(id)).toBe(true),
    );
  });

  it("without IndexedDB, the row's Only me option is disabled", async () => {
    const ctx = await makeContext(false);
    seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const option = dlg().getByRole<HTMLOptionElement>('option', {
      name: t('perspective.new.whoMine'),
      hidden: true,
    });
    expect(option.disabled).toBe(true);
  });

  it('duplicate creates the copy with a unique name', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const dup = () =>
      userEvent.click(
        dlg().getByRole('button', {
          name: t('perspective.manage.duplicate', { name: 'Facade' }),
          hidden: true,
        }),
      );
    await dup();
    await dup();
    const names = perspectives(ctx).map((p) => p.name);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    expect(names).toContain(t('perspective.manage.copyName', { name: 'Facade' }));
  });

  it('renaming with a repeated name gives an error; with a free name it saves', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Facade');
    seed(ctx, 'Interior');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.rename', { name: 'Interior' }),
        hidden: true,
      }),
    );
    const field = dlg().getByRole('textbox', {
      name: t('perspective.manage.renameField', { name: 'Interior' }),
      hidden: true,
    });
    await userEvent.clear(field);
    await userEvent.type(field, 'facade');
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameTaken', { name: 'facade' }),
    );
    expect(
      dlg().getByRole<HTMLButtonElement>('button', {
        name: t('perspective.manage.renameSave'),
        hidden: true,
      }).disabled,
    ).toBe(true);
    await userEvent.clear(field);
    await userEvent.type(field, 'Room');
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.renameSave'),
        hidden: true,
      }),
    );
    expect(perspectives(ctx).map((p) => p.name)).toEqual(['Facade', 'Room']);
  });

  // Phase 1 of #954 (items 23 and 24).
  it('Who sees it: if the saving fails, the select returns to the perspective value and the error disappears on the next change', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const who = () =>
      dlg().getByRole<HTMLSelectElement>('combobox', {
        name: t('perspective.manage.who', { name: 'Facade' }),
        hidden: true,
      });
    const spy = vi
      .spyOn(ctx.session.perspectiveActions, 'setPerspectiveLocal')
      .mockResolvedValueOnce({ ok: false, error: 'write-failed' } as never);
    await userEvent.selectOptions(who(), t('perspective.new.whoMine'));
    await waitFor(() =>
      expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
        t('perspective.error'),
      ),
    );
    expect(who().value).toBe('all');
    spy.mockRestore();
    await userEvent.selectOptions(who(), t('perspective.new.whoMine'));
    await waitFor(() =>
      expect(ctx.session.perspective.localIds.value.has(id)).toBe(true),
    );
    expect(dlg().queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('rename: cancelling and reopening restarts from the current name', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const open = () =>
      userEvent.click(
        dlg().getByRole('button', {
          name: t('perspective.manage.rename', { name: 'Facade' }),
          hidden: true,
        }),
      );
    await open();
    const field = () =>
      dlg().getByRole<HTMLInputElement>('textbox', {
        name: t('perspective.manage.renameField', { name: 'Facade' }),
        hidden: true,
      });
    await userEvent.clear(field());
    await userEvent.type(field(), 'Draft');
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.renameCancel'),
        hidden: true,
      }),
    );
    await open();
    expect(field().value).toBe('Facade');
  });

  it('rename: a name changed from outside (undo, reload) appears in the field', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.rename', { name: 'Facade' }),
        hidden: true,
      }),
    );
    act(() => {
      expect(ctx.session.perspectiveActions.renamePerspective(id, 'Front').ok).toBe(true);
    });
    expect(
      dlg().getByRole<HTMLInputElement>('textbox', {
        name: t('perspective.manage.renameField', { name: 'Front' }),
        hidden: true,
      }).value,
    ).toBe('Front');
  });

  it('Delete calls onDelete with the id; New calls onNew', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    const onDelete = vi.fn();
    const onNew = vi.fn();
    mount(ctx, <ManagePerspectivesDialog {...props({ onDelete, onNew })} />);
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.delete', { name: 'Facade' }),
        hidden: true,
      }),
    );
    expect(onDelete).toHaveBeenCalledWith(id);
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.manage.new'), hidden: true }),
    );
    expect(onNew).toHaveBeenCalled();
  });
});

describe('DeletePerspectiveDialog', () => {
  it('is an alertdialog with the focus on Cancel', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    mount(ctx, <DeletePerspectiveDialog id={id} onClose={() => undefined} />);
    const el = document.querySelector('dialog') as HTMLElement;
    expect(el.getAttribute('role')).toBe('alertdialog');
    expect(
      dlg().getByText(t('perspective.delete.title', { name: 'Facade' }), {
        exact: false,
      }),
    ).toBeTruthy();
    expect((document.activeElement as HTMLElement).textContent).toBe(t('common.cancel'));
  });

  it('confirming removes the perspective from the project', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    const onClose = vi.fn();
    mount(ctx, <DeletePerspectiveDialog id={id} onClose={onClose} />);
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    expect(perspectives(ctx)).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel and Esc close without deleting', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Facade');
    const onClose = vi.fn();
    mount(ctx, <DeletePerspectiveDialog id={id} onClose={onClose} />);
    await userEvent.click(
      dlg().getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    document
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(perspectives(ctx)).toHaveLength(1);
  });
});
