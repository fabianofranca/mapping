// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  renameMarking,
  prepareRevision,
  reviseProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { diskProposal, openHarness, richScenario, writeOutside } from './proposalHarness';

// Guarda da decisão na app (etapa #644, CP3, decisão 8): o agente revisou a proposta enquanto a
// pessoa olhava a versão antiga. Decidir uma mudança que a revisão trocou ou acrescentou é
// recusado (`revised`), nada é gravado e a sessão adota a versão do disco.

const REVISED_AT = '2026-11-07T10:00:00.000Z';

/** A proposta revisada como o MCP a gravaria: troca o nome da M1 e cria o da M2. */
function revisedOnDisk(project: Project, p: Proposal, drop: readonly string[] = []) {
  const prep = prepareRevision(project, p, drop);
  if (!prep.ok) throw new Error(prep.error.code);
  const after = renameMarking(
    renameMarking(prep.proposed, 'M1', 'Porta traseira'),
    'M2',
    'Capô novo',
  );
  const result = reviseProposal(project, p, { drop, at: REVISED_AT, after });
  if (!result.ok) throw new Error(result.error.code);
  return { ...result.proposal, revision: p.revision + 1 };
}

async function openWithRevision(
  drop: (ids: ReturnType<typeof richScenario>['ids']) => string[] = () => [],
) {
  const { proposal, ids } = richScenario();
  const harness = await openHarness({ proposals: [proposal] });
  const project = harness.session.store.committed.peek();
  if (!project) throw new Error('sem projeto');
  const revised = revisedOnDisk(project, proposal, drop(ids));
  // A app leu a proposta antes; o agente a revisa por fora, sem a app saber.
  writeOutside(harness.root, revised);
  return { ...harness, proposal, revised, ids };
}

describe('Guarda da decisão sobre conteúdo revisado', () => {
  it('aceitar a mudança que a revisão trocou: recusa com "revised", nada é gravado e a sessão adota o disco', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    const changedId = Object.keys(revised.revisions?.[0]?.changed ?? {})[0];
    if (!changedId) throw new Error('a revisão não trocou nada');
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: changedId },
      'accepted',
    );
    expect(result).toEqual({ ok: false, error: 'revised' });
    const disk = await diskProposal(root);
    expect(disk.revision).toBe(revised.revision);
    expect(disk.decisions[changedId]).toBeUndefined();
    expect(session.proposals.get('P1')?.revisions).toHaveLength(1);
    expect(ids.name).toBeDefined();

    // Agora que a sessão adotou a versão do disco (a pessoa vê a marca), a decisão vale.
    const again = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: changedId },
      'accepted',
    );
    expect(again.ok).toBe(true);
  });

  it('aceitar o item que contém uma mudança nova da revisão: recusa', async () => {
    const { session, root, revised } = await openWithRevision();
    const added = revised.revisions?.[0]?.added[0];
    if (!added) throw new Error('a revisão não acrescentou nada');
    const change = revised.changes.find((c) => c.id === added);
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'item', id: change?.markingId ?? 'M2' },
      'accepted',
    );
    expect(result).toEqual({ ok: false, error: 'revised' });
    expect((await diskProposal(root)).revision).toBe(revised.revision);
  });

  it('aceitar uma mudança que a revisão não tocou: grava sobre a versão do disco', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    const result = await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.rect },
      'accepted',
    );
    expect(result.ok).toBe(true);
    const disk = await diskProposal(root);
    expect(disk.decisions[ids.rect]?.state).toBe('accepted');
    expect(disk.revision).toBe(revised.revision + 1);
    expect(disk.revisions).toHaveLength(1);
  });

  it('uma nota numa mudança retirada vai para o nível da proposta, com a origem', async () => {
    const { session, root, ids } = await openWithRevision((i) => [i.rect]);
    const result = await session.proposalActions.addNote(
      'P1',
      { level: 'change', id: ids.rect },
      'Eu queria isto',
    );
    expect(result.ok).toBe(true);
    const disk = await diskProposal(root);
    const note = disk.notes.find((n) => n.text === 'Eu queria isto');
    expect(note?.target).toEqual({ level: 'proposal', id: null });
    expect(
      disk.revisions?.[0]?.dropped.find((d) => d.change.id === ids.rect)?.notes,
    ).toContain(note?.id);
  });

  it('Aplicar aceitas sobre uma versão revisada grava como antes', async () => {
    const { session, root, revised, ids } = await openWithRevision();
    // A decisão de uma mudança intocada vale; depois o agente revisa de novo por fora? Não:
    // aqui só se aplica o que já foi aceito sobre a versão revisada.
    await session.proposalActions.decide(
      'P1',
      { level: 'change', id: ids.rect },
      'accepted',
    );
    const applied = await session.proposalActions.applyAccepted('P1');
    expect(applied.ok).toBe(true);
    const disk = await diskProposal(root);
    expect(disk.applied[ids.rect]).toBeDefined();
    expect(disk.revisions).toHaveLength(1);
    expect(disk.revision).toBeGreaterThan(revised.revision);
  });
});
