import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  createMarking,
  createProject,
  type Project,
  type Proposal,
} from '../../../src/model';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { rowDomId } from '../../../src/ui/review/levelRows';
import { AT, propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Etapa #954, fase 5 (itens 58, 60 e 61): a medida da linha vem de uma linha de item (não do
// cabeçalho de grupo), o rodapé de atalhos é um grupo nomeado e a árvore rola até a
// selecionada mesmo quando a medida só chega depois da primeira renderização.

const ROW = 30;
const GROUP = 50;
const VIEW = 300;
const scrollTops = new WeakMap<Element, number>();

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
  // O jsdom não tem layout: linhas de 30 px, cabeçalho de grupo de 50 px, janela de 300 px.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-group')) return GROUP;
    return this.hasAttribute('data-row') ? ROW : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tree' ? VIEW : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return scrollTops.get(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: HTMLElement,
    v: number,
  ) {
    scrollTops.set(this, v);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function manyMarkings(count: number): { base: Project; proposal: Proposal } {
  const base = addContainer(
    createProject({
      name: 'Grande',
      now: AT,
      firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
    }),
    { id: 'I1', file: 'images/a.webp', width: 800, height: 600 },
  );
  let after = base;
  for (let i = 0; i < count; i++) {
    after = createMarking(after, {
      id: `M${i}`,
      containerId: 'I1',
      rect: { x: 1, y: 1, width: 10, height: 10 },
      name: `Item ${i}`,
    });
  }
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Grande' }) };
}

describe('árvore da revisão: janela virtual', () => {
  it('58: a altura da linha vem de uma linha de item, não do cabeçalho de grupo', async () => {
    const { base, proposal } = manyMarkings(120);
    const old: Proposal = { ...proposal, status: 'superseded' };
    const next = propose(base, base, { id: 'P2', title: 'v2', supersedes: 'P1' });
    const h = await openReviewHarness({ project: base, proposals: [old, next] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    const drawn = tree.querySelectorAll('[data-row]').length;
    const total = 1 + old.changes.length; // um cabeçalho de grupo + as mudanças
    expect(drawn).toBeLessThan(total);
    const spacer = tree.lastElementChild as HTMLElement;
    const after = [...tree.children].filter((c) => c.getAttribute('aria-hidden')).at(-1);
    expect((after as HTMLElement).style.height).toBe(`${(total - drawn) * ROW}px`);
    expect(spacer).toBeTruthy();
  });

  it('60: o rodapé de atalhos é um grupo com nome', async () => {
    const { base, proposal } = manyMarkings(2);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    expect(screen.getByRole('group', { name: t('review.shortcuts') })).toBeTruthy();
  });

  it('61: rola até a selecionada que está além das linhas da primeira renderização', async () => {
    const { base, proposal } = manyMarkings(100);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const last = proposal.changes.at(-1);
    if (!last) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: last.id }));
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    expect(tree.scrollTop).toBeGreaterThan(0);
    expect(document.getElementById(rowDomId(`change:${last.id}`))).not.toBeNull();
  });

  it('61: expandir ou recolher um grupo não faz a lista pular de volta', async () => {
    const { base, proposal } = manyMarkings(100);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const last = proposal.changes.at(-1);
    if (!last) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: last.id }));
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    expect(tree.scrollTop).toBeGreaterThan(0);
    // A pessoa rola para o topo e recolhe tudo: a lista não volta à selecionada.
    act(() => {
      tree.scrollTop = 0;
    });
    act(() => screen.getByRole('button', { name: t('review.collapseAll') }).click());
    act(() => screen.getByRole('button', { name: t('review.expandAll') }).click());
    expect(tree.scrollTop).toBe(0);
  });

  // #1184 (item 8 da #1530): a seleção sai da janela virtual com End/Home/setas e o elemento do
  // `aria-activedescendant` continua desenhado, selecionado e com a posição certa.
  it('End, Home e seta a partir do fim: o activedescendant é uma linha desenhada e selecionada', async () => {
    const count = 100;
    const { base, proposal } = manyMarkings(count);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <ReviewLevels />);
    const tree = screen.getByRole('tree');
    tree.focus();

    // A árvore da fixture é uma corrente: proposta > container > marcação 0 > [criação da
    // marcação 1, marcação 1] > ... Cada marcação k < count - 1 tem dois filhos (a mudança que a
    // cria e a marcação k + 1); a última tem só a mudança que a cria. A mudança da última
    // marcação é a última da proposta e está na profundidade count + 3.
    const lastChange = proposal.changes.at(-1);
    if (!lastChange) throw new Error('fixture');
    const lastItemLevel = { posinset: 2, setsize: 2, level: count + 2 }; // marcação count - 1
    const lastChangeLevel = { posinset: 1, setsize: 1, level: count + 3 };
    const proposalLevel = { posinset: 1, setsize: 1, level: 1 };

    const press = (key: string): HTMLElement => {
      act(() => {
        tree.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
      });
      const id = tree.getAttribute('aria-activedescendant');
      expect(id, `${key}: aria-activedescendant`).toBeTruthy();
      const row = document.getElementById(id ?? '');
      expect(row, `${key}: a linha do activedescendant está no DOM`).not.toBeNull();
      return row as HTMLElement;
    };
    const expectRow = (
      row: HTMLElement,
      id: string,
      at: { posinset: number; setsize: number; level: number },
    ): void => {
      expect(row.id).toBe(id);
      expect(row.getAttribute('aria-selected')).toBe('true');
      expect(row.getAttribute('aria-posinset')).toBe(String(at.posinset));
      expect(row.getAttribute('aria-setsize')).toBe(String(at.setsize));
      expect(row.getAttribute('aria-level')).toBe(String(at.level));
    };

    const end = press('End');
    expectRow(end, rowDomId(`change:${lastChange.id}`), lastChangeLevel);
    expect(tree.scrollTop).toBeGreaterThan(0);

    const up = press('ArrowUp');
    expectRow(up, rowDomId(`item:M${count - 1}`), lastItemLevel);
    expect(tree.scrollTop).toBeGreaterThan(0);

    const home = press('Home');
    expectRow(home, rowDomId('proposal:'), proposalLevel);
    expect(tree.scrollTop).toBe(0);

    expectRow(press('End'), rowDomId(`change:${lastChange.id}`), lastChangeLevel);
  });
});
