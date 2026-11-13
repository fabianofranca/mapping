import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// Paleta e âncora (R4, decisão 13): com uma marcação selecionada, "Adicionar" um tipo cujo
// componente declara `anchor` na raiz cria a instância ancorada e encostada à selecionada, em vez
// de dentro dela ou centrada; o resto segue a regra de hoje.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const ANCHOR = { side: 'top', align: 'center', offset: { main: 4, cross: 0 } };

/** O `m3-button` passa a declarar `anchor` na raiz (um tooltip dos de sempre). */
async function anchoredHarness(): Promise<LibraryHarness> {
  return libraryHarness({
    mutate: (files) => {
      const path = 'components/m3-button.json';
      const text = files.get(path);
      if (typeof text !== 'string') throw new Error('sem m3-button.json');
      files.set(path, JSON.stringify({ ...JSON.parse(text), anchor: ANCHOR }));
    },
  });
}

function renderLibrary(harness: LibraryHarness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <LibraryPalette onOpenSpecs={vi.fn()} />
    </EditorContext.Provider>,
  );
  return userEvent.setup();
}

const addButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', {
    name: new RegExp(`^${t('library.add')}.*: ${name}$`),
  });

/** Põe um FAB (folha de tamanho fixo) na I1 e o devolve. */
function addFab(
  harness: LibraryHarness,
  typeId = 'm3-fab',
  parentId: string | null = null,
) {
  const result = harness.actions.addComponent({
    containerId: 'I1',
    parentId,
    specId: 'material3',
    typeId,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const marking = (harness: LibraryHarness, id: string) =>
  harness.project().markings.find((m) => m.id === id)!;
const last = (harness: LibraryHarness) => harness.project().markings.at(-1)!;

describe('Adicionar um tipo com `anchor` na raiz', () => {
  it('com uma marcação selecionada, nasce ancorada nela e encostada (acima, centrada)', async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    harness.ui.selection.value = { kind: 'marking', id: fab };
    const user = renderLibrary(harness);
    const before = harness.project().markings.length;
    await user.click(addButton('Button'));

    const created = last(harness);
    expect(harness.project().markings).toHaveLength(before + 1);
    expect(created.id).not.toBe(fab);
    expect(created.anchor).toMatchObject({ to: fab });
    expect(created.containerId).toBe('I1');
    const target = marking(harness, fab).rect;
    // `anchor.offset.main` 4 (unidades, densidade 1): logo acima do FAB, centrada nele.
    expect(created.rect.y + created.rect.height).toBe(target.y - 4);
    expect(created.rect.x).toBe(
      Math.round(target.x + (target.width - created.rect.width) / 2),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created.id });
  });

  it('o rótulo do botão diz a quem ancora; os tipos sem `anchor` seguem com o rótulo de sempre', async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    harness.actions.renameMarking(fab, 'Ação');
    harness.ui.selection.value = { kind: 'marking', id: fab };
    renderLibrary(harness);
    expect(addButton('Button').textContent).toBe(
      t('library.addAnchored', { name: 'Ação' }),
    );
    // Sem `anchor` na raiz, o rótulo é o de sempre (a tela da marcação selecionada).
    expect(addButton('FAB').textContent).toMatch(
      new RegExp(`^${t('library.addToScreen', { name: '' }).trim()}`),
    );
  });

  it('numa marcação com slot a âncora vale em vez de entrar nela', async () => {
    const harness = await anchoredHarness();
    const column = addFab(harness, 'm3-column');
    harness.ui.selection.value = { kind: 'marking', id: column };
    const user = renderLibrary(harness);
    await user.click(addButton('Button'));
    const created = last(harness);
    expect(created.anchor).toMatchObject({ to: column });
    expect(created.parentId).not.toBe(column);
  });

  it('sem seleção, com um container selecionado ou num tipo sem `anchor`, vale a regra de hoje', async () => {
    const harness = await anchoredHarness();
    const fab = addFab(harness);
    const user = renderLibrary(harness);

    await user.click(addButton('Button'));
    expect(last(harness).anchor ?? null).toBeNull();

    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    await user.click(addButton('Button'));
    expect(last(harness).anchor ?? null).toBeNull();
    expect(last(harness).containerId).toBe('I1');

    harness.ui.selection.value = { kind: 'marking', id: fab };
    await user.click(addButton('FAB'));
    expect(last(harness).anchor ?? null).toBeNull();
    expect(within(document.body).queryByRole('alert')).toBeNull();
  });
});
