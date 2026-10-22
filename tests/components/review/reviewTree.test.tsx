import { act, cleanup, screen } from '@testing-library/preact';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EditorScreen } from '../../../src/app/Editor';
import { addContainer, createMarking, createProject } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { showToolWindow } from '../../../src/store/toolWindows';
import { TreeWindow } from '../../../src/ui/TreeWindow';
import { installFakeCanvas } from '../../canvas/harness';
import { AT, propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Achado 12 do relato de 2026-10-11: na revisão de uma importação nova (projeto sem
// imagens com uma proposta que cria imagens e marcações), a Árvore dizia "Nenhuma imagem
// ainda." e o estado vazio do canvas aparecia por cima das imagens propostas, porque os
// dois liam o projeto atual e não a prévia ("como ficaria") da visão Proposto.

beforeAll(() => {
  installFakeCanvas();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
  showToolWindow('tree');
});
afterEach(cleanup);
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Projeto recém-criado (sem imagens) e a proposta que cria a primeira imagem com um item. */
function firstImport() {
  const base = createProject({
    name: 'Importação',
    now: AT,
    firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
  });
  let after = addContainer(base, {
    id: 'I1',
    file: 'images/cadastro.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 200, height: 100 },
    name: 'Formulário',
  });
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Importação' }) };
}

const TREE_EMPTY = 'Nenhuma imagem ainda.';
const CANVAS_EMPTY = 'Nenhuma imagem ainda. Adicione fotos para montar o canvas.';

describe('revisão de uma importação nova', () => {
  it('a Árvore lê a prévia na visão Proposto (imagens e itens criados) e o atual na visão Atual', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    expect(h.review.view.value).toBe('proposed');
    const onSelect = vi.fn();
    renderInEditor(h, <TreeWindow onSelect={onSelect} />);
    expect(screen.queryByText(TREE_EMPTY)).toBeNull();
    expect(screen.getByRole('button', { name: /^images\/cadastro\.webp/ })).toBeTruthy();
    const item = screen.getByRole('button', { name: /^Formulário/ });
    item.click();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });

    // Na visão Atual, o projeto como está: ainda sem imagens.
    act(() => h.review.setView('current'));
    expect(screen.getByText(TREE_EMPTY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Formulário/ })).toBeNull();

    // Fora da revisão, o projeto atual.
    act(() => h.review.close());
    expect(screen.getByText(TREE_EMPTY)).toBeTruthy();
  });

  it('o estado vazio do canvas não aparece por cima das imagens propostas', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const { container } = renderInEditor(h, <EditorScreen />);
    expect(screen.queryByText(CANVAS_EMPTY)).toBeNull();
    expect(container.querySelector('.canvas-empty')).toBeNull();

    act(() => h.review.setView('current'));
    expect(screen.getByText(CANVAS_EMPTY)).toBeTruthy();

    act(() => h.review.close());
    expect(screen.getByText(CANVAS_EMPTY)).toBeTruthy();
    expect(container.querySelector('.canvas-empty')).toBeTruthy();
  });
});
