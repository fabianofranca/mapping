import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
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

// Etapa #659, PE3: os três diálogos das perspectivas (Nova, Gerenciar e Apagar).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
});
afterEach(cleanup);

async function makeContext(local: boolean, project: Project = sampleProject()) {
  const store = local ? await openLocalPerspectives() : null;
  const session = openSession({
    storage: createFolderStorage(new MemoryDirectory('projeto'), { copyId: 'harness' }),
    project,
    readOnly: false,
    localPerspectives: { store, initial: [] },
    prepareImage: () => Promise.reject(new Error('sem imagens')),
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
  it('nome vazio bloqueia Criar; repetido mostra alerta junto ao campo', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Fachada');
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
    await userEvent.type(field, 'fachada');
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameTaken', { name: 'fachada' }),
    );
    expect(create.disabled).toBe(true);
    await userEvent.clear(field);
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameEmpty'),
    );
    await userEvent.type(field, 'Outra');
    expect(dlg().queryByRole('alert', { hidden: true })).toBeNull();
    expect(create.disabled).toBe(false);
  });

  it('Criar grava, abre a nova e fecha', async () => {
    const ctx = await makeContext(true);
    const onClose = vi.fn();
    mount(ctx, <NewPerspectiveDialog onClose={onClose} />);
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Vista 1',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const created = perspectives(ctx);
    expect(created.map((p) => p.name)).toEqual(['Vista 1']);
    expect(ctx.session.perspective.id.value).toBe(created[0]?.id);
    expect(onClose).toHaveBeenCalled();
  });

  it('Começar de copia as camadas escondidas; desmarcar vira hiddenLayers', async () => {
    const ctx = await makeContext(true);
    const src = seed(ctx, 'Origem', { hide: ['L2'] });
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    const box = () =>
      dlg().getByRole<HTMLInputElement>('checkbox', { name: /Vidros/, hidden: true });
    expect(box().checked).toBe(true);
    await userEvent.selectOptions(
      dlg().getByRole('combobox', { name: t('perspective.new.startFrom'), hidden: true }),
      'Origem',
    );
    expect(box().checked).toBe(false);
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Cópia',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const copy = perspectives(ctx).find((p) => p.name === 'Cópia');
    expect(copy?.hiddenLayers).toEqual(['L2']);
    expect(copy?.id).not.toBe(src);
  });

  it('camada desmarcada na Principal vira hiddenLayers', async () => {
    const ctx = await makeContext(true);
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    await userEvent.click(dlg().getByRole('checkbox', { name: /Vidros/, hidden: true }));
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Sem vidros',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    expect(perspectives(ctx)[0]?.hiddenLayers).toEqual(['L2']);
  });

  it('Só eu cria uma perspectiva local', async () => {
    const ctx = await makeContext(true);
    mount(ctx, <NewPerspectiveDialog onClose={() => undefined} />);
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.whoMine'), hidden: true }),
    );
    await userEvent.type(
      dlg().getByRole('textbox', { name: t('perspective.new.name'), hidden: true }),
      'Privada',
    );
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.new.create'), hidden: true }),
    );
    const id = perspectives(ctx)[0]?.id ?? '';
    expect(ctx.session.perspective.localIds.value.has(id)).toBe(true);
  });

  it('sem IndexedDB, Só eu fica desabilitado com a dica', async () => {
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

  it('a Principal tem renomear e apagar desabilitados', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Fachada');
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

  it('trocar Quem vê move a perspectiva para Só eu', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Fachada');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    await userEvent.selectOptions(
      dlg().getByRole('combobox', {
        name: t('perspective.manage.who', { name: 'Fachada' }),
        hidden: true,
      }),
      t('perspective.new.whoMine'),
    );
    await waitFor(() =>
      expect(ctx.session.perspective.localIds.value.has(id)).toBe(true),
    );
  });

  it('sem IndexedDB, a opção Só eu da linha fica desabilitada', async () => {
    const ctx = await makeContext(false);
    seed(ctx, 'Fachada');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const option = dlg().getByRole<HTMLOptionElement>('option', {
      name: t('perspective.new.whoMine'),
      hidden: true,
    });
    expect(option.disabled).toBe(true);
  });

  it('duplicar cria a cópia com nome único', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Fachada');
    mount(ctx, <ManagePerspectivesDialog {...props()} />);
    const dup = () =>
      userEvent.click(
        dlg().getByRole('button', {
          name: t('perspective.manage.duplicate', { name: 'Fachada' }),
          hidden: true,
        }),
      );
    await dup();
    await dup();
    const names = perspectives(ctx).map((p) => p.name);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    expect(names).toContain(t('perspective.manage.copyName', { name: 'Fachada' }));
  });

  it('renomear com nome repetido dá erro; com nome livre grava', async () => {
    const ctx = await makeContext(true);
    seed(ctx, 'Fachada');
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
    await userEvent.type(field, 'fachada');
    expect(dlg().getByRole('alert', { hidden: true }).textContent).toBe(
      t('perspective.new.nameTaken', { name: 'fachada' }),
    );
    expect(
      dlg().getByRole<HTMLButtonElement>('button', {
        name: t('perspective.manage.renameSave'),
        hidden: true,
      }).disabled,
    ).toBe(true);
    await userEvent.clear(field);
    await userEvent.type(field, 'Sala');
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.renameSave'),
        hidden: true,
      }),
    );
    expect(perspectives(ctx).map((p) => p.name)).toEqual(['Fachada', 'Sala']);
  });

  it('Apagar chama onDelete com o id; Nova chama onNew', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Fachada');
    const onDelete = vi.fn();
    const onNew = vi.fn();
    mount(ctx, <ManagePerspectivesDialog {...props({ onDelete, onNew })} />);
    await userEvent.click(
      dlg().getByRole('button', {
        name: t('perspective.manage.delete', { name: 'Fachada' }),
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
  it('é um alertdialog com o foco em Cancelar', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Fachada');
    mount(ctx, <DeletePerspectiveDialog id={id} onClose={() => undefined} />);
    const el = document.querySelector('dialog') as HTMLElement;
    expect(el.getAttribute('role')).toBe('alertdialog');
    expect(
      dlg().getByText(t('perspective.delete.title', { name: 'Fachada' }), {
        exact: false,
      }),
    ).toBeTruthy();
    expect((document.activeElement as HTMLElement).textContent).toBe(t('common.cancel'));
  });

  it('confirmar remove a perspectiva do projeto', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Fachada');
    const onClose = vi.fn();
    mount(ctx, <DeletePerspectiveDialog id={id} onClose={onClose} />);
    await userEvent.click(
      dlg().getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    expect(perspectives(ctx)).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancelar e Esc fecham sem apagar', async () => {
    const ctx = await makeContext(true);
    const id = seed(ctx, 'Fachada');
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
