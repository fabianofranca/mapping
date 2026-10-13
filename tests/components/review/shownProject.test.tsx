import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { Breadcrumbs } from '../../../src/ui/Breadcrumbs';
import { LayersWindow } from '../../../src/ui/LayersWindow';
import { Minimap } from '../../../src/ui/Minimap';
import { StatusBar } from '../../../src/ui/StatusBar';
import { firstImport, openReviewHarness, renderInEditor } from './reviewHarness';

// Fase 8.2 (P1, O7 da rodada 4): o contrato do "projeto à vista". Na visão Proposto da
// revisão, tudo o que descreve a seleção e o projeto na tela (trilha, barra de status,
// Camadas, minimapa) lê `review.derived.shownProject`, nunca `store.committed`: numa
// importação nova, a imagem, a marcação e a camada só existem na prévia. Na visão Atual e
// fora da revisão, o confirmado.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const NOTHING = t('panel.nothingSelected');

async function openProposed() {
  const { base, proposal } = firstImport();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  expect(h.review.view.value).toBe('proposed');
  // A pessoa escolhe na Árvore a marcação que só existe na proposta.
  act(() => {
    h.ui.selection.value = { kind: 'marking', id: 'M1' };
  });
  // O canvas mediu a área das imagens à vista (o minimapa depende disso).
  h.context.view.size.value = { width: 380, height: 700 };
  h.context.view.bounds.value = { x: 0, y: 0, width: 800, height: 600 };
  return h;
}

describe('projeto à vista na revisão (contrato do shownProject)', () => {
  it('a trilha mostra Imagem › Marcação do item que só existe na proposta; na visão Atual, "Nada selecionado"', async () => {
    const h = await openProposed();
    const onSelect = vi.fn();
    renderInEditor(h, <Breadcrumbs onSelect={onSelect} />);
    const crumbs = screen.getAllByRole('button');
    expect(crumbs.map((c) => c.getAttribute('aria-label'))).toEqual([
      t('crumbs.image', { name: 'images/cadastro.webp' }),
      t('crumbs.marking', { name: 'Formulário' }),
    ]);
    expect(screen.queryByText(NOTHING)).toBeNull();
    crumbs[0]?.click();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'image', id: 'I1' });

    act(() => h.review.setView('current'));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(NOTHING)).toBeTruthy();
  });

  it('a barra de status mostra o nome da marcação proposta; na visão Atual, "Nada selecionado"', async () => {
    const h = await openProposed();
    renderInEditor(h, <StatusBar />);
    const bar = screen.getByRole('contentinfo');
    expect(within(bar).getByTitle(t('status.selectionLabel', { name: 'Formulário' })));
    act(() => h.review.setView('current'));
    expect(within(bar).getByTitle(t('status.selectionLabel', { name: NOTHING })));
  });

  it('Camadas lista a camada criada pela proposta na visão Proposto, e só as atuais na visão Atual', async () => {
    const h = await openProposed();
    renderInEditor(h, <LayersWindow stacked />);
    expect(
      screen
        .getAllByLabelText(t('layer.name'))
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Camada 1', 'Eventos']);
    act(() => h.review.setView('current'));
    expect(
      screen
        .getAllByLabelText(t('layer.name'))
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Camada 1']);
  });

  it('o minimapa desenha a imagem que só existe na proposta; na visão Atual, nenhuma', async () => {
    const h = await openProposed();
    const { container } = renderInEditor(h, <Minimap />);
    const images = () => container.querySelectorAll('.minimap-image').length;
    expect(screen.getByRole('button', { name: t('minimap.label') })).toBeTruthy();
    expect(images()).toBe(1);
    act(() => h.review.setView('current'));
    expect(images()).toBe(0);
  });

  it('fora da revisão, tudo volta ao projeto confirmado', async () => {
    const h = await openProposed();
    renderInEditor(h, <Breadcrumbs onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    act(() => h.review.close());
    // Ao sair, a seleção de um item que só existia na prévia é limpa pelo `useReviewSync`;
    // aqui, sem o hook, a trilha simplesmente não o encontra no confirmado.
    expect(screen.getByText(NOTHING)).toBeTruthy();
  });
});
