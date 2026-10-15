import { signal } from '@preact/signals';
import { act, render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { expect } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../../src/app/useEditorShortcuts';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import {
  addAnnotation,
  addImage,
  addLayer,
  createMarking,
  createProject,
} from '../../../src/model';
import { createDisplayImages } from '../../../src/store/displayImages';
import { EditorContext, createEditorContextValue } from '../../../src/ui/EditorContext';
import { AT, propose } from '../../model/proposalFixtures';
import { openHarness, type HarnessOptions } from '../../store/proposalHarness';

/**
 * Sessão real sobre uma pasta em memória com propostas (a mesma de
 * `tests/store/proposalHarness.ts`) e o contexto do editor montado em cima dela, com a
 * revisão (`context.review`) que os componentes leem.
 */
export async function openReviewHarness(options: HarnessOptions = {}) {
  const harness = await openHarness(options);
  // A revisão do harness de store não é usada aqui: o contexto cria a dele.
  harness.review.dispose();
  const context = createEditorContextValue({
    kind: 'folder',
    session: harness.session,
    display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
    localId: null,
    unexported: signal(false),
  });
  return { ...harness, context, review: context.review, ui: context.ui };
}

export type ReviewHarness = Awaited<ReturnType<typeof openReviewHarness>>;

/**
 * Importação nova: projeto recém-criado (sem imagens, só a camada `L1`) e a proposta que
 * cria a camada `L2` "Eventos", a imagem `I1` (800×600, em (0, 0)) e nela a marcação `M1`
 * "Formulário" com uma anotação na camada nova. Nada disso existe fora da prévia.
 */
export function firstImport() {
  const base = createProject({
    name: 'Importação',
    now: AT,
    firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
  });
  let after = addLayer(base, { id: 'L2', name: 'Eventos', color: '#1E88E5' });
  after = addImage(after, {
    id: 'I1',
    file: 'images/cadastro.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M1',
    imageId: 'I1',
    rect: { x: 10, y: 10, width: 200, height: 100 },
    name: 'Formulário',
  });
  after = addAnnotation(after, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'L2',
    name: 'onClick',
  });
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Importação' }) };
}

export function renderInEditor(h: ReviewHarness, children: ComponentChildren) {
  return render(
    <EditorContext.Provider value={h.context}>{children}</EditorContext.Provider>,
  );
}

/** Os Detalhes da revisão (`ReviewPanel`) com os atalhos do editor ligados (A, R, N, C…). */
export function PanelWithShortcuts() {
  const dialogs = { current: null, show() {}, close() {} } as unknown as EditorDialogs;
  const commands = { exportProject: async () => {} } as unknown as ProjectCommands;
  useEditorShortcuts(dialogs, commands);
  return <ReviewPanel onGoToAnnotation={() => {}} onSelectMarking={() => {}} />;
}

/** Abre a proposta `P1`, seleciona o nível e monta os Detalhes da revisão com os atalhos. */
export async function showReviewPanel(
  options: Parameters<typeof openReviewHarness>[0],
  target: Parameters<ReviewHarness['review']['select']>[0],
) {
  const h = await openReviewHarness(options);
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select(target));
  renderInEditor(h, <PanelWithShortcuts />);
  return h;
}
