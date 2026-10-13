// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  proposalFilePath,
  serialize,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import {
  NEW_IMAGE_PATH,
  diskProposal,
  openHarness,
  type Harness,
  richScenario,
  writeOutside,
} from './proposalHarness';

afterEach(() => {
  clearReportedErrors();
  vi.restoreAllMocks();
});

const accept = (p: Proposal, changeId: string): Proposal => ({
  ...p,
  decisions: {
    ...p.decisions,
    [changeId]: { state: 'accepted', at: '2026-10-09T13:00:00.000Z' },
  },
});

describe('ProposalStore: gravação com conferência do arquivo', () => {
  it('grava com revision + 1 e atualiza a lista; a proposta mantém o objeto enquanto não muda', async () => {
    const { proposal, ids } = richScenario();
    const { root, session } = await openHarness({
      proposals: [{ ...proposal, revision: 4 }],
    });
    const before = session.proposals.list.value[0];

    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: 'feito',
    }));
    expect(result).toMatchObject({ ok: true, value: 'feito' });
    const disk = await diskProposal(root);
    expect(disk.revision).toBe(5);
    expect(disk.decisions[ids.name]?.state).toBe('accepted');
    expect(session.proposals.list.value[0]).toBe(result.ok ? result.proposal : null);
    expect(session.proposals.list.value[0]).not.toBe(before);

    // Sem mudança, nada é gravado.
    const text = await root.read(proposalFilePath('P1'));
    const same = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: p,
      value: null,
    }));
    expect(same.ok).toBe(true);
    expect(await root.read(proposalFilePath('P1'))).toBe(text);
  });

  it('proposta que não existe e erro da função de mudança', async () => {
    const { session } = await openHarness({ proposals: [richScenario().proposal] });
    expect(
      await session.proposals.mutate('nada', (p) => ({
        ok: true,
        proposal: p,
        value: 1,
      })),
    ).toEqual({ ok: false, error: 'unknown-proposal' });
    expect(
      await session.proposals.mutate<number, 'recusei'>('P1', () => ({
        ok: false,
        error: 'recusei',
      })),
    ).toEqual({ ok: false, error: 'recusei' });
  });

  it('se o arquivo mudou por fora, parte da versão do disco em vez de sobrescrevê-la', async () => {
    const { proposal, ids } = richScenario();
    const { root, session } = await openHarness({ proposals: [proposal] });
    // O MCP reescreve o arquivo (outro título, revision 9) sem a app saber.
    writeOutside(root, { ...proposal, title: 'Título novo do agente', revision: 9 });

    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: p.title,
    }));
    expect(result).toMatchObject({ ok: true, value: 'Título novo do agente' });
    const disk = await diskProposal(root);
    expect(disk.title).toBe('Título novo do agente');
    expect(disk.revision).toBe(10);
    expect(disk.decisions[ids.name]?.state).toBe('accepted');
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);
  });

  it('proposta apagada por fora: erro "gone", sai da lista e avisa', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.dirs.get('proposals')?.dirs.delete('P1');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'x' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'gone' });
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['removed']);
  });

  it('arquivo que mudou por fora e ficou ilegível não é sobrescrito', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.put(proposalFilePath('P1'), '{ editando...');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'x' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'unreadable' });
    expect(await root.read(proposalFilePath('P1'))).toBe('{ editando...');
    expect(session.proposals.get('P1')?.title).toBe('Teste');
  });

  it('falha ao gravar: erro "write-failed" e a memória fica como estava', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    const dir = root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('sem pasta');
    dir.failWrites = new Error('disco cheio');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'novo' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'write-failed' });
    expect(session.proposals.get('P1')?.title).toBe('Teste');
  });

  it('as gravações rodam em fila, cada uma sobre o resultado da anterior', async () => {
    const { proposal, ids } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    const bump = (changeId: string) =>
      session.proposals.mutate('P1', (p) => ({
        ok: true,
        proposal: accept(p, changeId),
        value: null,
      }));
    await Promise.all([bump(ids.name), bump(ids.rect), bump(ids.image)]);
    const disk = await diskProposal(root);
    expect(Object.keys(disk.decisions).sort()).toEqual(
      [ids.image, ids.name, ids.rect].sort(),
    );
    expect(disk.revision).toBe(3);
  });
});

describe('ProposalStore: conferência da pasta', () => {
  it('percebe a proposta nova, a alterada e a apagada; as próprias gravações não contam', async () => {
    const { proposal, ids } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });

    // A app grava: a conferência seguinte não toma isso por mudança externa.
    await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: 0,
    }));
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);

    // O agente envia uma proposta nova e retira a primeira.
    const other = richScenario('P2').proposal;
    writeOutside(root, { ...other, title: 'Segunda' });
    expect(await session.proposals.scan()).toEqual({
      added: ['P2'],
      changed: [],
      removed: [],
    });
    expect(session.proposals.list.value.map((p) => p.id).sort()).toEqual(['P1', 'P2']);

    const current = session.proposals.get('P1');
    if (!current) throw new Error('sem P1');
    writeOutside(root, {
      ...current,
      status: 'withdrawn',
      revision: current.revision + 1,
    });
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: ['P1'],
      removed: [],
    });
    expect(session.proposals.get('P1')?.status).toBe('withdrawn');

    root.dirs.get('proposals')?.dirs.delete('P2');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: ['P2'],
    });
    expect(session.proposals.notices.value.map((n) => `${n.kind}:${n.id}`)).toEqual([
      'added:P2',
      'changed:P1',
      'removed:P2',
    ]);
    expect(session.proposals.notices.value[0]?.title).toBe('Segunda');

    session.proposals.clearNotices();
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('arquivo inválido vira problema (só uma vez) e some da lista; corrigido, aparece', async () => {
    const { session, root } = await openHarness();
    root.put(proposalFilePath('P7'), '{ não é json');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.problems.value.map((p) => p.id)).toEqual(['P7']);

    writeOutside(root, richScenario('P7').proposal);
    expect(await session.proposals.scan()).toEqual({
      added: ['P7'],
      changed: [],
      removed: [],
    });
    expect(session.proposals.problems.value).toEqual([]);
  });

  it('uma proposta conhecida que fica ilegível um instante (editor escrevendo) é ignorada', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.put(proposalFilePath('P1'), '{ editando');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.get('P1')?.title).toBe('Teste');
    expect(session.proposals.problems.value).toEqual([]);
  });

  // Fase 8.2 (P4): o aviso de uma proposta sai da fila por ação do store (quem abre a
  // revisão chama), do tipo dado ou todos.
  it('dismissNotice tira da fila os avisos de uma proposta, por tipo ou todos', async () => {
    const { session, root } = await openHarness({ skipProposals: true });
    writeOutside(root, richScenario('P1').proposal);
    writeOutside(root, richScenario('P2').proposal);
    await session.proposals.scan();
    const kinds = () => session.proposals.notices.value.map((n) => `${n.kind}:${n.id}`);
    expect(kinds()).toEqual(['added:P1', 'added:P2']);
    const before = session.proposals.notices.value;
    session.proposals.dismissNotice('P3', 'added');
    expect(session.proposals.notices.value).toBe(before);
    session.proposals.dismissNotice('P1', 'changed');
    expect(session.proposals.notices.value).toBe(before);
    session.proposals.dismissNotice('P1', 'added');
    expect(kinds()).toEqual(['added:P2']);
    writeOutside(root, { ...richScenario('P2').proposal, title: 'Outro' });
    await session.proposals.scan();
    expect(kinds()).toEqual(['added:P2', 'changed:P2']);
    session.proposals.dismissNotice('P2');
    expect(kinds()).toEqual([]);
  });

  it('session.sync() confere as propostas junto com o mapping.json', async () => {
    const { session, root } = await openHarness({ skipProposals: true });
    expect(session.proposals.list.value).toEqual([]);
    writeOutside(root, richScenario().proposal);
    expect(await session.sync()).toBe('unchanged');
    expect(session.proposals.list.value.map((p) => p.id)).toEqual(['P1']);
    expect(session.proposals.notices.value[0]).toMatchObject({ kind: 'added', id: 'P1' });
  });
});

describe('exportar propostas', () => {
  it('collectFiles leva as propostas e as imagens que aguardam aceitação', async () => {
    const { proposal } = richScenario();
    const { session } = await openHarness({
      proposals: [proposal],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    const files = await session.collectFiles();
    expect([...files.proposals.keys()]).toEqual([proposalFilePath('P1')]);
    expect(files.proposals.get(proposalFilePath('P1'))).toBe(serializeProposal(proposal));
    expect([...files.proposalImages.keys()]).toEqual([NEW_IMAGE_PATH]);
    expect(await files.proposalImages.get(NEW_IMAGE_PATH)?.text()).toBe('WEBP');
  });

  it('o arquivo inválido também vai, para não perder nada ao exportar', async () => {
    const { session } = await openHarness({
      files: { [proposalFilePath('P9')]: '{ quebrado' },
    });
    const files = await session.collectFiles();
    expect(files.proposals.get(proposalFilePath('P9'))).toBe('{ quebrado');
  });
});

describe('aplicar aceitas só conclui se o mapping.json gravou (fase 5.2)', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };

  /** Tudo aceito, pronto para aplicar. */
  async function readyToApply(): Promise<Harness> {
    const { proposal } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(h.review.derived.canApply.value).toBe(true);
    return h;
  }

  /** Nada mudou: projeto sem as mudanças, histórico vazio, proposta aberta e imagens no lugar. */
  async function expectNothingApplied(h: Harness) {
    const { session, root, review } = h;
    expect(session.store.project.value?.images.map((i) => i.id)).not.toContain('I3');
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.canRedo.value).toBe(false);
    await session.proposals.settled();
    const disk = await diskProposal(root);
    expect(disk.applied).toEqual({});
    expect(disk.status).toBe('open');
    expect(disk.revision).toBe(1);
    expect(Object.keys(disk.decisions)).toHaveLength(5);
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(await root.read('images/nova.webp')).toBeNull();
    // A revisão continua aberta, com as decisões intactas.
    expect(review.proposalId.value).toBe('P1');
    expect(review.derived.counts.value).toMatchObject({ applied: 0, acceptedPending: 5 });
  }

  it('mapping.json alterado por fora: save-failed, nada aplicado e o diálogo de conflito abre', async () => {
    const h = await readyToApply();
    // O MCP grava o mapping.json por fora enquanto a revisão está aberta.
    const base = sampleProject();
    const outside = serialize({
      ...base,
      project: { ...base.project, name: 'Do agente' },
      revision: 4,
    });
    h.root.put('mapping.json', outside);

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toEqual({ reloadFailed: false });
    expect(await h.root.read('mapping.json')).toBe(outside);

    // "Recarregar": o projeto do disco; a proposta continua aberta e pode ser aplicada.
    await h.session.resolveConflict('reload');
    expect(h.session.conflict.value).toBeNull();
    expect(h.session.store.project.value?.project.name).toBe('Do agente');
    expect(h.review.derived.counts.value.acceptedPending).toBe(5);
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('erro de armazenamento ao gravar o mapping.json: save-failed e nada aplicado', async () => {
    const h = await readyToApply();
    const save = vi
      .spyOn(h.storage, 'saveMapping')
      .mockRejectedValue(new Error('quota excedida'));

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toBeNull();

    // O armazenamento volta: aplicar de novo conclui.
    save.mockRestore();
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(await h.root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(h.session.saveStatus.value).toBe('saved');
  });

  /** O `mapping.json` em disco, lido de novo. */
  async function diskProject(h: Harness) {
    const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
    if (!parsed.ok) throw new Error('mapping.json inválido');
    return parsed.project;
  }

  // Fase 8.2 (P7): o `mapping.json` gravou, mas o `proposal.json` falhou. Sem compensar, o
  // projeto ficava com as mudanças e a proposta sem `applied` (reaplicar dava conflito,
  // imagens duplicadas). Agora o aplicar é desfeito como no `save-failed`: a entrada de
  // desfazer sai, o projeto de antes é regravado e as cópias saem de `images/`.
  it('proposal.json falhando depois do mapping.json gravar: write-failed, o projeto volta ao de antes e aplicar de novo conclui (P7)', async () => {
    const h = await readyToApply();
    const dir = h.root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('sem a pasta da proposta');
    dir.failWrites = new Error('disco cheio');

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'write-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toBeNull();
    // O disco tem o projeto de antes, regravado por cima do aplicado (duas revisões a mais).
    const disk = await diskProject(h);
    expect(disk.images.map((i) => i.id)).not.toContain('I3');
    expect(disk.revision).toBe(5);
    expect(h.session.saveStatus.value).toBe('saved');

    // O disco da proposta volta: aplicar de novo conclui, sem conflito nem duplicata.
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(await h.root.read(NEW_IMAGE_PATH)).toBeNull();
    expect((await diskProject(h)).images.map((i) => i.id)).toContain('I3');
    expect(h.session.store.canUndo.value).toBe(true);
  });

  it('proposal.json e, em seguida, o mapping.json falhando: as cópias ficam até a gravação passar (P7)', async () => {
    const h = await readyToApply();
    const dir = h.root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('sem a pasta da proposta');
    dir.failWrites = new Error('disco cheio');
    // A primeira gravação do mapping.json (o aplicado) passa; a da compensação falha.
    const original = h.storage.saveMapping.bind(h.storage);
    let calls = 0;
    const save = vi.spyOn(h.storage, 'saveMapping').mockImplementation((text) => {
      calls++;
      return calls === 2 ? Promise.reject(new Error('quota')) : original(text);
    });

    expect(await h.review.apply()).toEqual({ ok: false, error: 'write-failed' });
    // Em memória, o projeto de antes; no disco, ainda o aplicado, que cita a cópia: ela fica.
    expect(h.session.store.project.value?.images.map((i) => i.id)).not.toContain('I3');
    expect(h.session.store.canUndo.value).toBe(false);
    expect((await diskProject(h)).images.map((i) => i.id)).toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(h.session.saveStatus.value).toBe('error');

    // "Tentar de novo": o projeto de antes vai ao disco e a limpeza tira a cópia órfã.
    save.mockRestore();
    expect(await h.session.flush()).toEqual({ ok: true });
    expect((await diskProject(h)).images.map((i) => i.id)).not.toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBeNull();
    expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
  });
});
