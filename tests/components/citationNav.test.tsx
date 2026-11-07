import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArrow, type CitationTarget } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectedThreadId } from '../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { goToCitation } from '../../src/ui/comments/citationNav';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import { richScenario } from '../store/proposalHarness';
import { createHarness } from './harness';
import { openReviewHarness } from './review/reviewHarness';

// Navegação do clique num chip de citação (etapa Comentários, CM5): reaproveita as funções do
// store (seleção, ir até a anotação, selecionar conversa, abrir a revisão).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
});
afterEach(() => {
  hideToolWindow('proposals');
});

const withArrow = () =>
  createHarness(
    createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M2', name: 'Fluxo' }),
  );

const go = (h: ReturnType<typeof createHarness>, target: CitationTarget) =>
  goToCitation(h.context, target);

describe('goToCitation', () => {
  it('marcação, container e seta: seleciona o item', () => {
    const h = withArrow();
    go(h, { kind: 'marking', id: 'M2' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    go(h, { kind: 'container', id: 'I2' });
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
    go(h, { kind: 'arrow', id: 'R1' });
    expect(h.ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
  });

  it('marcação numa camada escondida mostra a camada', () => {
    const h = withArrow();
    h.ui.hiddenLayers.value = new Set(['L1']);
    go(h, { kind: 'annotation', id: 'A1' });
    expect(h.ui.hiddenLayers.value.has('L1')).toBe(false);
  });

  it('anotação: seleciona a marcação dona e foca a anotação', () => {
    const h = withArrow();
    go(h, { kind: 'annotation', id: 'A3' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(h.ui.focusAnnotation.value).toBe('A3');
    expect(h.ui.focusField.value).toBeNull();
  });

  it('campo e linha: selecionam o dono da anotação e focam o campo', () => {
    const h = withArrow();
    go(h, { kind: 'field', annotationId: 'A1', key: 'tipo' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(h.ui.focusAnnotation.value).toBe('A1');
    expect(h.ui.focusField.value).toBe('tipo');
    h.ui.focusField.value = null;
    go(h, { kind: 'row', annotationId: 'A1', key: 'itens', rowId: 'W1' });
    expect(h.ui.focusAnnotation.value).toBe('A1');
    expect(h.ui.focusField.value).toBe('itens');
  });

  it('par: seleciona o dono da anotação e foca a anotação, sem campo', () => {
    const h = withArrow();
    h.ui.focusField.value = 'velho';
    go(h, { kind: 'entry', annotationId: 'A2', entryId: 'E3' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(h.ui.focusAnnotation.value).toBe('A2');
    expect(h.ui.focusField.value).toBeNull();
  });

  it('camada: mostra a camada escondida e abre a janela Camadas', () => {
    const h = withArrow();
    h.ui.hiddenLayers.value = new Set(['L2']);
    hideToolWindow('layers');
    go(h, { kind: 'layer', id: 'L2' });
    expect(h.ui.hiddenLayers.value.has('L2')).toBe(false);
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('conversa: seleciona a conversa e o item dela', async () => {
    const h = withArrow();
    await h.context.session.threads.create(
      sampleThread({ id: 'cx1', anchor: { kind: 'marking', id: 'M3' } }),
    );
    go(h, { kind: 'thread', id: 'cx1' });
    expect(selectedThreadId(h.ui)).toBe('cx1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M3' });
  });

  it('conversa que não existe mais: não muda a seleção', () => {
    const h = withArrow();
    go(h, { kind: 'thread', id: 'sumiu' });
    expect(h.ui.selection.value).toBeNull();
  });

  it('proposta: abre a revisão e as janelas Detalhes e Propostas', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    hideToolWindow('proposals');
    goToCitation(h.context, { kind: 'proposal', id: 'P1' });
    expect(h.review.proposalId.value).toBe('P1');
    expect(isToolWindowOpen('proposals')).toBe(true);
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('proposta que não existe: avisa num toast e não abre a revisão', async () => {
    const h = await openReviewHarness({ proposals: [] });
    goToCitation(h.context, { kind: 'proposal', id: 'nenhuma' });
    expect(h.review.proposalId.value).toBeNull();
    expect(h.ui.toast.value).not.toBeNull();
  });
});
