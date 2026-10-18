import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supersedeProposal, type Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { formatWhen } from '../../../src/ui/review/format';
import { StatusBar } from '../../../src/ui/StatusBar';
import { AT, decided } from '../../model/proposalFixtures';
import { diskProposal, richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Janela Propostas fora da revisão (HANDOFF-PROPOSALS 5.1, passo 3 da seção 9): lista,
// estado vazio, a "Nova" que chegou, as aceitas aguardando aplicação e o aviso de
// proposta nova sobre o canvas.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

describe('janela Propostas: lista', () => {
  it('estado vazio explica como as propostas chegam', async () => {
    const h = await openReviewHarness();
    const onHelp = vi.fn();
    const onScan = vi.fn();
    renderInEditor(h, <ProposalList onHelp={onHelp} onScan={onScan} />);
    expect(screen.getByRole('heading', { name: 'Nenhuma proposta ainda' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Como o agente envia propostas' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verificar a pasta agora' }));
    expect(onHelp).toHaveBeenCalled();
    expect(onScan).toHaveBeenCalled();
    expect(screen.getByText(/zips importados também mostram e aplicam/)).toBeTruthy();
  });

  it('proposta que chegou: "Nova", contagens e Revisar como ação principal', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({
      proposals: [{ ...proposal, title: 'Checkout' }],
    });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Checkout')).toBeTruthy();
    expect(within(row).getByText('Nova')).toBeTruthy();
    const action = within(row).getByRole('button', { name: 'Revisar: Checkout' });
    expect(action.className).toContain('button-primary');
    // ○ pendentes, ✓ aceitas, ✕ rejeitadas.
    expect(within(row).getByTitle('sem decisão').textContent).toContain(
      String(proposal.changes.length),
    );
    fireEvent.click(action);
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('em andamento: "Em revisão", Continuar e as aceitas aguardando aplicação', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'image', id: 'I3' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Em revisão')).toBeTruthy();
    expect(within(row).getByText('3 aceitas aguardando aplicação')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /^Continuar/ })).toBeTruthy();
  });

  it('substituída: o que ficou para trás, no grupo das fechadas', async () => {
    const { base, proposal } = richScenario();
    const old = supersedeProposal(
      decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted'),
    );
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Nova versão',
    };
    const h = await openReviewHarness({ proposals: [old, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText('Fechadas')).toBeTruthy();
    expect(screen.getByText('Substituída')).toBeTruthy();
    expect(
      screen.getByText(
        `1 aceitas e ${proposal.changes.length - 1} sem decisão ficaram para trás`,
      ),
    ).toBeTruthy();
    // A fechada não leva "Nova"; a aberta que chegou, sim.
    expect(screen.getAllByText('Nova')).toHaveLength(1);
  });

  // Fase 8.2 (P4, O6 da rodada 4): `rows[].fresh` é a verdade; toda linha `fresh` leva o
  // selo e a ação principal, e a barra de status conta as mesmas.
  it('duas propostas que chegaram juntas: dois selos "Nova", duas ações principais e a barra conta 2', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout' };
    const b = {
      ...richScenario('P2').proposal,
      title: 'Correções',
      createdAt: '2026-10-10T12:00:00.000Z',
    };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(
      h,
      <>
        <ProposalList onHelp={noop} onScan={noop} />
        <StatusBar />
      </>,
    );
    expect(screen.getAllByText('Nova')).toHaveLength(2);
    for (const title of ['Checkout', 'Correções']) {
      const action = screen.getByRole('button', { name: `Revisar: ${title}` });
      expect(action.className).toContain('button-primary');
    }
    expect(screen.getByRole('button', { name: '2 proposta(s) nova(s)' })).toBeTruthy();
    // Abrir uma delas tira o selo e a conta dela, e só dela.
    act(() => {
      h.review.open('P2');
      h.review.close();
    });
    expect(screen.getAllByText('Nova')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '1 proposta(s) nova(s)' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Revisar: Correções' }).className,
    ).not.toContain('button-primary');
  });

  it('aplicada com uma só mudança diz "1 mudança aplicada" (singular)', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const [first, ...rest] = accepted.changes;
    if (!first || rest.length === 0)
      throw new Error('cenário precisa de várias mudanças');
    const one: Proposal = {
      ...accepted,
      status: 'applied',
      applied: { [first.id]: { at: AT } },
    };
    const h = await openReviewHarness({ proposals: [one] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText('1 mudança aplicada')).toBeTruthy();
    cleanup();
    const many: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const h2 = await openReviewHarness({ proposals: [many] });
    renderInEditor(h2, <ProposalList onHelp={noop} onScan={noop} />);
    expect(
      screen.getByText(`${accepted.changes.length} mudanças aplicadas`),
    ).toBeTruthy();
  });

  // Achado 13 (parte da app): a proposta já revisada e aplicada não muda de status ao ser
  // substituída; a linha mostra quem a substituiu e leva à nova.
  it('aplicada e substituída: "Aplicada · substituída por …" e Abrir a nova, sem mudar o arquivo', async () => {
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
    const h = await openReviewHarness({ proposals: [applied, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen
      .getAllByRole('listitem')
      .find((r) => r.getAttribute('data-proposal') === 'P1');
    if (!row) throw new Error('linha da P1');
    expect(within(row).getByText('Aplicada')).toBeTruthy();
    expect(within(row).getByText('substituída por Só a correção')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Ver: Teste' })).toBeTruthy();
    fireEvent.click(
      within(row).getByRole('button', { name: 'Abrir a nova: Só a correção' }),
    );
    expect(h.review.proposalId.value).toBe('P2');
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('busca por título, origem e autor e filtro Abertas/Fechadas', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout', origin: 'Figma' };
    const b = { ...richScenario('P2').proposal, title: 'Home', author: 'Agente X' };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.input(screen.getByRole('searchbox', { name: 'Buscar propostas' }), {
      target: { value: 'agente' },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Home')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechadas 0' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('Nenhuma proposta com este filtro.')).toBeTruthy();
  });
});

describe('aviso de proposta nova', () => {
  it('aparece quando a pasta traz uma proposta nova, com Revisar', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(h, <ProposalNotices />);
    expect(screen.queryByRole('status')).toBeNull();
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    const notice = screen.getByRole('status');
    expect(within(notice).getByText('Nova proposta')).toBeTruthy();
    expect(within(notice).getByText('Checkout')).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: 'Revisar' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  // Fase 8.2 (P4): abrir a proposta por qualquer caminho tira o aviso dela da fila (ação
  // do store), e ele não volta ao sair da revisão.
  it('some ao abrir a proposta pela janela Propostas e não volta ao sair da revisão', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(
      h,
      <>
        <ProposalNotices />
        <ProposalList onHelp={noop} onScan={noop} />
      </>,
    );
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => h.review.close());
    expect(screen.queryByRole('status')).toBeNull();
    expect(h.session.proposals.notices.value).toEqual([]);
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 9, 9, 15, 0);
  it('hoje, ontem e data curta', () => {
    expect(formatWhen(new Date(2026, 9, 9, 9, 40).toISOString(), now, 'pt-BR')).toBe(
      'hoje 09:40',
    );
    expect(formatWhen(new Date(2026, 9, 8, 18, 12).toISOString(), now, 'pt-BR')).toBe(
      'ontem 18:12',
    );
    expect(formatWhen(new Date(2026, 9, 6, 8, 0).toISOString(), now, 'pt-BR')).toBe(
      '06/10',
    );
    expect(formatWhen(new Date(2025, 9, 6, 8, 0).toISOString(), now, 'pt-BR')).toBe(
      '06/10/2025',
    );
  });
});

// Fase 9.2: menu ⋯ "Apagar proposta…" só nas linhas fechadas, com confirmação e foco.
describe('apagar proposta pelo menu ⋯ (fase 9.2)', () => {
  /** P1 aberta, P2 retirada e P3 aplicada: a lista mostra P1, P2, P3 nessa ordem. */
  async function threeProposals() {
    const open = { ...richScenario('P1').proposal, title: 'Aberta' };
    const withdrawn: Proposal = {
      ...richScenario('P2').proposal,
      title: 'Retirada pelo agente',
      status: 'withdrawn',
    };
    const applied: Proposal = {
      ...richScenario('P3').proposal,
      title: 'Já aplicada',
      status: 'applied',
    };
    const h = await openReviewHarness({
      proposals: [open, withdrawn, applied],
      files: { 'proposals/P2/images/nova.webp': 'W2' },
    });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    return h;
  }

  const rowOf = (id: string) => {
    const row = screen
      .getAllByRole('listitem')
      .find((r) => r.getAttribute('data-proposal') === id);
    if (!row) throw new Error(`linha ${id}`);
    return row;
  };
  const menuOf = (id: string) =>
    within(rowOf(id)).queryByRole('button', { name: /^Ações da proposta:/ });
  const actionOf = (id: string) =>
    within(rowOf(id)).getByRole('button', { name: /^(Revisar|Continuar|Ver):/ });

  async function askToRemove(user: ReturnType<typeof userEvent.setup>, id: string) {
    const trigger = menuOf(id);
    if (!trigger) throw new Error(`sem menu em ${id}`);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Apagar proposta…' }));
    return trigger;
  }

  it('o menu ⋯ só existe nas linhas fechadas: a aberta não tem a ação', async () => {
    await threeProposals();
    expect(menuOf('P1')).toBeNull();
    expect(menuOf('P2')).not.toBeNull();
    expect(menuOf('P3')).not.toBeNull();
    expect(menuOf('P2')?.getAttribute('aria-label')).toBe(
      'Ações da proposta: Retirada pelo agente',
    );
  });

  it('durante a revisão a ação não existe (a janela mostra os níveis, não a lista)', async () => {
    const h = await threeProposals();
    cleanup();
    renderInEditor(h, <ProposalsWindow onHelp={noop} />);
    expect(menuOf('P2')).not.toBeNull();
    act(() => {
      h.review.open('P1');
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Ações da proposta:/ })).toBeNull();
    expect(screen.queryByText('Apagar proposta…')).toBeNull();
  });

  it('a confirmação é um alertdialog com o título e o aviso; Cancelar não apaga e devolve o foco ao ⋯', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    const trigger = await askToRemove(user, 'P3');

    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const body = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(body?.textContent).toContain('"Já aplicada"');
    expect(body?.textContent).toContain('Isso não pode ser desfeito');
    // A aplicada avisa que o projeto não perde as mudanças já aplicadas.
    expect(body?.textContent).toContain('As mudanças já aplicadas continuam no projeto');

    await user.click(
      within(dialog).getByRole('button', { name: 'Cancelar', hidden: true }),
    );
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(await diskProposal(h.root, 'P3')).toMatchObject({ id: 'P3' });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('a retirada não leva o aviso das mudanças aplicadas', async () => {
    await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.textContent).toContain('"Retirada pelo agente"');
    expect(dialog.textContent).not.toContain('já aplicadas');
  });

  it('Apagar: tira a pasta do disco, a linha some sem aviso "apagada por fora", há um aviso e o foco vai à ação da linha seguinte', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Apagar', hidden: true }),
    );

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.queryByText('Retirada pelo agente')).toBeNull();
    expect(h.root.dirs.get('proposals')?.dirs.has('P2')).toBe(false);
    expect(await h.root.read('proposals/P2/images/nova.webp')).toBeNull();
    expect(h.session.proposals.notices.value).toEqual([]);
    expect(h.ui.toast.value).toBe('Proposta apagada: Retirada pelo agente');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    // Ocupou o lugar dela a P3.
    await waitFor(() => expect(document.activeElement).toBe(actionOf('P3')));
    // A conferência seguinte da pasta também não avisa nada.
    await h.session.proposals.scan();
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  it('apagar a última linha leva o foco à anterior', async () => {
    await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P3');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Apagar', hidden: true }),
    );
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(actionOf('P2')));
  });

  it('apagar a única proposta mostra o estado vazio e o foco fica nele', async () => {
    const only: Proposal = {
      ...richScenario('P1').proposal,
      title: 'Única',
      status: 'withdrawn',
    };
    const h = await openReviewHarness({ proposals: [only] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const user = userEvent.setup();
    await askToRemove(user, 'P1');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Apagar', hidden: true }),
    );
    await screen.findByRole('heading', { name: 'Nenhuma proposta ainda' });
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Como o agente envia propostas' }),
      ),
    );
  });

  it('falha ao apagar: a linha continua, o erro vai ao aviso e o foco volta ao ⋯', async () => {
    const h = await threeProposals();
    vi.spyOn(h.storage, 'removeProposal').mockRejectedValue(new Error('sem permissão'));
    const user = userEvent.setup();
    const trigger = await askToRemove(user, 'P2');
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Apagar', hidden: true }),
    );
    await waitFor(() =>
      expect(h.ui.toast.value).toBe('Não foi possível apagar a proposta.'),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(await diskProposal(h.root, 'P2')).toMatchObject({ id: 'P2' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('se o agente reabriu a proposta por fora, a confirmação recusa e explica', async () => {
    const h = await threeProposals();
    const user = userEvent.setup();
    await askToRemove(user, 'P2');
    // O arquivo volta a estar aberto antes do clique em Apagar.
    writeOutside(h.root, {
      ...richScenario('P2').proposal,
      title: 'Reaberta',
      revision: 3,
    });
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: 'Apagar', hidden: true }),
    );
    await waitFor(() => expect(h.ui.toast.value).toContain('Esta proposta está aberta'));
    expect(await diskProposal(h.root, 'P2')).toMatchObject({ status: 'open' });
  });

  it('projeto somente leitura: o menu fica desabilitado', async () => {
    const h = await threeProposals();
    act(() => {
      const project = h.session.store.project.value;
      if (project) h.session.store.load(project, { readOnly: true });
    });
    expect(menuOf('P2')?.hasAttribute('disabled')).toBe(true);
  });
});
