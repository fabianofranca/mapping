import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanel } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { lastReadAt } from '../../src/store/threadReads';
import { selectThread, startComposing } from '../../src/store/threadUi';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { createHarness, type Harness } from './harness';

// Seção Conversas dos Detalhes (etapa Comentários, fase CM3, decisão 18).

// O relógio da bancada (`now` da sessão) é 2026-10-02: as mensagens de exemplo ficam antes dele,
// para que a resposta da pessoa seja a última na ordem por `at`.
const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-01T11:00:00.000Z';
import { relativeTime } from '../../src/ui/comments/relativeTime';

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  locale.value = 'pt-BR';
  clearIdentity();
});

const agentThread = (id: string, overrides: Partial<Thread> = {}): Thread =>
  sampleThread({
    id,
    messages: [message(`${id}a`, T0, AGENT, `pergunta do agente ${id}`)],
    ...overrides,
  });

const humanThread = (id: string, overrides: Partial<Thread> = {}): Thread =>
  sampleThread({
    id,
    messages: [message(`${id}a`, T0, HUMAN, `minha nota ${id}`)],
    ...overrides,
  });

async function setup(threads: readonly Thread[] = [], readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  for (const thread of threads) {
    await harness.context.session.threads.create(thread);
  }
  return harness;
}

function renderMarking(harness: Harness, onOpenSettings = vi.fn()) {
  const project = harness.project();
  const marking = project.markings.find((m) => m.id === 'M1')!;
  const image = project.containers.find((c) => c.id === 'I1')!;
  render(
    <EditorContext.Provider value={harness.context}>
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={vi.fn()}
        onGoToAnnotation={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    </EditorContext.Provider>,
  );
  return onOpenSettings;
}

const sectionEl = () => screen.getByRole('region', { name: t('thread.section') });
const composer = () => screen.getByLabelText(/Comentar como|Responder como/);

describe('Conversas › estado A (nenhuma conversa)', () => {
  it('mostra o compositor "Comentar como <nome>" com Enviar desabilitado até haver texto', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = screen.getByLabelText(t('thread.composeAs', { name: 'Marina Alves' }));
    const send = within(sectionEl()).getByRole<HTMLButtonElement>('button', {
      name: t('thread.send'),
    });
    expect(send.disabled).toBe(true);
    await userEvent.type(field, '   ');
    expect(send.disabled).toBe(true);
    await userEvent.type(field, 'oi');
    expect(send.disabled).toBe(false);
  });

  it('Ctrl+Enter envia, abre a conversa e a mostra; Enter só quebra a linha', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = composer() as HTMLTextAreaElement;
    await userEvent.type(field, 'linha 1{Enter}linha 2');
    expect(field.value).toBe('linha 1\nlinha 2');
    expect(harness.context.session.threads.list.value).toHaveLength(0);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    const thread = harness.context.session.threads.list.value[0]!;
    expect(thread.messages[0]!.text).toBe('linha 1\nlinha 2');
    expect(thread.anchor).toEqual({ kind: 'marking', id: 'M1' });
    // A nova conversa aparece, escolhida, com o compositor de resposta e a mensagem em <br/>.
    await screen.findByLabelText(t('thread.replyAs', { name: 'Marina Alves' }));
    expect(sectionEl().querySelectorAll('.markdown br')).toHaveLength(1);
  });

  it('o botão Enviar também envia; erro do servidor fica visível e mantém o texto', async () => {
    const harness = await setup();
    renderMarking(harness);
    const field = composer() as HTMLTextAreaElement;
    await userEvent.type(field, 'nota');
    vi.spyOn(harness.context.session.threadActions, 'open').mockResolvedValue({
      ok: false,
      error: 'read-only',
    });
    await userEvent.click(screen.getByRole('button', { name: t('thread.send') }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(t('thread.error.read-only'));
    expect(field.value).toBe('nota');
  });
});

describe('Conversas › estado B (aguardando humano, aberta pelo agente)', () => {
  it('mostra a conversa direto, com selo, nome, selo agente e a resposta', async () => {
    const harness = await setup([agentThread('t1')]);
    renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText(t('thread.state.awaitingHuman'))).toBeTruthy();
    expect(section.getByText('Claude Code')).toBeTruthy();
    expect(section.getByText(t('thread.agent'))).toBeTruthy();
    expect(section.getByText('pergunta do agente t1')).toBeTruthy();
    expect(section.getByRole('button', { name: t('thread.resolve') })).toBeTruthy();
    expect(section.getByRole('button', { name: t('thread.new') })).toBeTruthy();
    expect(section.queryByRole('list', { name: t('thread.list') })).toBeNull();
    await userEvent.type(
      screen.getByLabelText(t('thread.replyAs', { name: 'Marina Alves' })),
      'respondo',
    );
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(harness.context.session.threads.get('t1')?.messages).toHaveLength(2),
    );
    // Depois da resposta a vez é do agente.
    await screen.findByText(t('thread.state.awaitingAgent'));
  });

  it('em en-US os textos vêm em inglês', async () => {
    locale.value = 'en-US';
    const harness = await setup([agentThread('t1')]);
    renderMarking(harness);
    expect(screen.getByText('Awaiting human')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
    expect(screen.getByLabelText('Reply as Marina Alves')).toBeTruthy();
  });
});

describe('Conversas › resolver e reabrir (estado C)', () => {
  it('Resolver mantém a conversa à vista como resolvida; Reabrir a devolve', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.resolve') }));
    await screen.findByText(t('thread.state.resolved'));
    expect(harness.context.session.threads.get('t1')?.resolved).not.toBeNull();
    // Resolvida: sem compositor de resposta, com "Resolvida por".
    expect(screen.queryByLabelText(/Responder como/)).toBeNull();
    expect(sectionEl().textContent).toContain('Marina Alves');
    await userEvent.click(screen.getByRole('button', { name: t('thread.reopen') }));
    await screen.findByText(t('thread.state.awaitingAgent'));
    expect(harness.context.session.threads.get('t1')?.resolved).toBeNull();
  });

  it('a resolvida só aparece quando é a selecionada', async () => {
    const resolved = humanThread('r1', {
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    });
    const harness = await setup([resolved]);
    renderMarking(harness);
    // Nada aberto: o compositor do estado A, sem a conversa resolvida.
    expect(screen.queryByText('minha nota r1')).toBeNull();
    composer();
    selectThread(harness.ui, harness.project(), resolved);
    await screen.findByText('minha nota r1');
    expect(screen.getByText(t('thread.state.resolved'))).toBeTruthy();
    expect(
      screen.getByText(
        t('thread.resolvedBy', { name: 'Marina Alves', date: relativeTime(T1) }),
      ),
    ).toBeTruthy();
  });
});

describe('Conversas › estado D (sem identidade)', () => {
  it('troca o compositor pelo aviso e leva às Configurações', async () => {
    clearIdentity();
    const harness = await setup([agentThread('t1')]);
    const onOpenSettings = renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText('pergunta do agente t1')).toBeTruthy();
    expect(section.getByText(t('thread.noIdentity'))).toBeTruthy();
    expect(section.queryByLabelText(/Responder como/)).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.new') })).toBeNull();
    await userEvent.click(
      section.getByRole('button', { name: t('thread.openSettings') }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('Conversas › lista e Nova', () => {
  it('a lista só aparece com mais de uma aberta; escolher uma linha mostra a conversa', async () => {
    const harness = await setup([agentThread('t1'), humanThread('t2')]);
    renderMarking(harness);
    const list = within(sectionEl()).getByRole('list', { name: t('thread.list') });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('pergunta do agente t1')).toBeTruthy();
    expect(within(list).getAllByText(t('thread.messagesOne'))).toHaveLength(2);
    // Nenhuma escolhida: só a lista.
    expect(sectionEl().querySelector('.thread-view')).toBeNull();
    await userEvent.click(within(list).getByText('minha nota t2'));
    await waitFor(() => expect(sectionEl().querySelector('.thread-view')).not.toBeNull());
    expect(within(sectionEl()).getAllByText('minha nota t2').length).toBeGreaterThan(1);
  });

  it('Nova abre um compositor de conversa nova e enviar a escolhe', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.new') }));
    const field = (await screen.findByLabelText(
      t('thread.composeAs', { name: 'Marina Alves' }),
    )) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(field);
    await userEvent.type(field, 'outro assunto');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(2),
    );
    const list = await screen.findByRole('list', { name: t('thread.list') });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(harness.ui.composing.value).toBeNull();
  });

  it('o rascunho sobrevive à troca de seleção e volta', async () => {
    const harness = await setup();
    renderMarking(harness);
    await userEvent.type(composer(), 'rascunho');
    cleanup();
    renderMarking(harness);
    expect((composer() as HTMLTextAreaElement).value).toBe('rascunho');
  });
});

describe('Conversas › ancoradas em partes do item', () => {
  it('a conversa de uma anotação aparece na seção da marcação com "em <onde>"', async () => {
    const thread = humanThread('p1', { anchor: { kind: 'annotation', id: 'A1' } });
    const harness = await setup([thread]);
    renderMarking(harness);
    expect(
      within(sectionEl()).getByText(t('thread.in', { where: 'Amassado' })),
    ).toBeTruthy();
  });

  it('a conversa de um par aparece com "em Anotação › chave" na lista', async () => {
    const entry = humanThread('p2', {
      anchor: { kind: 'entry', annotationId: 'A1', entryId: 'E1' },
    });
    const harness = await setup([entry, humanThread('p3')]);
    renderMarking(harness);
    expect(
      within(sectionEl()).getByText(t('thread.in', { where: 'Amassado › tipo' })),
    ).toBeTruthy();
  });
});

describe('Conversas › lida e não lida', () => {
  it('abrir a conversa grava o lastReadAt; a linha não lida fica em negrito', async () => {
    const harness = await setup([agentThread('u1'), agentThread('u2')]);
    renderMarking(harness);
    const rows = () => sectionEl().querySelectorAll('.thread-row');
    expect(rows()).toHaveLength(2);
    expect(sectionEl().querySelectorAll('.thread-row-unread')).toHaveLength(2);
    await userEvent.click(within(sectionEl()).getByText('pergunta do agente u1'));
    await waitFor(() => expect(lastReadAt('harness', 'u1')).toBe(T0));
    expect(lastReadAt('harness', 'u2')).toBeNull();
    await waitFor(() =>
      expect(sectionEl().querySelectorAll('.thread-row-unread')).toHaveLength(1),
    );
  });
});

describe('Conversas › revisão e somente leitura', () => {
  it('na revisão de proposta a seção some', async () => {
    const harness = await setup([humanThread('t1')]);
    harness.store.setReviewing(true);
    renderMarking(harness);
    expect(screen.queryByRole('region', { name: t('thread.section') })).toBeNull();
  });

  it('somente leitura: lê a conversa, sem compositor, Resolver, Nova nem Apagar', async () => {
    const harness = await setup([humanThread('t1')], true);
    renderMarking(harness);
    const section = within(sectionEl());
    expect(section.getByText('minha nota t1')).toBeTruthy();
    expect(section.queryByLabelText(/Responder como/)).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.resolve') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.new') })).toBeNull();
    expect(section.queryByRole('button', { name: t('thread.menu') })).toBeNull();
  });
});

describe('Conversas › menu Apagar', () => {
  it('apaga direto a conversa que é só da própria pessoa', async () => {
    const harness = await setup([humanThread('t1')]);
    renderMarking(harness);
    await userEvent.click(screen.getByRole('button', { name: t('thread.menu') }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('thread.delete') }),
    );
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(0),
    );
  });
});

describe('Conversas › outros painéis', () => {
  it('a seta e o container também têm a seção', async () => {
    const harness = await setup();
    const project = harness.project();
    harness.actions.addArrow('M1', 'M4');
    const arrow = harness.project().arrows[0]!;
    render(
      <EditorContext.Provider value={harness.context}>
        <ArrowPanel
          project={harness.project()}
          arrow={arrow}
          readOnly={false}
          onDelete={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
        <SelectionPanel
          image={project.containers[0]!}
          project={project}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={vi.fn()}
          onDelete={vi.fn()}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getAllByRole('region', { name: t('thread.section') })).toHaveLength(2);
  });
});

describe('Conversas › sem item (EditorPanel)', () => {
  const dialogs = () => ({ show: vi.fn() }) as unknown as EditorDialogs;
  const renderPanel = (harness: Harness, d = dialogs()) =>
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorPanel
          busy={false}
          dialogs={d}
          onReplace={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
      </EditorContext.Provider>,
    );

  it('a conversa de camada abre sozinha, no lugar do painel de seleção', async () => {
    const thread = humanThread('c1', { anchor: { kind: 'layer', id: 'L1' } });
    const harness = await setup([thread]);
    selectThread(harness.ui, harness.project(), thread);
    renderPanel(harness);
    expect(
      screen.getByRole('heading', {
        name: t('thread.anchor.layer', { name: 'Lataria' }),
      }),
    ).toBeTruthy();
    expect(screen.getByText('minha nota c1')).toBeTruthy();
    expect(screen.queryByText(t('panel.nothingSelected'))).toBeNull();
  });

  it('o ponto solto grava o rascunho e abre a conversa nova', async () => {
    const harness = await setup();
    startComposing(harness.ui, harness.project(), {
      kind: 'point',
      containerId: null,
      x: 10,
      y: 20,
    });
    renderPanel(harness);
    expect(
      screen.getByRole('heading', {
        name: t('thread.anchor.point', { where: t('canvas.name') }),
      }),
    ).toBeTruthy();
    await userEvent.type(composer(), 'aqui');
    fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    await screen.findByText('aqui');
  });

  it('a órfã mostra o que foi apagado e o botão do aviso abre as Configurações', async () => {
    clearIdentity();
    const orphan = humanThread('o1', { anchor: { kind: 'marking', id: 'GONE' } });
    const harness = await setup([orphan]);
    selectThread(harness.ui, harness.project(), orphan);
    const d = dialogs();
    renderPanel(harness, d);
    expect(
      screen.getByRole('heading', { name: t('thread.anchor.missing.marking') }),
    ).toBeTruthy();
    expect(screen.getByText('minha nota o1')).toBeTruthy();
    expect(screen.queryByLabelText(/Responder como/)).toBeNull();
  });
});
