import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Etapa #950, itens 4 e 5 (#961, #962): a árvore da revisão só trata teclas quando o foco está
// nela (nos botões da linha, Enter decide), e anuncia a linha selecionada por
// `aria-activedescendant`, com posição e total do nível.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function mount() {
  const { base, proposal } = richScenario();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  renderInEditor(h, <ReviewLevels />);
  return h;
}

describe('árvore da revisão: teclado nos botões da linha', () => {
  it('Enter e setas num botão ✓/✕ não movem a seleção nem o foco', async () => {
    const h = await mount();
    const tree = screen.getByRole('tree');
    const rows = screen.getAllByRole('treeitem');
    const row = rows[1];
    if (!row) throw new Error('fixture');
    act(() => {
      fireEvent.click(row);
    });
    const selected = h.review.selected.value;
    const button = row.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'End' });
    fireEvent.keyDown(button, { key: 'Home' });
    expect(h.review.selected.value).toEqual(selected);
    const enter = fireEvent.keyDown(button, { key: 'Enter' });
    expect(enter).toBe(true); // sem preventDefault: o clique nativo acontece
    expect(document.activeElement).toBe(button);
    expect(tree.contains(button)).toBe(true);
  });
});

describe('árvore da revisão: aria-activedescendant', () => {
  it('as linhas têm id, posição e total, e a árvore aponta a selecionada', async () => {
    const h = await mount();
    const tree = screen.getByRole('tree');
    const rows = screen.getAllByRole('treeitem');
    for (const r of rows) {
      expect(r.id).toBeTruthy();
      expect(r.getAttribute('aria-setsize')).toBeTruthy();
      expect(r.getAttribute('aria-posinset')).toBeTruthy();
    }
    expect(rows[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(rows[0]?.getAttribute('aria-setsize')).toBe('1');
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    const selectedRow = document.querySelector('[role="treeitem"][aria-selected="true"]');
    expect(selectedRow).toBeTruthy();
    expect(tree.getAttribute('aria-activedescendant')).toBe(selectedRow?.id);
    expect(h.review.selected.value).not.toBeNull();
  });
});
