import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor, selectedThreadId } from '../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { anchorLabel } from '../../src/ui/comments/anchorLabel';
import {
  CommentsHeaderActions,
  CommentsWindow,
} from '../../src/ui/comments/CommentsWindow';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, T2, message, sampleThread } from '../model/threadFixtures';
import { simulateModalFocus, restoreModalFocus } from './modalFocus';
import { createHarness, renderLive, type Harness } from './harness';

// Janela Comentários (etapa Comentários, CM3): tabela, filtros, contagem, Nova conversa, apagar
// (uma e em lote), revisão só leitura.

const OTHER = { kind: 'human', name: 'Paulo Reis', email: 'paulo@exemplo.com' } as const;

// Aberta, aguardando o humano (a última é do agente), de Marina.
const WAITING_HUMAN = sampleThread({
  id: 'ta',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [
    message('a1', T0, HUMAN, 'Falta contraste no botão'),
    message('a2', T1, AGENT, 'Ajustei a cor'),
  ],
});
// Resolvida, só de Marina.
const RESOLVED = sampleThread({
  id: 'tb',
  anchor: { kind: 'container', id: 'I1' },
  resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T2 },
  messages: [message('b1', T0, HUMAN, 'Título está CORRETO')],
});
// Órfã (a marcação não existe), aberta, de Paulo; a última é de pessoa: aguarda o agente.
const ORPHAN = sampleThread({
  id: 'tc',
  anchor: { kind: 'marking', id: 'MX' },
  messages: [message('c1', T0, OTHER, 'Ação perdida')],
});

async function seed(harness: Harness, threads: readonly Thread[]) {
  for (const th of threads) await harness.context.session.threads.create(th);
}

function setup(
  threads: readonly Thread[] = [WAITING_HUMAN, RESOLVED, ORPHAN],
  readOnly = false,
) {
  const harness = createHarness(sampleProject(), readOnly);
  return { harness, ready: seed(harness, threads) };
}

async function mount(
  threads?: readonly Thread[],
  readOnly = false,
): Promise<{ harness: Harness; user: ReturnType<typeof userEvent.setup> }> {
  const { harness, ready } = setup(threads, readOnly);
  await ready;
  renderLive(harness, () => (
    <EditorContext.Provider value={harness.context}>
      <CommentsHeaderActions />
      <CommentsWindow />
    </EditorContext.Provider>
  ));
  return { harness, user: userEvent.setup() };
}

const table = () => screen.getByRole('table', { name: t('comments.table') });
const rowOf = (id: string) =>
  table().querySelector<HTMLElement>(`tr[data-thread="${id}"]`) as HTMLElement;
const ids = () =>
  Array.from(table().querySelectorAll<HTMLElement>('tr[data-thread]')).map(
    (r) => r.dataset.thread,
  );

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  setIdentity('Marina Alves', 'marina@exemplo.com');
  locale.value = 'pt-BR';
  hideToolWindow('details');
});
afterEach(() => {
  cleanup();
  restoreModalFocus();
});

describe.each(['pt-BR', 'en-US'] as const)('Janela Comentários (%s)', (lang) => {
  beforeEach(() => {
    locale.value = lang;
  });

  it('colunas, e por padrão só as abertas', async () => {
    await mount();
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      t('comments.col.by'),
      t('comments.col.anchor'),
      t('comments.col.last'),
      t('comments.col.messages'),
      t('comments.col.status'),
      t('comments.col.when'),
      '',
    ]);
    expect(ids().sort()).toEqual(['ta', 'tc']);
    const row = rowOf('ta');
    expect(within(row).getByText('MA')).toBeTruthy();
    expect(within(row).getByText('Marina Alves')).toBeTruthy();
    expect(within(row).getByText('Ajustei a cor')).toBeTruthy();
    expect(within(row).getByText('2')).toBeTruthy();
    expect(within(row).getByText(t('comments.badge.awaitingHuman'))).toBeTruthy();
    expect(within(rowOf('tc')).getByText(t('comments.badge.awaitingAgent'))).toBeTruthy();
  });

  it('filtro de status: todas, resolvidas, aguardando agente e humano', async () => {
    const { user } = await mount();
    const status = screen.getByLabelText(t('comments.filter.status'));
    await user.selectOptions(status, t('comments.filter.statusAll'));
    expect(ids().sort()).toEqual(['ta', 'tb', 'tc']);
    await user.selectOptions(status, t('comments.filter.statusResolved'));
    expect(ids()).toEqual(['tb']);
    await user.selectOptions(status, t('comments.filter.statusAwaitingAgent'));
    expect(ids()).toEqual(['tc']);
    await user.selectOptions(status, t('comments.filter.statusAwaitingHuman'));
    expect(ids()).toEqual(['ta']);
  });

  it('filtro de usuário pelo e-mail da pessoa e pelo nome do agente', async () => {
    const { user, harness } = await mount();
    const select = screen.getByLabelText(t('comments.filter.user'));
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(options[0]).toBe(t('comments.filter.userAll', { count: 3 }));
    expect(options.some((o) => o?.includes('marina@exemplo.com'))).toBe(true);
    expect(options).toContain(
      t('comments.filter.userAgent', { name: 'Claude Code' }) + ' (1)',
    );
    await user.selectOptions(
      select,
      Array.from(select.querySelectorAll('option')).find((o) =>
        o.textContent?.includes('paulo@exemplo.com'),
      ) as HTMLOptionElement,
    );
    expect(harness.ui.commentsUser.value).toBe('human:paulo@exemplo.com');
    expect(ids()).toEqual(['tc']);
  });

  it('busca no texto sem diferença de caixa nem de acento', async () => {
    const { user } = await mount();
    await user.selectOptions(
      screen.getByLabelText(t('comments.filter.status')),
      t('comments.filter.statusAll'),
    );
    await user.type(screen.getByLabelText(t('comments.filter.text')), 'acao PERDIDA');
    expect(ids()).toEqual(['tc']);
    await user.clear(screen.getByLabelText(t('comments.filter.text')));
    await user.type(screen.getByLabelText(t('comments.filter.text')), 'correto');
    expect(ids()).toEqual(['tb']);
  });

  it('contagem de abertas, aguardando agente e resolvidas', async () => {
    await mount();
    const summary = screen.getByRole('status');
    expect(summary.textContent).toContain(t('comments.count.open', { count: 2 }));
    expect(summary.textContent).toContain(
      t('comments.count.awaitingAgent', { count: 1 }),
    );
    expect(summary.textContent).toContain(t('comments.count.resolvedOne'));
  });

  it('a resolvida tem a âncora riscada; a órfã, em aviso; a não lida, em negrito', async () => {
    const { user, harness } = await mount();
    await user.selectOptions(
      screen.getByLabelText(t('comments.filter.status')),
      t('comments.filter.statusAll'),
    );
    expect(rowOf('tb').dataset.resolved).toBe('');
    expect(rowOf('tc').dataset.orphan).toBe('');
    expect(rowOf('ta').dataset.orphan).toBeUndefined();
    // A última de `ta` é do agente e Marina nunca leu: não lida.
    expect(rowOf('ta').dataset.unread).toBe('');
    // A resolvida de Marina é lida para ela.
    expect(rowOf('tb').dataset.unread).toBeUndefined();
    expect(harness.context.derived.threads.unreadIds.value.has('ta')).toBe(true);
    expect(
      within(rowOf('tc')).getByText(anchorLabel(harness.project(), ORPHAN.anchor)),
    ).toBeTruthy();
  });

  it('escolher a linha seleciona a conversa e o item, e abre os Detalhes', async () => {
    const { user, harness } = await mount();
    const label = anchorLabel(harness.project(), WAITING_HUMAN.anchor);
    await user.click(
      screen.getByRole('button', { name: t('comments.row.open', { anchor: label }) }),
    );
    expect(selectedThreadId(harness.ui)).toBe('ta');
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('Nova conversa com a seleção: abre o rascunho ancorado nela', async () => {
    const { user, harness } = await mount();
    act(() => {
      harness.ui.selection.value = { kind: 'image', id: 'I1' };
    });
    await user.click(screen.getByRole('button', { name: t('comments.new') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'container', id: 'I1' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('Nova conversa sem seleção fica desabilitada, com a dica', async () => {
    await mount();
    const button = screen.getByRole('button', { name: t('comments.new') });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      button.getAttribute('title') ?? button.getAttribute('aria-description') ?? '',
    ).toContain(t('comments.newNoSelection'));
  });

  it('Nova conversa sem identidade ainda abre o rascunho', async () => {
    const { user, harness } = await mount();
    clearIdentity();
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    await user.click(screen.getByRole('button', { name: t('comments.new') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'marking', id: 'M1' });
  });
});

describe('apagar uma conversa', () => {
  it('direto quando todas as mensagens são da pessoa', async () => {
    const mine = sampleThread({
      id: 'td',
      messages: [message('d1', T0, HUMAN, 'só minha')],
    });
    const { user, harness } = await mount([mine]);
    await user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), mine.anchor),
        }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value).toEqual([]);
  });

  it('com mensagem de outro autor, pede confirmação e lista os autores', async () => {
    const { user, harness } = await mount([WAITING_HUMAN]);
    await user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
        }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Claude Code/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: t('comments.delete.confirm') }),
    );
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value).toEqual([]);
  });

  it('Esc e Cancelar devolvem o foco ao ⋯ da linha', async () => {
    simulateModalFocus();
    const { user, harness } = await mount([WAITING_HUMAN]);
    const more = screen.getByRole('button', {
      name: t('comments.row.more', {
        anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
      }),
    });
    for (const close of ['esc', 'cancel'] as const) {
      await user.click(more);
      await user.click(screen.getByRole('menuitem', { name: t('comments.row.delete') }));
      const dialog = screen.getByRole('alertdialog');
      if (close === 'esc') {
        act(() => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        });
      } else
        await user.click(
          within(dialog).getByRole('button', { name: t('common.cancel') }),
        );
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(more);
    }
  });

  it('o item Apagar fica desabilitado sem identidade e com o projeto somente leitura', async () => {
    const { user, harness } = await mount([WAITING_HUMAN]);
    clearIdentity();
    const more = () =>
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(harness.project(), WAITING_HUMAN.anchor),
        }),
      });
    await user.click(more());
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.row.delete'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    const ro = await mount([WAITING_HUMAN], true);
    setIdentity('Marina Alves', 'marina@exemplo.com');
    await ro.user.click(
      screen.getByRole('button', {
        name: t('comments.row.more', {
          anchor: anchorLabel(ro.harness.project(), WAITING_HUMAN.anchor),
        }),
      }),
    );
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.row.delete'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe('apagar conversas em lote', () => {
  const OLD_RESOLVED = sampleThread({
    id: 'te',
    resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    messages: [message('e1', '2026-01-01T10:00:00.000Z', HUMAN, 'antiga')],
  });
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    await user.click(screen.getByRole('menuitem', { name: t('comments.bulk.open') }));
    return screen.getByRole('alertdialog');
  };

  it('só as resolvidas por padrão, com contagem e autores; a data restringe', async () => {
    const { user, harness } = await mount([
      WAITING_HUMAN,
      RESOLVED,
      OLD_RESOLVED,
      ORPHAN,
    ]);
    const dialog = await openMenu(user);
    const only = within(dialog).getByLabelText(
      t('comments.bulk.onlyResolved'),
    ) as HTMLInputElement;
    expect(only.checked).toBe(true);
    expect(dialog.textContent).toContain(t('comments.bulk.threads', { count: 2 }));
    expect(dialog.textContent).toContain('Marina Alves');
    await user.type(
      within(dialog).getByLabelText(t('comments.bulk.before')),
      '2026-06-01',
    );
    expect(dialog.textContent).toContain(t('comments.bulk.threadsOne'));
    expect(dialog.textContent).toContain('1');
    await user.click(only);
    // Sem "só resolvidas", com a data: tudo cuja última mensagem é anterior a 2026-06-01.
    expect(dialog.textContent).toContain(t('comments.bulk.threadsOne'));
    await user.click(
      within(dialog).getByRole('button', { name: t('comments.delete.confirm') }),
    );
    await act(async () => {
      await harness.context.session.threads.settled();
    });
    expect(harness.context.session.threads.list.value.map((th) => th.id).sort()).toEqual([
      'ta',
      'tb',
      'tc',
    ]);
  });

  it('zero candidatas desabilita o Apagar', async () => {
    const { user } = await mount([WAITING_HUMAN]);
    const dialog = await openMenu(user);
    expect(dialog.textContent).toContain(t('comments.bulk.none'));
    expect(
      (
        within(dialog).getByRole('button', {
          name: t('comments.delete.confirm'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('Esc e Cancelar devolvem o foco ao ⋯ da janela', async () => {
    simulateModalFocus();
    const { user } = await mount([RESOLVED]);
    const more = screen.getByRole('button', { name: t('comments.windowMore') });
    for (const close of ['esc', 'cancel'] as const) {
      const dialog = await openMenu(user);
      if (close === 'esc') {
        act(() => {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        });
      } else
        await user.click(
          within(dialog).getByRole('button', { name: t('common.cancel') }),
        );
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(more);
    }
  });

  it('o item fica desabilitado sem identidade e com o projeto somente leitura', async () => {
    const { user } = await mount([RESOLVED]);
    clearIdentity();
    await user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.bulk.open'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();
    setIdentity('Marina Alves', 'marina@exemplo.com');
    const ro = await mount([RESOLVED], true);
    await ro.user.click(screen.getByRole('button', { name: t('comments.windowMore') }));
    expect(
      (
        screen.getByRole('menuitem', {
          name: t('comments.bulk.open'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe('revisão de proposta (decisão 26)', () => {
  it('a janela fica só para leitura, com o aviso, sem Nova conversa nem Apagar', async () => {
    const { harness, user } = await mount([WAITING_HUMAN]);
    act(() => {
      harness.store.setReviewing(true);
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    expect(screen.getByText(t('comments.reviewNotice'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('comments.new') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('comments.windowMore') })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: new RegExp(t('comments.row.more', { anchor: '' })),
      }),
    ).toBeNull();
    expect(ids()).toEqual(['ta']);
    // Escolher a linha na revisão não muda a seleção.
    await user.click(rowOf('ta'));
    expect(selectedThreadId(harness.ui)).toBeNull();
  });
});
