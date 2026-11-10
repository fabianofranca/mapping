import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { sampleProject } from '../model/fixtures';
import { firstImport, openReviewHarness, renderInEditor } from './review/reviewHarness';
import { createHarness } from './harness';
import { EditorContext } from '../../src/ui/EditorContext';
import { render } from '@testing-library/preact';

// BC1 (#1064): o "…" do caminho recolhido e o menu do caminho inteiro. Com 3 ou mais trechos
// o `Breadcrumbs` sempre desenha o "…" (o CSS o esconde na barra larga); com 2 não há.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

function openPath(selection: Parameters<typeof select>[1]) {
  const harness = createHarness(sampleProject());
  select(harness, selection);
  const onSelect = vi.fn();
  render(
    <EditorContext.Provider value={harness.context}>
      <Breadcrumbs onSelect={onSelect} />
    </EditorContext.Provider>,
  );
  return { harness, onSelect };
}

function select(
  harness: ReturnType<typeof createHarness>,
  selection: typeof harness.ui.selection.value,
) {
  harness.ui.selection.value = selection;
}

const showFull = () => screen.queryByRole('button', { name: t('crumbs.showFull') });

describe('o "…" do caminho', () => {
  it('com 3 ou mais trechos há o botão "…", com nome acessível', () => {
    openPath({ kind: 'marking', id: 'M2' });
    const more = showFull();
    expect(more).toBeTruthy();
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('com 2 trechos (Canvas › Imagem) não há "…"', () => {
    openPath({ kind: 'image', id: 'I1' });
    expect(showFull()).toBeNull();
  });

  it('o menu lista do Canvas à seleção com os nomes inteiros', async () => {
    openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    const menu = screen.getByRole('menu', { name: t('crumbs.menu') });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      t('canvas.name'),
      'images/lateral.jpg',
      'Porta',
      'Maçaneta',
    ]);
    // O Canvas só rotula; o último é a seleção.
    expect((items[0] as HTMLButtonElement).disabled).toBe(true);
    expect(items.map((i) => i.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'location',
    ]);
  });

  it('escolher um nível seleciona o item dele e fecha o menu', async () => {
    const { onSelect } = openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Porta' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Esc fecha o menu e o foco volta ao "…"', async () => {
    openPath({ kind: 'marking', id: 'M2' });
    await userEvent.click(showFull()!);
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(showFull());
  });

  it('na revisão, Proposto, o menu mostra o caminho da vista aberta', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    renderInEditor(h, <Breadcrumbs onSelect={() => undefined} />);
    await userEvent.click(showFull()!);
    const menu = screen.getByRole('menu', { name: t('crumbs.menu') });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([t('canvas.name'), 'images/cadastro.webp', 'Formulário']);
  });
});
