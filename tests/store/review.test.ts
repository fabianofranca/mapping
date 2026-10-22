import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addLayer,
  deserialize,
  moveMarking,
  removeAnnotation,
  removeEntry,
  removeContainer,
  renameMarking,
  replaceContainer,
  reviewKey,
  serialize,
  setMarkingRect,
  updateEntry,
  type Project,
  type Proposal,
} from '../../src/model';
import { fieldChangeIndex } from '../../src/store/derived';
import { locale } from '../../src/store/settings';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { AT, decided, propose } from '../model/proposalFixtures';
import {
  NEW_IMAGE_PATH,
  diskProposal,
  openHarness,
  richScenario,
  writeOutside,
  type Harness,
} from './proposalHarness';

beforeEach(() => localStorage.clear());
afterEach(() => {
  clearReportedErrors();
  locale.value = 'pt-BR';
});

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
    expect(opened).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
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
    expect(reopened).toEqual({ ok: true, resumed: 'full', newConflicts: 1 });
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
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'full', newConflicts: 0 });
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

  // Achado 11 do relato de 2026-10-11: "O projeto mudou desde a sua última sessão" sem
  // mudança. A mesma proposta (mesmo id) aberta em outra cópia do projeto (a pasta
  // descompactada do mesmo zip) apagava os conflitos conhecidos desta cópia.
  it('reabrir sem mudança nunca marca conflito novo, mesmo depois de abrir a mesma proposta em outra cópia do projeto', async () => {
    const { proposal } = richScenario();
    // Cópia A: o nome de M1 foi editado à mão antes de revisar → a mudança do nome conflita.
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    const a = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'copia-a',
    });
    expect(a.review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(a.review.derived.conflictIds.value.size).toBe(1);
    a.review.close();

    // Cópia B: a mesma proposta numa pasta com o projeto sem a edição (sem conflito).
    const b = await openHarness({ proposals: [proposal], copyId: 'copia-b' });
    expect(b.review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    expect(b.review.derived.conflictIds.value.size).toBe(0);
    b.review.close();

    // De volta à cópia A, sem mexer em nada: o conflito já era conhecido.
    const again = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'copia-a',
    });
    expect(again.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(again.review.newConflicts.value.size).toBe(0);
  });

  it('trocar o idioma entre as sessões não muda os conflitos conhecidos', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    locale.value = 'pt-BR';
    const first = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(first.review.open('P1')).toMatchObject({ ok: true, newConflicts: 0 });
    first.review.select({ level: 'item', id: 'M4' });
    first.review.close();

    locale.value = 'en-US';
    const second = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(second.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(second.review.selected.value).toEqual({ level: 'item', id: 'M4' });
    expect(second.review.derived.conflictIds.value.size).toBe(1);
  });

  it('outra aba com o estado antigo em memória não faz um conflito já visto voltar como novo', async () => {
    const { proposal } = richScenario();
    // Ontem: a revisão aberta sem nenhum conflito.
    const yesterday = await openHarness({ proposals: [proposal], copyId: 'c' });
    yesterday.review.open('P1');
    yesterday.review.close();

    // O nome de M1 muda por fora; duas abas abrem o projeto (as duas leem o estado de ontem).
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    const tabA = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    const tabB = await openHarness({
      project: edited,
      proposals: [proposal],
      copyId: 'c',
    });
    expect(tabA.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 1,
    });
    tabA.review.close();
    // A outra aba abre a mesma revisão depois: o conflito já foi mostrado.
    expect(tabB.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
  });

  // Fase 8.2 (P6): um conflito que surge durante a revisão (recarga externa) aparece como
  // novo na hora; decidido, passa a conhecido ao fechar; sem decisão, é novo de novo na
  // próxima abertura. (Substitui o teste que fixava "já é conhecido na abertura seguinte".)
  it('um conflito que aparece durante a revisão é novo na hora; só o decidido fica conhecido ao fechar', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    // Por fora, o nome de M1 muda e a imagem I2 é apagada: a mudança do nome e a da
    // posição de M4 (que está em I2) passam a conflitar.
    let external = renameMarking(base, 'M1', 'Outro nome');
    external = removeContainer(external, 'I2');
    root.put('mapping.json', serialize({ ...external, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name, ids.rect]));
    // Ao vivo: os dois são novos.
    expect(review.newConflicts.value).toEqual(new Set([ids.name, ids.rect]));
    // A pessoa decide um deles (prova de que o viu) e fecha.
    await review.decide({ level: 'change', id: ids.name }, 'rejected');
    review.close();
    // Na reabertura, o decidido é conhecido e o que ficou sem decisão volta como novo.
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'full', newConflicts: 1 });
    expect([...review.newConflicts.value]).toEqual([ids.rect]);
  });
});

// Devolução do portão da 8.2 (achado 7): enquanto o aplicar está em curso, a revisão não
// reavalia (`derived.hold()`). O retrato é preso à proposta e some ao soltar: um conflito
// real que surge durante a espera aparece ao soltar, e outra proposta aberta no meio
// tempo vê os seus próprios valores ao vivo.
describe('aplicar em curso: a revisão segura a reavaliação', () => {
  it('um conflito real que surge durante o hold aparece ao soltar, como novo', async () => {
    const { proposal, ids, base } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.derived.conflictIds.value.size).toBe(0);
    const release = review.derived.hold();
    root.put(
      'mapping.json',
      serialize({ ...renameMarking(base, 'M1', 'Outro nome'), revision: 4 }),
    );
    expect(await session.sync()).toBe('reloaded');
    // Segurado: o retrato de antes.
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    release();
    // Solto: o conflito real, ao vivo e novo.
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    expect(review.derived.situation.value.get(ids.name)?.conflict).toBe(true);
    expect(review.newConflicts.value).toEqual(new Set([ids.name]));
  });

  it('o retrato é da proposta: segurar A, fechar e abrir B mostra os valores ao vivo de B', async () => {
    const { proposal: a, ids, base } = richScenario('P1');
    const edited = renameMarking(base, 'M1', 'Topo');
    const b = propose(
      edited,
      setMarkingRect(edited, 'M4', { x: 20, y: 20, width: 50, height: 50 }),
      { id: 'P2', title: 'Mover M4' },
    );
    const { session, root, review } = await openHarness({
      project: edited,
      proposals: [a, b],
    });
    review.open('P1');
    // A tem o conflito do nome (o projeto já está com outro nome).
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    const release = review.derived.hold();
    review.close();

    expect(review.open('P2').ok).toBe(true);
    // B: os valores ao vivo, não o retrato de A.
    expect(review.derived.conflictIds.value.size).toBe(0);
    expect(review.newConflicts.value.size).toBe(0);
    expect([...review.derived.situation.value.keys()]).toEqual(
      b.changes.map((c) => c.id),
    );
    expect(review.derived.validation.value?.ok).toBe(true);
    review.close();

    // Por fora, o nome volta ao da proposta A: ao vivo, A não tem mais conflito.
    root.put('mapping.json', serialize({ ...base, revision: 4 }));
    expect(await session.sync()).toBe('reloaded');
    // A, ainda segurada: o retrato dela volta.
    review.open('P1');
    expect(review.derived.conflictIds.value).toEqual(new Set([ids.name]));
    release();
    expect(review.derived.conflictIds.value.size).toBe(0);
  });
});

// Fase 8.2 (P2/R3, P3, P5, O5): o retomar e o "vista" por cópia (`ProjectStorage.copyId`),
// num blob versionado (`mapping.reviewResume` v2) com `seen` separado do `resume`.
describe('retomar por cópia e blob v2', () => {
  const RESUME_KEY = 'mapping.reviewResume';
  const blob = () => JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
  const v1Entry = {
    selected: { level: 'item', id: 'M4' },
    view: 'current',
    filters: {
      types: [],
      imageId: null,
      layerId: null,
      decision: 'undecided',
      onlyConflicts: false,
    },
    knownConflicts: [],
  };

  it('duas pastas com o mesmo nome são duas cópias: posição, filtros, conflitos conhecidos e "vista" independentes (O5)', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    // Cópia A (`projetos/loja`): com conflito, selecionou M4 e filtrou as pendentes.
    const a = await openHarness({
      project: edited,
      proposals: [proposal],
      folderName: 'loja',
      copyId: 'loja-1',
    });
    expect(a.review.open('P1')).toMatchObject({ resumed: 'none', newConflicts: 0 });
    a.review.select({ level: 'item', id: 'M4' });
    a.review.setFilters({ decision: 'undecided' });
    a.review.close();

    // Cópia B (`backup/loja`, recém-descompactada): a proposta é nova e a revisão começa
    // do zero; o conflito que A já conhecia não existe aqui e nada é herdado.
    const b = await openHarness({
      proposals: [proposal],
      folderName: 'loja',
      copyId: 'loja-2',
    });
    expect(b.review.derived.freshIds.value).toEqual(['P1']);
    expect(b.review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(b.review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(b.review.filters.value.decision).toBe('all');
    // A edição acontece em B depois: o conflito é novo em B, e A não é afetada.
    b.review.close();
    b.session.actions.renameMarking('M1', 'Topo');
    expect(b.review.open('P1')).toMatchObject({ resumed: 'full', newConflicts: 1 });
    b.review.close();

    // A mesma cópia com outro nome de pasta (renomeada no disco) continua sendo a mesma.
    const again = await openHarness({
      project: edited,
      proposals: [proposal],
      folderName: 'loja-renomeada',
      copyId: 'loja-1',
    });
    expect(again.review.derived.freshIds.value).toEqual([]);
    expect(again.review.open('P1')).toEqual({
      ok: true,
      resumed: 'full',
      newConflicts: 0,
    });
    expect(again.review.selected.value).toEqual({ level: 'item', id: 'M4' });
    expect(again.review.filters.value.decision).toBe('undecided');
  });

  it('a chave é `copyId|proposalId` e o blob tem `v: 2`, `seen` e `resume`', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal], copyId: 'copia-x' });
    review.open('P1');
    review.select({ level: 'item', id: 'M4' });
    review.close();
    const stored = blob();
    expect(stored.v).toBe(2);
    expect(stored.seen).toEqual(['copia-x|P1']);
    expect(Object.keys(stored.resume)).toEqual(['copia-x|P1']);
    for (const key of [...stored.seen, ...Object.keys(stored.resume)]) {
      expect(key).toMatch(/^[^|]+\|[A-Za-z0-9._-]+$/);
    }
    expect(stored.resume['copia-x|P1']).toMatchObject({
      selected: { level: 'item', id: 'M4' },
      view: 'proposed',
      knownConflicts: [],
    });
  });

  it('sem copyId o escopo é vazio (chave `|P1`) e o Diagnóstico registra', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal], copyId: null });
    review.open('P1');
    review.close();
    expect(Object.keys(blob().resume)).toEqual(['|P1']);
    expect(reportedErrors.value.map((e) => e.context)).toContain('review.scope');
  });

  it('o blob v1 (sem versão, com entradas legadas e da cópia) é descartado: nada retomado, tudo "Nova", e regravado como v2', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ P1: v1Entry, 'folder:projeto|P1': v1Entry }),
    );
    const { review } = await openHarness({ project: edited, proposals: [proposal] });
    expect(review.derived.freshIds.value).toEqual(['P1']);
    // A primeira abertura nesta cópia não marca conflito novo (não há com o que comparar).
    expect(review.open('P1')).toEqual({ ok: true, resumed: 'none', newConflicts: 0 });
    expect(review.view.value).toBe('proposed');
    expect(review.selected.value).toEqual({
      level: 'change',
      id: proposal.changes[0]?.id,
    });
    expect(review.filters.value.decision).toBe('all');
    const stored = blob();
    expect(stored.v).toBe(2);
    expect(Object.keys(stored.resume)).toHaveLength(1);
    expect(stored.resume.P1).toBeUndefined();
    expect(stored.resume['folder:projeto|P1']).toBeUndefined();
  });

  it('uma versão desconhecida do blob também é descartada', async () => {
    const { proposal } = richScenario();
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ v: 3, seen: ['x|P1'], resume: {}, extra: true }),
    );
    const { review } = await openHarness({ proposals: [proposal], copyId: 'x' });
    expect(review.derived.freshIds.value).toEqual(['P1']);
    expect(review.open('P1')).toMatchObject({ resumed: 'none' });
    review.close();
    expect(blob()).toMatchObject({ v: 2, seen: ['x|P1'] });
  });

  it('o resume guarda só as 12 propostas mais recentes da cópia; "vista" não tem limite (P3)', async () => {
    const proposals: Proposal[] = [];
    for (let i = 1; i <= 13; i++) {
      proposals.push({
        ...richScenario(`P${i}`).proposal,
        createdAt: `2026-10-${String(i).padStart(2, '0')}T12:00:00.000Z`,
      });
    }
    const { review } = await openHarness({ proposals, copyId: 'c' });
    for (let i = 1; i <= 13; i++) {
      review.open(`P${i}`);
      review.select({ level: 'item', id: 'M4' });
      review.close();
    }
    const stored = blob();
    expect(Object.keys(stored.resume)).toHaveLength(12);
    expect(stored.resume['c|P1']).toBeUndefined();
    expect(Object.keys(stored.resume)[0]).toBe('c|P2');
    expect(Object.keys(stored.resume).at(-1)).toBe('c|P13');
    expect(stored.seen).toHaveLength(13);
    // A primeira continua vista: a eviction do resume não a devolve a "Nova".
    expect(review.derived.freshIds.value).toEqual([]);
    expect(review.open('P1')).toMatchObject({ resumed: 'none' });
    review.close();
    // Outra sessão da mesma cópia lê o mesmo.
    const again = await openHarness({ proposals, copyId: 'c' });
    expect(again.review.derived.freshIds.value).toEqual([]);
    // Outra cópia tem o seu próprio limite: as entradas desta não são tocadas.
    const other = await openHarness({ proposals: [proposals[0]!], copyId: 'd' });
    other.review.open('P1');
    other.review.close();
    expect(Object.keys(blob().resume)).toHaveLength(13);
  });

  it('com o localStorage bloqueado, abrir não lança e a proposta deixa de ser "Nova" na sessão', async () => {
    const { proposal } = richScenario();
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado');
      },
    });
    try {
      const { review } = await openHarness({ proposals: [proposal] });
      expect(review.derived.freshIds.value).toEqual(['P1']);
      expect(review.open('P1')).toMatchObject({ ok: true, resumed: 'none' });
      review.select({ level: 'item', id: 'M4' });
      review.close();
      expect(review.derived.freshIds.value).toEqual([]);
      expect(review.derived.rows.value[0]?.fresh).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('o que outra aba marcou como vista entra nesta na próxima gravação ou abertura (limite aceito, D4)', async () => {
    const p1 = richScenario('P1').proposal;
    const p2 = { ...richScenario('P2').proposal, createdAt: '2026-10-10T12:00:00.000Z' };
    const tabB = await openHarness({ proposals: [p1, p2], copyId: 'c' });
    const tabA = await openHarness({ proposals: [p1, p2], copyId: 'c' });
    expect(tabB.review.derived.freshIds.value).toEqual(['P2', 'P1']);
    tabA.review.open('P1');
    tabA.review.close();
    // Sem evento entre abas: B ainda conta P1 como nova...
    expect(tabB.review.derived.freshIds.value).toEqual(['P2', 'P1']);
    // ...até a próxima abertura (ou gravação) dela, que relê o blob.
    tabB.review.open('P2');
    expect(tabB.review.derived.freshIds.value).toEqual([]);
  });

  it('selecionar e navegar não reatribuem `seen` nem recalculam as linhas da janela Propostas (E2)', async () => {
    const { proposal } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const seen = review.seen.value;
    const rows = review.derived.rows.value;
    review.select({ level: 'item', id: 'M4' });
    review.setView('current');
    review.step('pending', 1);
    review.setFilters({ decision: 'undecided' });
    expect(review.seen.value).toBe(seen);
    expect(review.derived.rows.value).toBe(rows);
  });

  it('o filtro de camada criada pela proposta sobrevive ao retomar, em qualquer visão (P9)', async () => {
    const base = sampleProject();
    const after = addLayer(base, { id: 'L3', name: 'Eventos', color: '#00AA00' });
    const proposal = propose(base, after, { id: 'P1' });
    const { review } = await openHarness({ proposals: [proposal], copyId: 'c' });
    review.open('P1');
    review.setFilters({ layerId: 'L3' });
    review.setView('current');
    review.close();
    expect(review.open('P1')).toMatchObject({ resumed: 'full' });
    expect(review.view.value).toBe('current');
    expect(review.filters.value.layerId).toBe('L3');
    review.close();
    // Uma camada que não existe nem no atual nem na prévia sai do filtro.
    const stored = blob();
    stored.resume['c|P1'].filters.layerId = 'LX';
    localStorage.setItem(RESUME_KEY, JSON.stringify(stored));
    review.open('P1');
    expect(review.filters.value.layerId).toBeNull();
  });

  it('decidir sem revisão aberta é recusado sem lançar; a proposta apagada por fora fecha sem gravar resume (P11)', async () => {
    const { proposal, ids } = richScenario();
    const { session, root, review } = await openHarness({ proposals: [proposal] });
    expect(await review.decide({ level: 'change', id: ids.name }, 'accepted')).toEqual({
      ok: false,
      error: 'unknown-proposal',
    });
    review.open('P1');
    review.select({ level: 'item', id: 'M4' });
    localStorage.removeItem(RESUME_KEY);
    root.dirs.get('proposals')?.dirs.delete('P1');
    await session.sync();
    expect(review.proposalId.value).toBeNull();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });
});

describe('retomar a revisão', () => {
  it('volta ao último item, com os mesmos filtros e a mesma visão, por dispositivo', async () => {
    const { proposal, ids } = richScenario();
    const first = await openHarness({ proposals: [proposal], copyId: 'c' });
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

    // "Fechar a app": outra sessão, outro estado de revisão, o mesmo localStorage e a
    // mesma cópia do projeto.
    const second = await openHarness({ proposals: [proposal], copyId: 'c' });
    expect(second.review.seen.value.has('P1')).toBe(true);
    const reopened = second.review.open('P1');
    expect(reopened).toMatchObject({ ok: true, resumed: 'full' });
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
    const first = await openHarness({ proposals: [proposal], copyId: 'c' });
    first.review.open('P1');
    first.review.select({ level: 'item', id: 'M5' });
    first.review.setFilters({ imageId: 'I3' });
    first.review.close();

    // A proposta mudou por fora: o item e a imagem do filtro sumiram.
    const smaller = {
      ...proposal,
      changes: proposal.changes.filter((c) => c.id === ids.name || c.id === ids.rect),
    };
    const second = await openHarness({ proposals: [smaller], copyId: 'c' });
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
      expect(b.review.open('P1')).toMatchObject({ ok: true, resumed: 'none' });
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
    expect(row.supersededBy?.id).toBe('NEW');
    expect(row.leftBehind?.undecided).toEqual([rectOld]);
    expect(
      review.derived.rows.value.find((r) => r.proposal.id === 'NEW')?.supersededBy,
    ).toBeNull();
    // As aceitas da substituída ainda podem ser aplicadas.
    expect(review.derived.canApply.value).toBe(true);
  });

  // Achado 13 (parte da app): a proposta aplicada não muda de status ao ser substituída
  // (é histórico); a linha deriva "substituída por" do `supersedes` da nova.
  it('a proposta aplicada continua aplicada e a linha sabe quem a substituiu (título e id)', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const applied: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Só a correção',
    };
    const { review, root } = await openHarness({ proposals: [applied, next] });
    const row = must(review.derived.rows.value.find((r) => r.proposal.id === 'P1'));
    expect(row.proposal.status).toBe('applied');
    expect(row.supersededBy).toMatchObject({ id: 'P2', title: 'Só a correção' });
    expect(row.leftBehind).toBeNull();
    // Nada é gravado: o arquivo da antiga continua `applied`.
    expect((await diskProposal(root)).status).toBe('applied');
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
    expect(project.containers.map((i) => i.id)).toContain('I3');
    expect(project.markings.find((m) => m.id === 'M1')?.name).toBe('Porta dianteira');
    expect(project.annotations.some((a) => a.id === 'A9')).toBe(true);
    expect(undoBefore).toBe(false);
    expect(session.store.canUndo.value).toBe(true);
    expect((await projectOnDisk(h)).containers.map((i) => i.id)).toContain('I3');
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
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
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
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
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
    const after = replaceContainer(base, 'I2', {
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
    expect(preview.project.containers.map((i) => i.id)).toContain('I3');
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

// Fase 9.2: apagar uma proposta fechada. O desfazer do projeto continua valendo (o vínculo
// da aplicação sai do histórico), o retomar daquela proposta sai do blob e a revisão aberta
// recusa.
describe('apagar proposta (fase 9.2)', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };
  const RESUME_KEY = 'mapping.reviewResume';

  /** Aplica tudo de P1 (fecha a revisão): a proposta fica "aplicada" e o projeto muda. */
  async function appliedHarness(
    options: { copyId?: string; others?: readonly Proposal[] } = {},
  ) {
    const { proposal } = richScenario();
    const h = await openHarness({
      proposals: [proposal, ...(options.others ?? [])],
      files,
      ...(options.copyId === undefined ? {} : { copyId: options.copyId }),
    });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    h.review.close();
    return h;
  }

  it('apaga a aplicada do disco e da lista; desfazer e refazer o projeto depois não dão erro nem deixam arquivo órfão citado', async () => {
    const h = await appliedHarness();
    const { session, review, root } = h;
    expect((await diskProposal(root)).status).toBe('applied');

    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });

    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    expect(session.proposals.list.value).toEqual([]);
    expect(review.derived.rows.value).toEqual([]);
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);
    // A entrada da aplicação continua no histórico, agora só do projeto.
    expect(session.store.canUndo.value).toBe(true);

    clearReportedErrors();
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
    const undone = await projectOnDisk(h);
    expect(undone.containers.map((i) => i.id)).not.toContain('I3');
    // Nada de proposta ressuscitada, nem imagem devolvida a proposals/P1/.
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    // O arquivo copiado para images/ segue a limpeza normal da sessão: o mapping.json
    // gravado já não o cita, então ele saiu.
    expect(await root.read('images/nova.webp')).toBeNull();

    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    const redone = await projectOnDisk(h);
    expect(redone.containers.map((i) => i.id)).toContain('I3');
    // O mapping.json cita images/nova.webp e o arquivo está lá (restaurado da lixeira).
    expect(redone.containers.find((i) => i.id === 'I3')?.file).toBe('images/nova.webp');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(reportedErrors.value).toEqual([]);
  });

  it('o refazer pendente de uma aplicação desfeita antes de apagar também fica só do projeto', async () => {
    const h = await appliedHarness();
    const { session, review, root } = h;
    // Desfaz a aplicação (a proposta volta a "aberta"): ela não pode ser apagada assim.
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    expect((await diskProposal(root)).status).toBe('open');
    expect(await review.removeProposal('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    // Refazer volta a aplicar; agora a proposta está aplicada e pode ser apagada.
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    expect((await diskProposal(root)).status).toBe('applied');
    // Desfaz de novo e apaga com a entrada no "refazer": refazer só mexe no projeto.
    expect(session.store.undo()).toBe(true);
    await session.proposals.settled();
    writeOutside(root, { ...(await diskProposal(root)), status: 'withdrawn' });
    await session.proposals.scan();
    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });
    clearReportedErrors();
    expect(session.store.canRedo.value).toBe(true);
    expect(session.store.redo()).toBe(true);
    await session.proposals.settled();
    await session.flush();
    expect(session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(root.dirs.get('proposals')?.dirs.has('P1') ?? false).toBe(false);
    expect(reportedErrors.value).toEqual([]);
  });

  it('a entrada do retomar e a "vista" daquela proposta saem do blob; as das outras ficam', async () => {
    const p2 = richScenario('P2').proposal;
    const h = await appliedHarness({ copyId: 'copia-9', others: [p2] });
    const { review } = h;
    review.open('P2');
    review.select({ level: 'item', id: 'M4' });
    review.close();
    const before = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
    expect(before.seen).toEqual(['copia-9|P1', 'copia-9|P2']);
    expect(Object.keys(before.resume).sort()).toEqual(['copia-9|P1', 'copia-9|P2']);

    expect(await review.removeProposal('P1')).toMatchObject({ ok: true });

    const after = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null');
    expect(after.seen).toEqual(['copia-9|P2']);
    expect(Object.keys(after.resume)).toEqual(['copia-9|P2']);
    expect(review.seen.value.has('P1')).toBe(false);
    expect(review.seen.value.has('P2')).toBe(true);
  });

  it('com o localStorage bloqueado, apagar não lança', async () => {
    const h = await appliedHarness();
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado');
      },
    });
    try {
      expect(await h.review.removeProposal('P1')).toMatchObject({ ok: true });
      expect(h.session.proposals.list.value).toEqual([]);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('recusa durante a revisão e em projeto somente leitura, sem apagar nada', async () => {
    const closed: Proposal = { ...richScenario('P1').proposal, status: 'withdrawn' };
    const open = richScenario('P2').proposal;
    const { review, session, root } = await openHarness({ proposals: [closed, open] });

    review.open('P2');
    expect(await review.removeProposal('P1')).toEqual({ ok: false, error: 'reviewing' });
    expect(await session.proposalActions.removeProposal('P1')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    review.close();

    session.store.load(must(session.store.project.value), { readOnly: true });
    expect(await review.removeProposal('P1')).toEqual({ ok: false, error: 'read-only' });
    expect(await root.read('proposals/P1/proposal.json')).not.toBeNull();
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('proposta aberta não se apaga', async () => {
    const { review, root } = await openHarness({ proposals: [richScenario().proposal] });
    expect(await review.removeProposal('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await root.read('proposals/P1/proposal.json')).not.toBeNull();
  });
});

// Fase 9.5: o índice "mudanças por entidade e campo" dos Detalhes na revisão.
describe('mudanças por entidade e campo (fase 9.5)', () => {
  it('agrupa por entidade: criação/remoção inteira e alterações por campo', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    const index = review.derived.fieldIndex.value;
    // Alteração de campo: o nome de M1 e a posição de M4.
    expect(index.entities.get('M1')?.whole).toBeNull();
    expect(index.entities.get('M1')?.fields.get('name')?.id).toBe(ids.name);
    expect(index.entities.get('M4')?.fields.get('rect')?.id).toBe(ids.rect);
    // Criação: a entidade inteira, sem campos.
    expect(index.entities.get('M5')?.whole?.id).toBe(ids.marking);
    expect(index.entities.get('M5')?.fields.size).toBe(0);
    expect(index.entities.get('I3')?.whole?.id).toBe(ids.image);
    expect(index.entities.get('A9')?.entity).toBe('annotation');
    // Anotações por marcação em que aparecem.
    expect(index.annotationsOf.get('M5')?.map((c) => c.id)).toEqual([ids.annotation]);
    expect(index.leaving.size).toBe(0);
  });

  it('pares e campos da anotação, a remoção e a troca de marcação (as que saem)', () => {
    const base = sampleProject();
    let after = updateEntry(base, 'A1', 'E1', { key: 'tipo', value: 'risco' });
    after = removeEntry(after, 'A1', 'E2');
    after = removeAnnotation(after, 'A2');
    after = {
      ...after,
      annotations: after.annotations.map((a) =>
        a.id === 'A3' ? { ...a, markingId: 'M1' } : a,
      ),
    };
    const p = propose(base, after);
    const index = fieldChangeIndex(p.changes);
    const a1 = index.entities.get('A1');
    expect([...(a1?.fields.keys() ?? [])].sort()).toEqual(['entries.E1', 'entries.E2']);
    expect(a1?.fields.get('entries.E2')?.to).toBeNull();
    expect(index.entities.get('A2')?.whole?.kind).toBe('remove');
    // A2 sai de M1 (removida); A3 sai de M2 (vai para M1, onde aparece).
    expect(index.leaving.get('M1')?.map((c) => c.entityId)).toEqual(['A2']);
    expect(index.leaving.get('M2')?.map((c) => c.entityId)).toEqual(['A3']);
    expect(
      index.annotationsOf
        .get('M1')
        ?.map((c) => c.entityId)
        .sort(),
    ).toEqual(['A1', 'A1', 'A2', 'A3']);
    // Grupo Projeto (camada) entra; especialização e repositório não têm painel.
    expect(index.entities.has('L1')).toBe(false);
  });

  it('memoizado pela proposta: decidir não refaz o índice; outra proposta, sim', async () => {
    const { proposal, ids } = richScenario();
    const other = richScenario('P2').proposal;
    const { review } = await openHarness({ proposals: [proposal, other] });
    review.open('P1');
    const index = review.derived.fieldIndex.value;
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    await review.decide({ level: 'item', id: 'M4' }, 'rejected');
    expect(review.derived.fieldIndex.value).toBe(index);
    review.close();
    review.open('P2');
    expect(review.derived.fieldIndex.value).not.toBe(index);
    expect(review.derived.fieldIndex.value.entities.get('M1')?.fields.has('name')).toBe(
      true,
    );
  });

  it('o "como ficaria" sem as decisões guarda a criação rejeitada', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    await review.decide({ level: 'change', id: ids.marking }, 'rejected');
    expect(
      must(review.derived.preview.value).project.markings.some((m) => m.id === 'M5'),
    ).toBe(false);
    const full = must(review.derived.fullPreview.value);
    expect(full.markings.some((m) => m.id === 'M5')).toBe(true);
    // Memoizado pelas mudanças: decidir de novo não o refaz.
    await review.decide({ level: 'change', id: ids.name }, 'accepted');
    expect(review.derived.fullPreview.value).toBe(full);
  });
});

describe('pedido de foco no marcador (Detalhes, fase 9.6)', () => {
  it('vale para a mudança que nomeia; ir para outra, fechar ou sair da revisão o descarta', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.markRequest.value).toBeNull();

    review.select({ level: 'change', id: ids.name });
    review.requestMark(ids.name);
    const first = must(review.markRequest.value);
    expect(first.changeId).toBe(ids.name);
    // Selecionar a mesma mudança de novo (o clique que pediu) não descarta o pedido.
    review.select({ level: 'change', id: ids.name });
    expect(review.markRequest.value).toBe(first);
    // Dois pedidos seguidos da mesma mudança se distinguem.
    review.requestMark(ids.name);
    expect(must(review.markRequest.value).seq).toBeGreaterThan(first.seq);

    // Quem cumpre limpa.
    review.clearMarkRequest();
    expect(review.markRequest.value).toBeNull();

    // Ir para outra mudança descarta o que ficou pendente.
    review.requestMark(ids.name);
    review.select({ level: 'change', id: ids.rect });
    expect(review.markRequest.value).toBeNull();

    // Sair da revisão também.
    review.requestMark(ids.rect);
    review.close();
    expect(review.markRequest.value).toBeNull();
  });
});

describe('pedido da nota sugerida (rejeitar pelo marcador, fase 10.1)', () => {
  it('vale para a mudança que nomeia; limpar, ir para outra ou sair da revisão o descarta', async () => {
    const { proposal, ids } = richScenario();
    const { review } = await openHarness({ proposals: [proposal] });
    review.open('P1');
    expect(review.noteRequest.value).toBeNull();

    review.select({ level: 'change', id: ids.name });
    review.requestNote(ids.name);
    const first = must(review.noteRequest.value);
    expect(first.changeId).toBe(ids.name);
    // Selecionar a mesma mudança de novo (o clique que pediu) não o descarta.
    review.select({ level: 'change', id: ids.name });
    expect(review.noteRequest.value).toBe(first);
    review.requestNote(ids.name);
    expect(must(review.noteRequest.value).seq).toBeGreaterThan(first.seq);

    review.clearNoteRequest();
    expect(review.noteRequest.value).toBeNull();

    review.requestNote(ids.name);
    review.select({ level: 'change', id: ids.rect });
    expect(review.noteRequest.value).toBeNull();

    review.requestNote(ids.rect);
    review.close();
    expect(review.noteRequest.value).toBeNull();
  });
});
