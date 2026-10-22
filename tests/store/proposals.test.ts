// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  proposalFilePath,
  serialize,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
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

describe('ProposalStore.remove: apagar proposta fechada (fase 9.2)', () => {
  const closed = (id: string, status: Proposal['status']): Proposal => ({
    ...richScenario(id).proposal,
    status,
  });

  it('apaga proposals/<id>/ do disco (arquivo e imagens), tira da lista e não gera aviso "apagada por fora"', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn'), closed('P2', 'superseded')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    const result = await session.proposals.remove('P1');
    expect(result).toMatchObject({ ok: true });
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.proposals.list.value.map((p) => p.id)).toEqual(['P2']);
    expect(session.proposals.notices.value).toEqual([]);

    // A conferência seguinte da pasta não avisa nada.
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);
    expect(session.proposals.get('P1')).toBeNull();
    // A outra proposta segue intacta.
    expect(await diskProposal(root, 'P2')).toMatchObject({ id: 'P2' });
  });

  it('o zip exportado depois não leva a proposta apagada nem as imagens dela', async () => {
    const { session } = await openHarness({
      proposals: [closed('P1', 'applied'), closed('P2', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP', 'proposals/P2/images/nova.webp': 'W2' },
    });
    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });
    const files = await session.collectFiles();
    expect([...files.proposals.keys()]).toEqual([proposalFilePath('P2')]);
    // As imagens só saem para a exportação se a proposta ainda espera por elas.
    expect([...files.proposalImages.keys()]).not.toContain(NEW_IMAGE_PATH);
  });

  it('recusa a proposta aberta, sem apagar nada', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await diskProposal(root)).toMatchObject({ id: 'P1', status: 'open' });
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('relê o arquivo: se o agente reabriu a proposta por fora, recusa e adota a versão do disco', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    expect(session.proposals.get('P1')?.status).toBe('withdrawn');
    // Fora da app, o arquivo volta a estar aberto (outra revision).
    writeOutside(root, { ...richScenario().proposal, revision: 5 });

    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await diskProposal(root)).toMatchObject({ status: 'open', revision: 5 });
    expect(session.proposals.get('P1')).toMatchObject({ status: 'open', revision: 5 });
  });

  it('arquivo que mudou por fora e ficou ilegível: recusa e não apaga', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    root.put(proposalFilePath('P1'), '{ editando...');
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'unreadable',
    });
    expect(await root.read(proposalFilePath('P1'))).toBe('{ editando...');
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('proposta desconhecida: unknown-proposal', async () => {
    const { session } = await openHarness({ proposals: [closed('P1', 'withdrawn')] });
    expect(await session.proposals.remove('nada')).toEqual({
      ok: false,
      error: 'unknown-proposal',
    });
  });

  it('o arquivo já sumiu por fora: apaga o que sobrou da pasta, sem aviso', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    root.dirs.get('proposals')?.dirs.get('P1')?.files.delete('proposal.json');
    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('falha ao apagar: remove-failed, a proposta continua na lista e o erro vai ao Diagnóstico', async () => {
    const { session, storage } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    vi.spyOn(storage, 'removeProposal').mockRejectedValue(new Error('permissão negada'));
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'remove-failed',
    });
    expect(session.proposals.get('P1')).not.toBeNull();
    expect(reportedErrors.value.map((e) => e.context)).toContain('proposals.remove');
  });

  it('tira os avisos daquela proposta e chama onRemoved só depois de apagar', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    // Alterada por fora (ainda fechada): o aviso "changed" entra na fila.
    writeOutside(root, { ...closed('P1', 'withdrawn'), title: 'Mexida', revision: 2 });
    await session.proposals.scan();
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);

    let existedWhenCalled: boolean | null = null;
    await session.proposals.remove('P1', () => {
      existedWhenCalled = root.dirs.get('proposals')?.dirs.has('P1') ?? false;
    });
    expect(existedWhenCalled).toBe(false);
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('uma proposta nova com supersedes apontando para a apagada continua listada, sem erro', async () => {
    const old = closed('P1', 'superseded');
    const newer: Proposal = { ...richScenario('P2').proposal, supersedes: 'P1' };
    const { session, review } = await openHarness({ proposals: [old, newer] });
    expect(
      review.derived.rows.value.find((r) => r.proposal.id === 'P1')?.supersededBy,
    ).toMatchObject({ id: 'P2' });

    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });

    const rows = review.derived.rows.value;
    expect(rows.map((r) => r.proposal.id)).toEqual(['P2']);
    expect(rows[0]).toMatchObject({ supersededBy: null, leftBehind: null });
    // Abrir a nova na revisão não depende da apagada.
    expect(review.open('P2')).toMatchObject({ ok: true });
    expect(review.derived.supersession.value).toBeNull();
    review.close();
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
  });

  it('entra na fila: uma gravação em curso termina antes de apagar', async () => {
    const { session, root } = await openHarness({ proposals: [closed('P1', 'applied')] });
    const note = session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'Com nota' },
      value: null,
    }));
    const removal = session.proposals.remove('P1');
    expect(await note).toMatchObject({ ok: true });
    expect(await removal).toMatchObject({ ok: true });
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    // Nada de proposta ressuscitada pela gravação.
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
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
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
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

  // Terceira leitura da etapa 8 (auditoria, §6.1): uma conferência adota um mapping.json de
  // fora durante a falha do proposal.json. O arquivo de fora cita a cópia; o rollback da
  // compensação não pode apagá-la.
  it('proposal.json falhando com o mapping.json recarregado por fora na janela: a cópia citada pelo disco fica', async () => {
    const h = await readyToApply();
    vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async () => {
      // O mapping.json aplicado já gravou e cita images/nova.webp. Nessa janela, o MCP o
      // relê, edita o nome do projeto e grava revision + 1 (o arquivo continua citando a cópia).
      const applied = await diskProject(h);
      expect(applied.containers.map((i) => i.file)).toContain('images/nova.webp');
      h.root.put(
        'mapping.json',
        serialize({
          ...applied,
          revision: applied.revision + 1,
          project: { ...applied.project, name: 'Do agente' },
        }),
      );
      // O poll do useExternalChanges confere e recarrega (sem pendência local: 'reloaded').
      // Não dá para esperar a promessa inteira do sync aqui (a varredura das propostas fica
      // atrás desta mesma mutação): espera só o trabalho da fila da sessão.
      void h.session.sync();
      await h.session.flush();
      expect(h.session.reloads.value).toBe(1);
      throw new Error('disco cheio');
    });

    expect(await h.review.apply()).toEqual({ ok: false, error: 'write-failed' });
    await h.session.proposals.settled();
    // O projeto em memória e no disco são o de fora, e ele cita a cópia.
    expect(h.session.store.project.value?.project.name).toBe('Do agente');
    expect(h.session.store.project.value?.containers.map((i) => i.file)).toContain(
      'images/nova.webp',
    );
    expect((await diskProject(h)).containers.map((i) => i.file)).toContain(
      'images/nova.webp',
    );
    // A proposta continua sem `applied` e a origem continua lá.
    expect((await diskProposal(h.root)).applied).toEqual({});
    expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    // O ponto da pergunta: o rollback da compensação não pode apagar um arquivo que o disco cita.
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
  });

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
    expect(disk.containers.map((i) => i.id)).not.toContain('I3');
    expect(disk.revision).toBe(5);
    expect(h.session.saveStatus.value).toBe('saved');

    // O disco da proposta volta: aplicar de novo conclui, sem conflito nem duplicata.
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(await h.root.read(NEW_IMAGE_PATH)).toBeNull();
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
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
    expect(h.session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
    expect(h.session.store.canUndo.value).toBe(false);
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(h.session.saveStatus.value).toBe('error');

    // "Tentar de novo": o projeto de antes vai ao disco e a limpeza tira a cópia órfã.
    save.mockRestore();
    expect(await h.session.flush()).toEqual({ ok: true });
    expect((await diskProject(h)).containers.map((i) => i.id)).not.toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBeNull();
    expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
  });

  /**
   * Segura a próxima gravação do `proposal.json`: `reached` resolve quando ela começa (o
   * projeto já foi aplicado e o `mapping.json` gravado); `release()` a deixa seguir, ou
   * falhar com o erro dado.
   */
  function holdProposalWrite(h: Harness) {
    const original = h.storage.writeProposal.bind(h.storage);
    let release: (error?: Error) => void = () => undefined;
    const held = new Promise<Error | undefined>((resolve) => {
      release = resolve;
    });
    let reachedNow: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      reachedNow = resolve;
    });
    vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async (id, text) => {
      reachedNow();
      const error = await held;
      if (error) throw error;
      return original(id, text);
    });
    return { reached, release };
  }

  /** A revisão sem os avisos: conjunto válido, nenhum conflito, nada "novo". */
  function expectNoWarnings(h: Harness) {
    const d = h.review.derived;
    expect(d.validation.value?.ok).toBe(true);
    expect(d.validation.value?.issues).toEqual([]);
    expect([...d.conflictIds.value]).toEqual([]);
    expect([...h.review.newConflicts.value]).toEqual([]);
    expect([...d.situation.value.values()].some((s) => s.conflict)).toBe(false);
    expect(d.counts.value.conflicts).toBe(0);
  }

  // Devolução do portão da 8.2 (achado 7): entre o `store.apply` e a publicação do
  // `proposal.json` com `applied`, a revisão reavaliava as aceitas contra um projeto que
  // já as tinha ("Aplicar bloqueado" e "O projeto mudou desde a sua última sessão").
  it('durante o aplicar, com o proposal.json ainda gravando, a revisão não mostra aviso; depois, também não', async () => {
    const h = await readyToApply();
    expectNoWarnings(h);
    const hold = holdProposalWrite(h);
    const applying = h.review.apply();
    await hold.reached;
    // O projeto já tem as mudanças e o mapping.json já gravou; a proposta ainda não diz.
    expect(h.session.store.committed.value?.containers.map((i) => i.id)).toContain('I3');
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
    expect(h.review.derived.proposal.value?.applied).toEqual({});
    expectNoWarnings(h);

    hold.release();
    expect(await applying).toMatchObject({ ok: true, applied: 5, files: 1 });
    expectNoWarnings(h);
    expect(Object.keys(h.review.derived.proposal.value?.applied ?? {})).toHaveLength(5);
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('durante o aplicar, o proposal.json falhando: depois da compensação, a revisão volta a valer o de antes', async () => {
    const h = await readyToApply();
    const hold = holdProposalWrite(h);
    const applying = h.review.apply();
    await hold.reached;
    expectNoWarnings(h);
    hold.release(new Error('disco cheio'));
    expect(await applying).toEqual({ ok: false, error: 'write-failed' });
    await expectNothingApplied(h);
    expectNoWarnings(h);
    expect(h.review.derived.canApply.value).toBe(true);
  });
});
