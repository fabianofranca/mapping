import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Change, Proposal, ProposalRevision } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ChangePopover } from '../../../src/ui/review/ChangePopover';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT, revisedScenario } from './revisedFixture';

// Bloco "Antes da revisão" no popover da mudança revisada (etapa #644, CP3): o que o
// agente tinha proposto e a decisão de antes; só campos que diferem numa criação; arquivo
// de imagem com nome e tamanho; nada para a mudança nova.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

/** Troca a revisão da proposta pela dada (`changed`/`added`), com mudanças extras. */
function withRevision(
  proposal: Proposal,
  revision: Partial<ProposalRevision>,
  extra: readonly Change[] = [],
): Proposal {
  return {
    ...proposal,
    formatVersion: 5,
    changes: [...proposal.changes, ...extra],
    revisions: [
      {
        at: REVISED_AT,
        baseRevision: 0,
        operations: [],
        changed: {},
        added: [],
        dropped: [],
        ...revision,
      },
    ],
  };
}

async function openPopover(proposal: Proposal, changeId: string, field: string) {
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1')).toMatchObject({ ok: true });
  const change = proposal.changes.find((c) => c.id === changeId);
  if (!change) throw new Error('mudança desconhecida');
  renderInEditor(
    h,
    <ChangePopover subject={{ change, field, part: false }} close={() => {}} />,
  );
  return h;
}

describe('Antes da revisão: mudança trocada', () => {
  it('mostra o que o agente tinha proposto e "Sem decisão"', async () => {
    const { proposal, changedId } = revisedScenario();
    await openPopover(proposal, changedId, 'name');
    expect(screen.getByText('Antes da revisão')).toBeTruthy();
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('O agente tinha proposto')).toBeTruthy();
    expect(within(block).getByText('Porta dianteira')).toBeTruthy();
    expect(within(block).getByText('Sem decisão')).toBeTruthy();
  });

  it('a decisão de antes "rejeitada" vira "Você tinha rejeitado"', async () => {
    const { proposal, changedId } = revisedScenario();
    const rejected = withRevision(proposal, {
      changed: { [changedId]: { to: 'Porta dianteira', state: 'rejected' } },
    });
    await openPopover(rejected, changedId, 'name');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('Você tinha rejeitado')).toBeTruthy();
    expect(within(block).queryByText('Sem decisão')).toBeNull();
  });

  it('a mudança nova na revisão não tem o bloco', async () => {
    const { proposal, addedId } = revisedScenario();
    await openPopover(proposal, addedId, 'name');
    expect(screen.queryByText('Antes da revisão')).toBeNull();
  });

  it('decidida, a mudança deixa de ter marca e o bloco some', async () => {
    const { proposal, changedId } = revisedScenario();
    const h = await openPopover(proposal, changedId, 'name');
    expect(screen.getByText('Antes da revisão')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(screen.queryByText('Antes da revisão')).toBeNull();
  });
});

describe('Antes da revisão: criação e imagem', () => {
  it('numa criação mostra só os campos que diferem do atual', async () => {
    const { proposal, ids } = richScenario();
    const created = proposal.changes.find((c) => c.id === ids.marking) as Change;
    const to = created.to as Record<string, unknown>;
    const old = { ...to, name: 'Botão antigo' };
    const revised = withRevision(proposal, {
      changed: { [created.id]: { to: old as never, state: null } },
    });
    await openPopover(revised, created.id, '');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('O agente tinha proposto')).toBeTruthy();
    expect(within(block).getByText('Botão antigo')).toBeTruthy();
    // O campo igual ao atual não repete.
    expect(within(block).queryByText('Posição')).toBeNull();
    expect(within(block).getAllByRole('term')).toHaveLength(1);
  });

  it('numa troca de arquivo de imagem mostra o nome e o tamanho; sem tamanho, só o nome', async () => {
    const { proposal } = richScenario();
    const swap: Change = {
      id: 'cx',
      kind: 'update',
      entity: 'image',
      entityId: 'I1',
      imageId: 'I1',
      markingId: null,
      field: 'file',
      from: { file: 'images/antiga.webp', width: 800, height: 600 },
      to: { file: 'images/nova2.webp', width: 1024, height: 768 },
    };
    const withSize = withRevision(
      proposal,
      {
        changed: {
          cx: { to: { file: 'images/v1.webp', width: 640, height: 480 }, state: null },
        },
      },
      [swap],
    );
    await openPopover(withSize, 'cx', 'file');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(block.textContent).toContain('images/v1.webp (640 × 480 px)');
    cleanup();
    const noSize = withRevision(
      proposal,
      { changed: { cx: { to: { file: 'images/v1.webp' }, state: null } } },
      [swap],
    );
    await openPopover(noSize, 'cx', 'file');
    const plain = document.querySelector('.revised-before') as HTMLElement;
    expect(plain.textContent).toContain('images/v1.webp');
    expect(plain.textContent).not.toContain('×');
  });
});

describe('Antes da revisão no painel do item', () => {
  it('o popover do campo trocado abre com o bloco', async () => {
    const { proposal } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Nome: alterado/ }));
    expect(screen.getByText('Antes da revisão')).toBeTruthy();
  });
});
