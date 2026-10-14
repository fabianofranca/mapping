import { act, cleanup, screen, waitFor, within } from '@testing-library/preact';
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
import { CanvasController } from '../../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../../src/canvas/viewState';
import { t } from '../../../src/i18n';
import { removeMarking } from '../../../src/model';
import { createEditorDerived } from '../../../src/store/derived';
import { createDisplayImages } from '../../../src/store/displayImages';
import { locale } from '../../../src/store/settings';
import { createEditorUi } from '../../../src/store/ui';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { installFakeCanvas } from '../../canvas/harness';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import {
  firstImport,
  openReviewHarness,
  renderInEditor,
  type ReviewHarness,
} from './reviewHarness';

// Devolução do portão da 8.2 (achado 7; R5.4a e R5.6 do guia): entre o `store.apply` e a
// publicação do `proposal.json` com `applied`, a revisão reavaliava as aceitas contra um
// projeto que já as tinha. A tela mostrava "Aplicar bloqueado" com o id cru da camada
// recém-criada e "O projeto mudou desde a sua última sessão". Aqui a gravação do
// `proposal.json` é segurada para olhar a tela no meio do aplicar.

const frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
};

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  // A cada teste: o `vi.restoreAllMocks()` do `afterEach` desfaz o contexto 2D falso.
  installFakeCanvas();
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Segura a próxima gravação do `proposal.json` até `release()`. */
function holdProposalWrite(h: ReviewHarness) {
  const original = h.storage.writeProposal.bind(h.storage);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reachedNow: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reachedNow = resolve;
  });
  vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async (id, text) => {
    reachedNow();
    await held;
    return original(id, text);
  });
  return { reached, release };
}

/** Nenhum dos dois avisos falsos na tela. */
function expectNoFalseWarnings() {
  expect(screen.queryByText(t('review.issue.title'))).toBeNull();
  expect(screen.queryByText(t('review.stale.title'))).toBeNull();
}

function renderReview(h: ReviewHarness) {
  renderInEditor(
    h,
    <>
      <ReviewBar onExit={() => {}} />
      <ReviewDetails />
      <ProposalsWindow onHelp={() => {}} />
    </>,
  );
}

/** Clica em "Aplicar aceitas" e espera a gravação do `proposal.json` começar. */
async function applyAndHold(h: ReviewHarness) {
  const hold = holdProposalWrite(h);
  const bar = screen.getByRole('region', { name: 'Revisão da proposta' });
  const button = within(bar).getByRole('button', { name: /Aplicar aceitas · 1/ });
  act(() => button.click());
  await act(async () => {
    await hold.reached;
  });
  return { hold, bar };
}

describe('aplicar aceitas sem avisos falsos (devolução do portão da 8.2)', () => {
  it('R5.4a: aceitar o grupo Projeto e aplicar; no meio e no fim, sem "Aplicar bloqueado" nem "O projeto mudou"', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    await h.review.decide({ level: 'project', id: null }, 'accepted');
    act(() => h.review.select({ level: 'project', id: null }));
    renderReview(h);
    expectNoFalseWarnings();

    const { hold, bar } = await applyAndHold(h);
    // O projeto já tem a camada; a proposta ainda não diz que foi aplicada.
    expect(h.session.store.committed.value?.layers.map((l) => l.name)).toContain(
      'Eventos',
    );
    expect(h.review.derived.proposal.value?.applied).toEqual({});
    expectNoFalseWarnings();
    // Enquanto aplica, o botão não aplica de novo e diz por quê.
    const busy = within(bar).getByRole('button', { name: /Aplicar aceitas/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('title')).toContain('Aplicando as aceitas…');

    await act(async () => {
      hold.release();
      await h.session.proposals.settled();
    });
    await waitFor(() =>
      expect(Object.keys(h.review.derived.proposal.value?.applied ?? {})).toHaveLength(1),
    );
    expectNoFalseWarnings();
    expect(h.session.store.committed.value?.layers.map((l) => l.name)).toContain(
      'Eventos',
    );
  });

  it('remoção: o retrato cita um item que já saiu do projeto; cartões, níveis e canvas desenham sem lançar', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M3'), {
      id: 'P1',
      title: 'Tirar a fechadura',
    });
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    act(() => h.review.select({ level: 'item', id: 'M3' }));
    renderReview(h);

    const ui = createEditorUi();
    const view = createCanvasViewState();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: h.session.store,
      actions: h.session.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived: createEditorDerived(h.session.store, ui, h.review.derived.shownProject),
      view,
      review: h.review,
    });
    flushFrames();

    const { hold } = await applyAndHold(h);
    // A marcação já saiu do projeto ao vivo; os cartões e os níveis continuam de pé.
    expect(h.session.store.committed.value?.markings.some((m) => m.id === 'M3')).toBe(
      false,
    );
    expect(() => flushFrames()).not.toThrow();
    expectNoFalseWarnings();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.getByRole('tree', { name: 'Níveis da proposta' })).toBeTruthy();

    await act(async () => {
      hold.release();
      await h.session.proposals.settled();
    });
    await waitFor(() => expect(h.review.derived.proposal.value?.status).toBe('applied'));
    expect(() => flushFrames()).not.toThrow();
    expectNoFalseWarnings();
    controller.destroy();
    container.remove();
  });
});
