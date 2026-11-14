import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAnyRef, typeOfAnnotation, type Project } from '../../src/model';
import { t } from '../../src/i18n';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { registerComposer } from '../../src/store/composerBridge';
import { locale } from '../../src/store/settings';
import { composingAnchor } from '../../src/store/threadUi';
import { showToolWindow } from '../../src/store/toolWindows';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { KeyValueGrid } from '../../src/ui/KeyValueGrid';
import { LayersPanel } from '../../src/ui/LayersPanel';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { TypedField } from '../../src/ui/TypedFields';
import { ThreadView } from '../../src/ui/comments/ThreadView';
import { sampleProject } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';
import { sampleThread } from '../model/threadFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

// Cite in the thread, Comment and Copy reference in the menus (CM5, decision 32): simple typed
// field (new ⋯ menu), pair, row, annotation, Tree item, canvas menu, layer and thread.
// pt-BR kept: shared fixture data asserted by tests/model (cadastroProject field keys 'texto', 'atributos'; sampleProject names 'Maçaneta', 'Amassado', 'images/frente.jpg'; harness folder 'projeto')

const disposers: (() => void)[] = [];
const insert = vi.fn();

/** Opens a composer (the "Cite in the thread" button only works with one open). */
function openComposer() {
  disposers.push(registerComposer({ insert }));
}

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
  clearIdentity();
  setIdentity('Marina Alves', 'marina@example.com');
  showToolWindow('tree');
  insert.mockClear();
});
afterEach(() => {
  cleanup();
  for (const off of disposers.splice(0)) off();
  Reflect.deleteProperty(navigator, 'clipboard');
});

function setupClipboard() {
  const user = userEvent.setup();
  const writeText = vi.fn((text: string) => {
    void text;
    return Promise.resolve();
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, write: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
  return { user, writeText };
}

/** Removes the folder name from the storage: the project becomes "outside a folder". */
function makeNotAFolder(harness: Harness) {
  Object.defineProperty(harness.context.session.storage, 'folderName', {
    value: undefined,
    configurable: true,
  });
}

const urlOf = (writeText: { mock: { calls: unknown[][] } }) =>
  String(writeText.mock.calls[0]?.[0]);

function names(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
}

describe('simple typed field', () => {
  function renderField(annotationId: string, key: string, harness: Harness) {
    renderLive(harness, (p: Project) => {
      const annotation = annotationOf(p, annotationId);
      const field = typeOfAnnotation(p, annotation)?.type.fields.find(
        (f) => f.key === key,
      );
      if (!field) throw new Error(`field ${key} does not exist`);
      return (
        <TypedField
          field={field}
          project={p}
          annotation={annotation}
          readOnly={harness.store.readOnly.value}
          onGoToAnnotation={() => undefined}
        />
      );
    });
  }
  const more = () => screen.getByRole('button', { name: /^Actions for field / });

  it('exposes the field to the DOM with data-field', () => {
    renderField('AB', 'texto', createHarness(cadastroProject()));
    expect(document.querySelector('[data-field="texto"]')).not.toBeNull();
  });

  it('the ⋯ menu has Copy reference, Cite in the thread and Comment', async () => {
    const { user } = setupClipboard();
    renderField('AB', 'texto', createHarness(cadastroProject()));
    await user.click(more());
    expect(names(screen.getByRole('menu'))).toEqual([
      t('copy.reference'),
      t('cite.insert'),
      t('comments.comment'),
    ]);
  });

  it('Copy reference copies ...//f/<field>', async () => {
    const { user, writeText } = setupClipboard();
    renderField('AB', 'texto', createHarness(cadastroProject()));
    await user.click(more());
    await user.click(screen.getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseAnyRef(urlOf(writeText))).toMatchObject({
      project: 'projeto',
      ref: { type: 'field', key: 'texto' },
    });
  });

  it('Cite in the thread is disabled, with the tooltip, with no composer open', async () => {
    const { user } = setupClipboard();
    renderField('AB', 'texto', createHarness(cadastroProject()));
    await user.click(more());
    const cite = screen.getByRole('menuitem', { name: t('cite.insert') });
    expect(cite.hasAttribute('disabled')).toBe(true);
    expect(cite.getAttribute('title')).toBe(t('cite.needComposer'));
  });

  it('with the composer open, Cite inserts the field and closes the menu', async () => {
    const { user } = setupClipboard();
    openComposer();
    renderField('AB', 'texto', createHarness(cadastroProject()));
    await user.click(more());
    const cite = screen.getByRole('menuitem', { name: t('cite.insert') });
    expect(cite.hasAttribute('disabled')).toBe(false);
    await user.click(cite);
    expect(insert).toHaveBeenCalledWith({
      kind: 'field',
      annotationId: 'AB',
      key: 'texto',
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Comment opens the thread anchored to the field', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(cadastroProject());
    renderField('AB', 'texto', harness);
    await user.click(more());
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({
      kind: 'field',
      annotationId: 'AB',
      key: 'texto',
    });
    expect(composingAnchor(harness.ui)).toEqual({
      kind: 'field',
      annotationId: 'AB',
      key: 'texto',
    });
  });

  it('outside a folder there is no Copy reference, but Cite and Comment work', async () => {
    const { user } = setupClipboard();
    openComposer();
    const harness = createHarness(cadastroProject());
    makeNotAFolder(harness);
    renderField('AB', 'texto', harness);
    await user.click(more());
    expect(names(screen.getByRole('menu'))).toEqual([
      t('cite.insert'),
      t('comments.comment'),
    ]);
    expect(
      screen.getByRole('menuitem', { name: t('cite.insert') }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('read-only: the menu opens, but Comment is disabled', async () => {
    const { user } = setupClipboard();
    renderField('AB', 'texto', createHarness(cadastroProject(), true));
    await user.click(more());
    expect(
      screen
        .getByRole('menuitem', { name: t('comments.comment') })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('menuitem', { name: t('copy.reference') })
        .hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe('pair (KeyValueGrid)', () => {
  function renderGrid(harness: Harness) {
    renderLive(harness, (p) => (
      <KeyValueGrid
        project={p}
        annotation={annotationOf(p, 'AU')}
        readOnly={harness.store.readOnly.value}
        onGoToAnnotation={() => undefined}
        onRemoveEntry={() => undefined}
      />
    ));
  }

  it('exposes the pair to the DOM with data-entry', () => {
    renderGrid(createHarness(cadastroProject()));
    expect(document.querySelector('[data-entry="EN"]')).not.toBeNull();
    expect(document.querySelector('[data-entry="EA"]')).not.toBeNull();
  });

  it('the pair menu gains Copy reference, Cite and Comment', async () => {
    const { user, writeText } = setupClipboard();
    openComposer();
    const harness = createHarness(cadastroProject());
    renderGrid(harness);
    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    const menu = screen.getByRole('menu');
    expect(names(menu)).toEqual([
      t('annotation.moveEntryUp'),
      t('annotation.moveEntryDown'),
      t('annotation.removeEntry'),
      t('copy.reference'),
      t('cite.insert'),
      t('comments.comment'),
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseAnyRef(urlOf(writeText))).toMatchObject({ ref: { type: 'entry' } });

    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    await user.click(screen.getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({
      kind: 'entry',
      annotationId: 'AU',
      entryId: 'EN',
    });

    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({
      kind: 'entry',
      annotationId: 'AU',
      entryId: 'EN',
    });
  });

  it('read-only: the menu opens; move and remove are disabled', async () => {
    const { user } = setupClipboard();
    renderGrid(createHarness(cadastroProject(), true));
    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    for (const label of [
      t('annotation.moveEntryDown'),
      t('annotation.removeEntry'),
      t('comments.comment'),
    ]) {
      expect(screen.getByRole('menuitem', { name: label }).hasAttribute('disabled')).toBe(
        true,
      );
    }
    expect(
      screen
        .getByRole('menuitem', { name: t('copy.reference') })
        .hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe('row (TableField)', () => {
  function renderTable(harness: Harness) {
    renderLive(harness, (p: Project) => {
      const annotation = annotationOf(p, 'AC');
      const field = typeOfAnnotation(p, annotation)?.type.fields.find(
        (f) => f.key === 'atributos',
      );
      if (!field) throw new Error('no table');
      return (
        <TypedField
          field={field}
          project={p}
          annotation={annotation}
          readOnly={harness.store.readOnly.value}
          onGoToAnnotation={() => undefined}
        />
      );
    });
  }
  const more = () => screen.getByRole('button', { name: 'Actions for row email' });

  it('exposes the table and the row to the DOM', () => {
    renderTable(createHarness(cadastroProject()));
    const field = document.querySelector('[data-field="atributos"]');
    expect(field).not.toBeNull();
    expect(field?.querySelector('[data-row-id="R1"]')).not.toBeNull();
  });

  it('the row menu gains Copy reference, Cite and Comment', async () => {
    const { user, writeText } = setupClipboard();
    openComposer();
    const harness = createHarness(cadastroProject());
    renderTable(harness);
    await user.click(more());
    const menu = screen.getByRole('menu');
    expect(names(menu).slice(-3)).toEqual([
      t('copy.reference'),
      t('cite.insert'),
      t('comments.comment'),
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseAnyRef(urlOf(writeText))).toMatchObject({
      ref: { type: 'row', key: 'atributos' },
    });

    await user.click(more());
    await user.click(screen.getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({
      kind: 'row',
      annotationId: 'AC',
      key: 'atributos',
      rowId: 'R1',
    });

    await user.click(more());
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({
      kind: 'row',
      annotationId: 'AC',
      key: 'atributos',
      rowId: 'R1',
    });
  });
});

describe('item (Tree and annotation card)', () => {
  function renderTree(harness: Harness) {
    return renderLive(harness, (p) => (
      <MarkingTree project={p} selection={null} onSelect={() => undefined} />
    ));
  }

  it('the marking ⋯ has Cite in the thread and Comment; Cite inserts the marking', async () => {
    const { user } = setupClipboard();
    openComposer();
    const harness = createHarness(sampleProject());
    renderTree(harness);
    await user.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    const menu = screen.getByRole('menu');
    expect(names(menu)).toEqual(
      expect.arrayContaining([t('cite.insert'), t('comments.comment')]),
    );
    await user.click(within(menu).getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'marking', id: 'M2' });
  });

  it('Comment on the marking and on the container opens the anchored thread', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderTree(harness);
    await user.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({ kind: 'marking', id: 'M2' });

    await user.click(
      screen.getByRole('button', {
        name: t('copy.itemActions', { name: 'images/frente.jpg' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({ kind: 'container', id: 'I2' });
  });

  it('outside a folder, the Tree still cites and comments (no Copy reference)', async () => {
    const { user } = setupClipboard();
    openComposer();
    const harness = createHarness(sampleProject());
    makeNotAFolder(harness);
    renderTree(harness);
    await user.click(
      screen.getByRole('button', { name: t('copy.itemActions', { name: 'Maçaneta' }) }),
    );
    const menu = screen.getByRole('menu');
    expect(names(menu)).not.toContain(t('copy.reference'));
    await user.click(within(menu).getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'marking', id: 'M2' });
  });

  it('the annotation card has the ⋯ with Cite and Comment (annotation anchor)', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const m = p.markings.find((x) => x.id === 'M1');
      const image = p.containers.find((i) => i.id === m?.containerId);
      if (!m || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={m}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    // The mock composer registers after the Threads section one: it is the most recent.
    openComposer();
    const card = document.querySelector('[data-annotation="A1"]') as HTMLElement;
    await user.click(
      within(card).getByRole('button', {
        name: t('copy.itemActions', { name: 'Amassado' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'annotation', id: 'A1' });
    await user.click(
      within(card).getByRole('button', {
        name: t('copy.itemActions', { name: 'Amassado' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(harness.ui.composing.value?.anchor).toEqual({
      kind: 'annotation',
      id: 'A1',
    });
  });
});

describe('canvas menu', () => {
  function renderMenu(harness: Harness) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
  }

  it('the canvas item gains Cite in the thread, without a duplicated Comment', async () => {
    const { user } = setupClipboard();
    openComposer();
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = {
      x: 40,
      y: 60,
      target: { kind: 'm', id: 'M3' },
      comment: { kind: 'marking', id: 'M3' },
    };
    const menu = await screen.findByRole('menu', { name: t('copy.canvasMenu') });
    const labels = names(menu);
    expect(labels).toContain(t('cite.insert'));
    expect(labels.filter((l) => l === t('comments.comment'))).toHaveLength(1);
    await user.click(within(menu).getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'marking', id: 'M3' });
    expect(harness.ui.canvasMenu.value).toBeNull();
  });

  it('the arrow can also be cited', async () => {
    const { user } = setupClipboard();
    openComposer();
    const harness = createHarness(sampleProject());
    const added = harness.actions.addArrow('M1', 'M4');
    if (!added.ok) throw new Error('addArrow failed');
    const arrowId = harness.project().arrows[0]!.id;
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'arrow', id: arrowId } };
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'arrow', id: arrowId });
  });

  it('with no composer open, Cite is disabled', async () => {
    const harness = createHarness(sampleProject());
    renderMenu(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M3' } };
    const menu = await screen.findByRole('menu');
    const cite = within(menu).getByRole('menuitem', { name: t('cite.insert') });
    expect(cite.hasAttribute('disabled')).toBe(true);
    expect(cite.getAttribute('title')).toBe(t('cite.needComposer'));
  });
});

describe('layer', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(
      screen.getByRole('button', { name: `More actions for layer ${name}` }),
    );
    return screen.getByRole('menu', { name: `More actions for layer ${name}` });
  };

  it('Cite in the thread and Copy reference (l/)', async () => {
    const { user, writeText } = setupClipboard();
    openComposer();
    const harness = createHarness(cadastroProject());
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={false} />);
    const first = harness.project().layers[0]!;
    let menu = await openMenu(user, first.name);
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(urlOf(writeText)).toMatch(/^mapping:\/\/projeto\/l\/[0-9a-z]+$/);

    menu = await openMenu(user, first.name);
    await user.click(within(menu).getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'layer', id: first.id });
  });

  it('outside a folder, the layer only cites', async () => {
    const { user } = setupClipboard();
    const harness = createHarness(cadastroProject());
    makeNotAFolder(harness);
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={false} />);
    const menu = await openMenu(user, harness.project().layers[0]!.name);
    expect(names(menu)).not.toContain(t('copy.reference'));
    expect(names(menu)).toContain(t('cite.insert'));
  });
});

describe('thread header', () => {
  it('the ⋯ has Cite in the thread and Copy reference (c/)', async () => {
    const { user, writeText } = setupClipboard();
    const harness = createHarness(sampleProject());
    const thread = sampleThread({ id: 'v1' });
    await harness.context.session.threads.create(thread);
    render(
      <EditorContext.Provider value={harness.context}>
        <ThreadView thread={thread} />
      </EditorContext.Provider>,
    );
    // The thread reply composer also registers: the mock one is the most recent.
    openComposer();
    await user.click(screen.getByRole('button', { name: t('thread.menu') }));
    const menu = screen.getByRole('menu');
    expect(names(menu)).toEqual(
      expect.arrayContaining([t('cite.insert'), t('copy.reference'), t('thread.delete')]),
    );
    await user.click(within(menu).getByRole('menuitem', { name: t('copy.reference') }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(urlOf(writeText)).toMatch(/^mapping:\/\/projeto\/c\/[0-9a-z]+$/);

    await user.click(screen.getByRole('button', { name: t('thread.menu') }));
    await user.click(screen.getByRole('menuitem', { name: t('cite.insert') }));
    expect(insert).toHaveBeenCalledWith({ kind: 'thread', id: 'v1' });
  });
});
