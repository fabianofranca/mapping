import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl, type CitationTarget, type Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { selectedThreadId } from '../../src/store/threadUi';
import { CommentsWindow } from '../../src/ui/comments/CommentsWindow';
import { ThreadView } from '../../src/ui/comments/ThreadView';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// "Citada em" (decisão 33) e o filtro "só as que citam a seleção" (decisão 34), pela interface.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

const project = sampleProject();

function urlOf(threads: readonly Thread[], target: CitationTarget): string {
  const url = citationUrl('projeto', project, threads, target);
  if (url === null) throw new Error('alvo sem URL');
  return url;
}

const ALPHA: Thread = sampleThread({
  id: 'ta1',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('a1', T0, HUMAN, 'Assunto alfa')],
});

function citing(id: string, text: string, target: CitationTarget): Thread {
  return sampleThread({
    id,
    anchor: { kind: 'marking', id: 'M4' },
    messages: [message(`${id}m`, T1, HUMAN, `${text} [x](${urlOf([ALPHA], target)})`)],
  });
}

async function seed(h: Harness, threads: readonly Thread[]) {
  for (const th of threads) await h.context.session.threads.create(th);
}

describe('Citada em', () => {
  it('lista um chip por conversa que cita esta; clicar leva à conversa', async () => {
    const h = createHarness(sampleProject());
    const beta = citing('tb1', 'Beta cita', { kind: 'thread', id: 'ta1' });
    const gamma = citing('tc1', 'Gama cita', { kind: 'thread', id: 'ta1' });
    await seed(h, [ALPHA, beta, gamma]);
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={ALPHA} />
      </EditorContext.Provider>,
    );
    const line = screen.getByText(t('thread.citedIn')).closest('[data-cited-in]');
    expect(line).toBeTruthy();
    const chips = within(line as HTMLElement).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Beta cita x', 'Gama cita x']);
    await userEvent.click(
      within(line as HTMLElement).getByRole('button', {
        name: t('citation.chipLabel', { name: 'Beta cita x' }),
      }),
    );
    expect(selectedThreadId(h.ui)).toBe('tb1');
  });

  it('conversa que ninguém cita não mostra a linha', async () => {
    const h = createHarness(sampleProject());
    const beta = citing('tb1', 'Beta cita', { kind: 'thread', id: 'ta1' });
    await seed(h, [ALPHA, beta]);
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={beta} />
      </EditorContext.Provider>,
    );
    expect(screen.queryByText(t('thread.citedIn'))).toBeNull();
  });
});

describe('filtro "Só as que citam a seleção"', () => {
  const onM1: Thread = sampleThread({
    id: 'tm1',
    anchor: { kind: 'marking', id: 'M1' },
    messages: [message('m1', T0, HUMAN, 'Na M1')],
  });

  async function mount() {
    const h = createHarness(sampleProject());
    const citesField = citing('tf1', 'Cita par', {
      kind: 'entry',
      annotationId: 'A1',
      entryId: 'E1',
    });
    const citesM2 = citing('tf2', 'Cita M2', { kind: 'marking', id: 'M2' });
    await seed(h, [ALPHA, onM1, citesField, citesM2]);
    renderLive(h, () => <CommentsWindow />);
    return { h, user: userEvent.setup() };
  }

  const toggle = () =>
    screen.getByRole('checkbox', { name: t('comments.filter.citesSelection') });
  const ids = () =>
    Array.from(document.querySelectorAll<HTMLElement>('tr[data-thread]'))
      .map((r) => r.dataset.thread)
      .sort();

  it('desabilitado sem item selecionado, com a dica', async () => {
    await mount();
    const box = toggle() as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(ids()).toHaveLength(4);
  });

  it('com o item selecionado, mostra as ancoradas nele e as que citam ele, as anotações ou os campos', async () => {
    const { h, user } = await mount();
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    const box = toggle() as HTMLInputElement;
    expect(box.disabled).toBe(false);
    await user.click(box);
    expect(h.ui.commentsCiteSelection.value).toBe(true);
    expect(ids()).toEqual(['tf1', 'tm1']);
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    expect(ids()).toEqual(['ta1', 'tf2']);
    await user.click(toggle());
    expect(ids()).toHaveLength(4);
  });
});
