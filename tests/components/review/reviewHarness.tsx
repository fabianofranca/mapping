import { signal } from '@preact/signals';
import { render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { createDisplayImages } from '../../../src/store/displayImages';
import { EditorContext, createEditorContextValue } from '../../../src/ui/EditorContext';
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

export function renderInEditor(h: ReviewHarness, children: ComponentChildren) {
  return render(
    <EditorContext.Provider value={h.context}>{children}</EditorContext.Provider>,
  );
}
