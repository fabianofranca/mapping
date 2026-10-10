import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addLayer,
  deserialize,
  moveMarking,
  renameMarking,
  replaceImage,
  reviewKey,
  serialize,
  setMarkingRect,
  type Project,
  type Proposal,
} from '../../src/model';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import {
  NEW_IMAGE_PATH,
  diskProposal,
  openHarness,
  richScenario,
  writeOutside,
  type Harness,
} from './proposalHarness';

beforeEach(() => localStorage.clear());
afterEach(() => clearReportedErrors());

async function projectOnDisk(h: Harness): Promise<Project> {
  await h.session.flush();
  const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('mapping.json inválido');
  return parsed.project;
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('valor ausente');
  return value;
}

describe('abrir a revisão', () => {
  it('trava o projeto (somente leitura) até sair, e começa na primeira pendente', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    expect(session.actions.renameProject('Novo')).toEqual({ ok: true, value: undefined });

    const opened = review.open('P1');
    expect(opened).toEqual({ ok: true, resumed: false, newConflicts: 0 });
    expect(review.proposalId.value).toBe('P1');
    expect(review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(review.view.value).toBe('proposed');
    expect(session.store.reviewing.value).toBe(true);
    // Toda edição do projeto é recusada, inclusive gestos e desfazer.
    expect(session.actions.renameProject('Outro')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(session.actions.renameMarking('M1', 'x')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(session.actions.beginGesture()).toEqual({ ok: false, error: 'reviewing' });
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.undo()).toBe(false);
    expect(await session.addImages([new File(['1x1'], 'a.png')])).toMatchObject({
      added: [],
      failed: ['a.png'],
    });
    expect(
      await session.replaceImage('I1', new File(['1x1'], 'a.png'), () =>
        Promise.resolve(true),
      ),
    ).toBe('failed');

    review.close();
    expect(session.store.reviewing.value).toBe(false);
    expect(review.proposalId.value).toBeNull();
    expect(session.actions.renameProject('Depois')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(session.store.undo()).toBe(true);
    void ids;
  });

  it('não abre proposta inexistente nem retirada; a substituída abre', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({
      proposals: [
        { ...proposal, id: 'W', status: 'withdrawn' },
        { ...proposal, id: 'S', status: 'superseded' },
      ],
    });
    expect(review.open('nada')).toEqual({ ok: false, error: 'unknown-proposal' });
    expect(review.open('W')).toEqual({ ok: false, error: 'withdrawn' });
    expect(review.open('S').ok).toBe(true);
  });
});

describe('decidir', () => {
  it('grava na hora, com os três estados nos níveis e o "parcial"', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const d = review.derived;
    expect(d.counts.value).toMatchObject({ total: 5, undecided: 5, acceptedPending: 0 });
    expect(d.levels.value.get('proposal:')?.state).toBe('undecided');

    const result = await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(result.ok).toBe(true);
    expect((await diskProposal(root)).decisions[ids.name]?.state).toBe('accepted');
    expect((await diskProposal(root)).revision).toBe(1);
    expect(d.counts.value).toMatchObject({
      undecided: 4,
      accepted: 1,
      acceptedPending: 1,
    });
    expect(d.levels.value.get('proposal:')).toMatchObject({
      state: 'partial',
      accepted: 1,
    });
    expect(d.levels.value.get('item:M1')?.state).toBe('accepted');
    expect(d.levels.value.get('item:M4')?.state).toBe('undecided');

    await review.decide({ level: 'image', id: 'I3' }, 'rejected');
    expect(d.levels.value.get('image:I3')?.state).toBe('rejected');
    expect(d.levels.value.get('item:M5')?.state).toBe('rejected');
    expect(d.pendingIds.value).toEqual([ids.rect]);

    // Limpar a decisão volta a "sem decisão".
    await review.decide({ level: 'change', id: ids.name }, null);
    expect(d.levels.value.get('item:M1')?.state).toBe('undecided');
  });

  it('aceitar uma anotação aceita a criação da marcação e da imagem; rejeitar a imagem rejeita o que depende dela', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const accepted = await review.decide(
      { level: 'change', id: ids.annotation },
      'accepted',
    );
    if (!accepted.ok) throw new Error(accepted.error);
    expect(accepted.changed).toEqual([ids.annotation]);
    expect([...accepted.cascaded].sort()).toEqual([ids.image, ids.marking].sort());

    const rejected = await review.decide({ level: 'change', id: ids.image }, 'rejected');
    if (!rejected.ok) throw new Error(rejected.error);
    expect([...rejected.cascaded].sort()).toEqual([ids.annotation, ids.marking].sort());
  });

  it('o lote tem "Desfazer": regrava as decisões de antes numa única escrita', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    const before = await diskProposal(root);

    const batch = await review.decideVisible('rejected');
    expect(batch?.ok).toBe(true);
    const afterBatch = await diskProposal(root);
    expect(afterBatch.revision).toBe(before.revision + 1);
    expect(Object.values(afterBatch.decisions).every((d) => d.state === 'rejected')).toBe(
      true,
    );
    const undo = must(review.undoable.value);
    expect(undo.changed.length).toBe(5);
    expect(undo.previous).toEqual(before.decisions);

    expect(await review.undoLastDecision()).toBe(true);
    const restored = await diskProposal(root);
    expect(restored.decisions).toEqual(before.decisions);
    // Uma escrita só para desfazer o lote inteiro.
    expect(restored.revision).toBe(afterBatch.revision + 1);
    expect(review.undoable.value).toBeNull();
    expect(await review.undoLastDecision()).toBe(false);
  });

  it('com filtros ativos, o lote vale só para o que a lista mostra', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    review.setFilters({ types: ['created'] });
    expect(review.derived.visibleIds.value).toEqual([
      ids.image,
      ids.marking,
      ids.annotation,
    ]);
    await review.decideVisible('accepted');
    expect(Object.keys((await diskProposal(root)).decisions).sort()).toEqual(
      [ids.image, ids.marking, ids.annotation].sort(),
    );
    review.setFilters({ types: ['moved'], decision: 'undecided' });
    expect(review.derived.visibleIds.value).toEqual([ids.rect]);
    review.setFilters({ types: ['removed'] });
    expect(await review.decideVisible('accepted')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
  });

  it('o "Desfazer" não vale se alguém decidiu depois', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    const stale = must(review.undoable.value);
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    expect(
      await session.proposalActions.restoreDecisions(
        'P1',
        stale.previous,
        stale.decisions,
      ),
    ).toEqual({ ok: false, error: 'stale' });
  });

  it('proposta substituída ou retirada não recebe decisões', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({
      proposals: [{ ...proposal, status: 'superseded' }],
    });
    review.open('P1');
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'not-open',
    });
    expect(session.proposals.get('P1')?.revision).toBe(0);
  });

  it('a decisão é refeita sobre a versão do disco quando o agente mexeu no arquivo', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    // O agente substitui a proposta enquanto o usuário revisa.
    writeOutside(root, { ...proposal, status: 'superseded', revision: 5 });
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'not-open',
    });
    expect(review.derived.proposal.value?.status).toBe('superseded');
    expect((await diskProposal(root)).decisions).toEqual({});
  });
});

describe('notas', () => {
  it('cria, edita e remove em qualquer nível, e agrupa por alvo', async () => {
    const { proposal, ids } = richScenario();
    const { root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const created = await review.addNote(
      { level: 'change', id: ids.rect },
      'A posição antiga estava certa.',
    );
    if (!created?.ok) throw new Error('nota recusada');
    const noteId = must(created.noteId);
    await review.addNote({ level: 'proposal', id: null }, 'Revise as telas novas.');
    await review.addNote({ level: 'item', id: 'M1' }, 'Nome em inglês, por favor.');
    await review.addNote({ level: 'image', id: 'I3' }, 'Imagem de baixa resolução.');
    await review.addNote({ level: 'project', id: null }, 'Camadas ok.');

    expect(
      review.derived.notes.value.get(reviewKey({ level: 'change', id: ids.rect })),
    ).toHaveLength(1);
    expect((await diskProposal(root)).notes).toHaveLength(5);

    await review.editNote(noteId, 'Mantenha a posição antiga.');
    expect((await diskProposal(root)).notes.find((n) => n.id === noteId)?.text).toBe(
      'Mantenha a posição antiga.',
    );
    await review.removeNote(noteId);
    expect((await diskProposal(root)).notes).toHaveLength(4);
    // Texto vazio na edição remove.
    const item = must(
      (await diskProposal(root)).notes.find((n) => n.target.level === 'item'),
    );
    await review.editNote(item.id, '   ');
    expect((await diskProposal(root)).notes.some((n) => n.id === item.id)).toBe(false);
  });

  it('recusa nota vazia e alvo que não existe', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(await review.addNote({ level: 'proposal', id: null }, '  ')).toEqual({
      ok: false,
      error: 'empty-note',
    });
    expect(await review.addNote({ level: 'change', id: 'zzz' }, 'x')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
    expect(await review.addNote({ level: 'item', id: 'M99' }, 'x')).toEqual({
      ok: false,
      error: 'unknown-target',
    });
    expect(await review.editNote('nada', 'x')).toEqual({
      ok: false,
      error: 'unknown-note',
    });
  });
});

describe('conflitos', () => {
  it('são recalculados contra o projeto atual ao abrir; os novos só aparecem na primeira abertura depois da edição', async () => {
    const { proposal, ids } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    expect(review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    expect(review.derived.conflictIds.value.size).toBe(0);
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    review.close();

    // Fora da revisão o usuário edita a marcação que a proposta renomeia.
    session.actions.renameMarking('M1', 'Porta (editada à mão)');
    const reopened = review.open('P1');
    expect(reopened).toEqual({ ok: true, resumed: true, newConflicts: 1 });
    expect([...review.derived.conflictIds.value]).toEqual([ids.name]);
    expect([...review.newConflicts.value]).toEqual([ids.name]);
    const situation = must(review.derived.situation.value.get(ids.name));
    expect(situation.conflict).toBe(true);
    expect(situation.current).toBe('Porta (editada à mão)');
    expect(review.derived.counts.value.conflicts).toBe(1);
    // A decisão já tomada nas demais continua.
    expect(review.derived.proposal.value?.decisions[ids.rect]?.state).toBe('rejected');
    review.close();

    // Na abertura seguinte o conflito já é conhecido.
    expect(review.open('P1')).toEqual({ ok: true, resumed: true, newConflicts: 0 });
    expect(review.newConflicts.value.size).toBe(0);
    expect(review.derived.conflictIds.value.size).toBe(1);
  });

  it('o projeto recarregado por fora durante a revisão recalcula os conflitos sem perder decisões', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.conflictIds.value.size).toBe(0);

    // O MCP (ou outro editor) muda o nome da marcação no mapping.json.
    const external = renameMarking(base, 'M1', 'Outro nome');
    root.put('mapping.json', serialize({ ...external, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    expect([...review.derived.conflictIds.value]).toEqual([ids.name]);
    expect(review.derived.proposal.value?.decisions[ids.name]?.state).toBe('accepted');
    expect(session.store.reviewing.value).toBe(true);
  });
});

describe('retomar a revisão', () => {
  it('volta ao último item, com os mesmos filtros e a mesma visão, por dispositivo', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal] });
    first.review.open('P1');
    first.review.select({ level: 'item', id: 'M5' });
    first.review.setView('current');
    first.review.setFilters({
      types: ['created', 'moved'],
      decision: 'undecided',
      onlyConflicts: false,
    });
    first.review.close();
    expect(first.review.proposalId.value).toBeNull();
    expect(first.session.store.reviewing.value).toBe(false);

    // "Fechar a app": outra sessão, outro estado de revisão, o mesmo localStorage.
    const second = await openHarness({ proposals: [proposal] });
    expect(second.review.seen.value.has('P1')).toBe(true);
    const reopened = second.review.open('P1');
    expect(reopened).toMatchObject({ ok: true, resumed: true });
    expect(second.review.selected.value).toEqual({ level: 'item', id: 'M5' });
    expect(second.review.view.value).toBe('current');
    expect(second.review.filters.value).toMatchObject({
      types: ['created', 'moved'],
      decision: 'undecided',
    });
    void ids;
  });

  it('cai na primeira pendente se o último item não existe mais ou não há estado guardado', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal] });
    first.review.open('P1');
    first.review.select({ level: 'item', id: 'M5' });
    first.review.setFilters({ imageId: 'I3' });
    first.review.close();

    // A proposta mudou por fora: o item e a imagem do filtro sumiram.
    const smaller = {
      ...proposal,
      changes: proposal.changes.filter((c) => c.id === ids.name || c.id === ids.rect),
    };
    const second = await openHarness({ proposals: [smaller] });
    second.review.open('P1');
    expect(second.review.selected.value).toEqual({ level: 'change', id: ids.name });
    expect(second.review.filters.value.imageId).toBeNull();
    second.review.close();
  });

  it('sem localStorage ou com texto corrompido, abre na primeira pendente', async () => {
    const { proposal, ids } = richScenario();
    localStorage.setItem('mapping.reviewResume', '{ corrompido');
    const a = await openHarness({ proposals: [proposal] });
    expect(a.review.open('P1').ok).toBe(true);
    expect(a.review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    a.review.close();

    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado');
      },
    });
    try {
      const b = await openHarness({ proposals: [proposal] });
      expect(b.review.open('P1')).toMatchObject({ ok: true, resumed: false });
      b.review.select({ level: 'item', id: 'M5' });
      b.review.close();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
    void ids;
  });

  it('as decisões, as aceitas sem aplicar e as notas sobrevivem a fechar e reabrir a app', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal] });
    first.review.open('P1');
    await first.review.decide({ level: 'change', id: ids.name }, 'accepted');
    await first.review.decide({ level: 'change', id: ids.rect }, 'rejected');
    await first.review.addNote({ level: 'change', id: ids.rect }, 'Não mexa.');
    first.review.close();
    await first.session.close();

    // Reabre a pasta: as propostas vêm do disco.
    const files: Record<string, string> = {};
    const text = await first.root.read('proposals/P1/proposal.json');
    files['proposals/P1/proposal.json'] = text ?? '';
    const second = await openHarness({ files });
    second.review.open('P1');
    const d = second.review.derived;
    expect(d.counts.value).toMatchObject({
      accepted: 1,
      rejected: 1,
      undecided: 3,
      acceptedPending: 1,
    });
    expect(
      d.notes.value.get(reviewKey({ level: 'change', id: ids.rect }))?.[0]?.text,
    ).toBe('Não mexa.');
  });
});

describe('proposta nova e substituída', () => {
  it('"Nova" até alguém abrir, decidir ou anotar; o selo conta as novas', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({
      proposals: [
        proposal,
        { ...richScenario('P2').proposal, createdAt: '2026-10-10T12:00:00.000Z' },
      ],
    });
    const d = review.derived;
    expect(d.rows.value.map((r) => r.proposal.id)).toEqual(['P2', 'P1']);
    expect(d.freshIds.value).toEqual(['P2', 'P1']);
    review.open('P2');
    expect(d.freshIds.value).toEqual(['P1']);
    expect(d.rows.value.find((r) => r.proposal.id === 'P2')?.fresh).toBe(false);
  });

  it('mostra o que ficou para trás e compara com a nova (igual, diferente, não consta)', async () => {
    const base = sampleProject();
    const old = propose(
      base,
      setMarkingRect(renameMarking(base, 'M1', 'Porta A'), 'M4', {
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      }),
      { id: 'OLD', title: 'v1' },
    );
    const nova = propose(
      base,
      setMarkingRect(renameMarking(base, 'M1', 'Porta B'), 'M2', {
        x: 1210,
        y: 1210,
        width: 400,
        height: 200,
      }),
      { id: 'NEW', title: 'v2', supersedes: 'OLD' },
    );
    const nameOld = must(old.changes.find((c) => c.field === 'name')).id;
    const rectOld = must(old.changes.find((c) => c.field === 'rect')).id;
    const { review } = await openHarness({
      proposals: [
        {
          ...old,
          status: 'superseded',
          decisions: { [nameOld]: { state: 'accepted', at: '2026-10-09T13:00:00.000Z' } },
        },
        nova,
      ],
    });
    expect(review.open('OLD').ok).toBe(true);
    const sup = must(review.derived.supersession.value);
    expect(sup.by?.id).toBe('NEW');
    expect(sup.leftBehind).toEqual({
      undecided: [rectOld],
      acceptedPending: [nameOld],
      rejected: [],
    });
    expect(sup.comparison?.get(nameOld)).toBe('different');
    expect(sup.comparison?.get(rectOld)).toBe('missing');
    const row = must(review.derived.rows.value.find((r) => r.proposal.id === 'OLD'));
    expect(row.supersededBy).toBe('NEW');
    expect(row.leftBehind?.undecided).toEqual([rectOld]);
    expect(
      review.derived.rows.value.find((r) => r.proposal.id === 'NEW')?.supersededBy,
    ).toBeNull();
    // As aceitas da substituída ainda podem ser aplicadas.
    expect(review.derived.canApply.value).toBe(true);
  });

  it('a proposta apagada por fora fecha a revisão', async () => {
    const { proposal } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    root.dirs.get('proposals')?.dirs.delete('P1');
    await session.sync();
    expect(review.proposalId.value).toBeNull();
    expect(session.store.reviewing.value).toBe(false);
  });
});

describe('navegação pelas pendências e conflitos', () => {
  it('N / Shift+N dão a volta pelas pendentes que passam pelos filtros', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    review.select({ level: 'change', id: ids.name });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.marking });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.image });
    expect(review.step('pending', -1)).toEqual({ level: 'change', id: ids.annotation });
    review.setFilters({ types: ['moved'] });
    expect(review.step('pending', 1)).toEqual({ level: 'change', id: ids.rect });
    expect(review.step('conflict', 1)).toBeNull();
  });
});

describe('aplicar aceitas', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };

  it('uma entrada de desfazer, imagem movida e proposta atualizada; desfazer e refazer levam a proposta junto', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    const { review, session, root } = h;
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(review.derived.canApply.value).toBe(true);
    expect(review.derived.counts.value.acceptedPending).toBe(5);
    const undoBefore = session.store.canUndo.value;

    const result = await review.apply();
    expect(result).toMatchObject({ ok: true, applied: 5, files: 1 });

    // Projeto: tudo aplicado, em uma única entrada.
    const project = must(session.store.project.value);
    expect(project.images.map((i) => i.id)).toContain('I3');
    expect(project.markings.find((m) => m.id === 'M1')?.name).toBe('Porta dianteira');
    expect(project.annotations.some((a) => a.id === 'A9')).toBe(true);
    expect(undoBefore).toBe(false);
    expect(session.store.canUndo.value).toBe(true);
    expect((await projectOnDisk(h)).images.map((i) => i.id)).toContain('I3');
    // Imagem movida: a de images/ existe e a da proposta saiu.
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    // Proposta: aplicada, com a data, e fechada.
    const applied = await diskProposal(root);
    expect(Object.keys(applied.applied).sort()).toEqual(Object.values(ids).sort());
    expect(applied.status).toBe('applied');
    expect(review.derived.counts.value).toMatchObject({ applied: 5, acceptedPending: 0 });
    expect(review.derived.canApply.value).toBe(false);

    // Um único desfazer volta tudo: projeto, imagem e proposta.
    expect(session.store.undo()).toBe(true);
    expect(session.store.project.value?.images.map((i) => i.id)).not.toContain('I3');
    await session.proposals.settled();
    await h.session.flush();
    const undone = await diskProposal(root);
    expect(undone.applied).toEqual({});
    expect(undone.status).toBe('open');
    expect(Object.keys(undone.decisions)).toHaveLength(5);
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(await root.read('images/nova.webp')).toBeNull();
    expect(review.derived.counts.value.acceptedPending).toBe(5);
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.canRedo.value).toBe(true);

    // Refazer aplica de novo.
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    await h.session.flush();
    const redone = await diskProposal(root);
    expect(Object.keys(redone.applied)).toHaveLength(5);
    expect(redone.status).toBe('applied');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.store.project.value?.images.map((i) => i.id)).toContain('I3');
  });

  it('aplicação parcial: o que está sem decisão continua pendente, e uma nova aplicação efetiva o resto', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    const { review, session, root } = h;
    review.open('P1');
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    const first = await review.apply();
    expect(first).toMatchObject({ ok: true, applied: 1, files: 0 });
    let disk = await diskProposal(root);
    expect(Object.keys(disk.applied)).toEqual([ids.name]);
    expect(disk.status).toBe('open');
    expect(review.derived.counts.value).toMatchObject({
      applied: 1,
      undecided: 3,
      acceptedPending: 0,
    });
    // A imagem continua esperando na proposta.
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');

    // Mudanças já aplicadas não mudam de decisão.
    expect(
      await review.decide({ level: 'change', id: ids.name }, 'rejected'),
    ).toMatchObject({ ok: true, changed: [] });
    expect((await diskProposal(root)).decisions[ids.name]?.state).toBe('accepted');

    await review.decide({ level: 'image', id: 'I3' }, 'accepted');
    const second = await review.apply();
    expect(second).toMatchObject({ ok: true, applied: 3, files: 1 });
    disk = await diskProposal(root);
    expect(disk.status).toBe('applied');
    expect(Object.keys(disk.applied).sort()).toEqual(
      [ids.name, ids.image, ids.marking, ids.annotation].sort(),
    );
    expect(session.store.project.value?.markings.find((m) => m.id === 'M4')?.rect.x).toBe(
      0,
    );

    // Desfazer só a segunda aplicação deixa a primeira.
    session.store.undo();
    await session.proposals.settled();
    disk = await diskProposal(root);
    expect(Object.keys(disk.applied)).toEqual([ids.name]);
    expect(disk.status).toBe('open');
  });

  it('decidir depois de desfazer descarta o "refazer", que deixaria projeto e proposta em desacordo', async () => {
    const { proposal, ids } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    h.review.open('P1');
    await h.review.decide({ level: 'change', id: ids.name }, 'accepted');
    await h.review.apply();
    h.session.store.undo();
    await h.session.proposals.settled();
    expect(h.session.store.canRedo.value).toBe(true);
    await h.review.decide({ level: 'change', id: ids.name }, 'rejected');
    expect(h.session.store.canRedo.value).toBe(false);
  });

  it('conjunto inválido bloqueia o Aplicar e aponta as mudanças envolvidas', async () => {
    // Mover o pai (e as filhas com ele): aceitar só a posição do pai deixa a filha fora dele.
    const base = sampleProject();
    const after = moveMarking(base, 'M1', 1000, 0);
    const proposal = propose(base, after, { id: 'P1' });
    const parent = must(
      proposal.changes.find((c) => c.entityId === 'M1' && c.field === 'rect'),
    );
    const child = must(
      proposal.changes.find((c) => c.entityId === 'M2' && c.field === 'rect'),
    );
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: parent.id }, 'accepted');
    await review.decide({ level: 'change', id: child.id }, 'rejected');

    expect(review.derived.canApply.value).toBe(false);
    expect(review.derived.validation.value?.ok).toBe(false);
    expect(review.derived.invalid.value.changeIds.has(parent.id)).toBe(true);
    const projectBefore = session.store.project.value;
    const result = await review.apply();
    expect(result).toMatchObject({ ok: false, error: 'blocked' });
    expect(result && !result.ok ? result.issues?.length : 0).toBeGreaterThan(0);
    expect(session.store.project.value).toBe(projectBefore);
    expect((await diskProposal(root)).applied).toEqual({});

    // Aceitar também a da filha resolve.
    await review.decide({ level: 'change', id: child.id }, 'accepted');
    const m3 = proposal.changes.filter((c) => c.field === 'rect' && c.entityId === 'M3');
    for (const c of m3) await review.decide({ level: 'change', id: c.id }, 'accepted');
    expect(review.derived.canApply.value).toBe(true);
    expect(await review.apply()).toMatchObject({ ok: true });
  });

  it('imagem que não está em proposals/<id>/ não é aplicada, e nada muda', async () => {
    const { proposal, ids } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.annotation }, 'accepted');
    const before = session.store.project.value;
    const result = await review.apply();
    expect(result).toEqual({ ok: false, error: 'image-missing', path: NEW_IMAGE_PATH });
    expect(session.store.project.value).toBe(before);
    expect((await diskProposal(root)).applied).toEqual({});
    expect(await root.read('images/nova.webp')).toBeNull();
  });

  it('não sobrescreve o arquivo de uma imagem do projeto (troca com o mesmo nome)', async () => {
    const base = sampleProject();
    const after = replaceImage(base, 'I2', {
      file: 'images/frente.jpg',
      width: 800,
      height: 800,
    });
    const proposal = propose(base, after, { id: 'P1' });
    const change = must(proposal.changes.find((c) => c.field === 'file'));
    const { review, session, root } = await openHarness({
      proposals: [proposal],
      files: {
        'proposals/P1/images/frente.jpg': 'NOVA',
        'images/frente.jpg': 'ORIGINAL',
      },
    });
    review.open('P1');
    await review.decide({ level: 'change', id: change.id }, 'accepted');
    const before = session.store.project.value;
    const result = await review.apply();
    expect(result).toMatchObject({
      ok: false,
      error: 'image-exists',
      path: 'images/frente.jpg',
    });
    expect(await root.read('images/frente.jpg')).toBe('ORIGINAL');
    expect(session.store.project.value).toBe(before);
  });

  it('nada aceito: aplicar não cria entrada de desfazer nem grava a proposta', async () => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const result = await review.apply();
    expect(result).toMatchObject({ ok: true, applied: 0, files: 0 });
    expect(session.store.canUndo.value).toBe(false);
    expect((await diskProposal(root)).revision).toBe(0);
  });

  it('tudo rejeitado: aplicar fecha a proposta como aplicada, sem mexer no projeto', async () => {
    const { proposal } = richScenario();
    const { review, session, root } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'proposal', id: null }, 'rejected');
    const before = session.store.project.value;
    expect(await review.apply()).toMatchObject({ ok: true, applied: 0 });
    expect(session.store.project.value).toBe(before);
    expect((await diskProposal(root)).status).toBe('applied');
  });
});

describe('como ficaria', () => {
  it('a prévia tem o atual mais o que não foi rejeitado nem aplicado', async () => {
    const { proposal, ids } = richScenario();
    const { review, session } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.rect }, 'rejected');
    const preview = must(review.derived.preview.value);
    expect(preview.project.images.map((i) => i.id)).toContain('I3');
    expect(preview.project.markings.find((m) => m.id === 'M1')?.name).toBe(
      'Porta dianteira',
    );
    // A rejeitada fica como no projeto atual.
    expect(preview.project.markings.find((m) => m.id === 'M4')?.rect).toEqual(
      session.store.project.value?.markings.find((m) => m.id === 'M4')?.rect,
    );
    expect(preview.problems).toEqual([]);
  });

  it('o estado derivado é memoizado: decidir não refaz os níveis nem os conflitos', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const tree = review.derived.tree.value;
    const conflicts = review.derived.conflictIds.value;
    const types = review.derived.levelTypes.value;
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.tree.value).toBe(tree);
    expect(review.derived.conflictIds.value).toBe(conflicts);
    expect(review.derived.levelTypes.value).toBe(types);
    expect(review.derived.levelTypes.value.get('item:M5')).toBe('created');
    expect(review.derived.levelTypes.value.get('item:M4')).toBe('moved');
    expect(review.derived.levelTypes.value.get('item:M1')).toBe('changed');
    // A imagem nova é criada; a que só tem uma marcação movida está "alterada".
    expect(review.derived.levelTypes.value.get('image:I3')).toBe('created');
    expect(review.derived.levelTypes.value.get('image:I2')).toBe('changed');
  });

  it('o tipo do item é o da marcação: anotação criada num item que já existe o altera', async () => {
    const base = sampleProject();
    let after = addAnnotation(base, {
      id: 'A9',
      markingId: 'M4',
      layerId: 'L1',
      name: 'x',
    });
    after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
    const { review } = await openHarness({ proposals: [propose(base, after)] });
    review.open('P1');
    // A posição muda, mas não é a única coisa: "alterada", não "movida" nem "criada".
    expect(review.derived.levelTypes.value.get('item:M4')).toBe('changed');
  });
});

// Camada nova na proposta: o filtro por camada e o grupo Projeto.
describe('grupo Projeto e camadas', () => {
  it('as mudanças fora das imagens ficam no grupo Projeto e filtram por camada', async () => {
    const base = sampleProject();
    const after = addLayer(base, { id: 'L3', name: 'Eventos', color: '#00AA00' });
    const proposal: Proposal = propose(base, after, { id: 'P1' });
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const level = review.derived.levels.value.get('project:');
    expect(level?.total).toBe(1);
    review.setFilters({ layerId: 'L3' });
    expect(review.derived.visibleIds.value).toHaveLength(1);
    review.setFilters({ layerId: 'L1' });
    expect(review.derived.visibleIds.value).toHaveLength(0);
  });
});
