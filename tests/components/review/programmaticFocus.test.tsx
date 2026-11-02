import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../../src/store/toolWindows';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import { ToolStrip } from '../../../src/ui/ToolStrip';
import { ToolWindow } from '../../../src/ui/ToolWindow';
import { closeToolWindow } from '../../../src/ui/toolWindowLayout';
import { useReviewCommands } from '../../../src/ui/review/useReviewCommands';
import { useShowProblem } from '../../../src/ui/review/useReview';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, type ReviewHarness } from './reviewHarness';

// Etapa #323 (FC1): quem abre a revisão por código (botão da lista, aviso, barra de
// status, "mostrar o problema") guarda o foco de origem, como a faixa e o atalho. Fechar
// Detalhes ou Propostas devolve o foco a quem abriu → botão da faixa, nunca ao body.

function Shell({ extra }: { readonly extra: preact.ComponentChildren }) {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  return (
    <>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas">
        {extra}
      </main>
      {windows.map((id) => (
        <ToolWindow key={id} id={id}>
          <button type="button">controle {id}</button>
        </ToolWindow>
      ))}
      <ToolStrip side="right" />
    </>
  );
}

function Openers() {
  const { openReview } = useReviewCommands();
  const showProblem = useShowProblem();
  return (
    <>
      <button type="button" onClick={() => openReview('P1')}>
        abrir revisão
      </button>
      <button type="button" onClick={showProblem}>
        mostrar problema
      </button>
    </>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const active = () => document.activeElement;
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `controle ${id}` });
const opener = (name: string) => screen.getByRole('button', { name });

async function mount(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({ proposals: [proposal] });
  render(
    <EditorContext.Provider value={h.context}>
      <Shell extra={<Openers />} />
    </EditorContext.Provider>,
  );
  return h;
}

/** Clica no botão (foco nele), roda `act` e redesenha a Shell com as janelas abertas. */
function press(h: ReviewHarness, name: string) {
  const button = opener(name);
  button.focus();
  button.click();
  return button;
}

function remount(h: ReviewHarness, extra = <Openers />) {
  cleanup();
  render(
    <EditorContext.Provider value={h.context}>
      <Shell extra={extra} />
    </EditorContext.Provider>,
  );
}

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('revisão aberta por código devolve o foco ao fechar', () => {
  it.each(['details', 'proposals'] as const)(
    'abrir a revisão pelo botão, focar em %s e fechar → botão que abriu',
    async (id) => {
      const h = await mount();
      const button = press(h, 'abrir revisão');
      remount(h);
      const again = opener('abrir revisão');
      expect(again).not.toBe(button);
      // A origem guardada é o botão da primeira montagem; ele saiu do DOM, então o
      // retorno de reserva é o botão da faixa.
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(stripButton(id));
    },
  );

  it('com o botão ainda no DOM, o foco volta a ele', async () => {
    const h = await mount();
    const button = press(h, 'abrir revisão');
    await settle();
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(active()).toBe(button);
    control('proposals').focus();
    closeToolWindow('proposals');
    await settle();
    expect(active()).toBe(button);
  });

  it('useShowProblem: Propostas e Detalhes devolvem o foco a quem abriu', async () => {
    const h = await mount();
    h.review.open('P1');
    const first = h.review.derived.proposal.peek()?.changes[0];
    if (!first) throw new Error('sem mudança');
    vi.spyOn(h.review.derived.invalid, 'peek').mockReturnValue({
      changeIds: new Set([first.id]),
      related: new Set<string>(),
    });
    for (const id of ['details', 'proposals'] as const) {
      for (const other of TOOL_WINDOWS) hideToolWindow(other);
      remount(h);
      const button = opener('mostrar problema');
      button.focus();
      button.click();
      await settle();
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(button);
    }
  });

  it('abrir a revisão a partir da Lista troca a Lista por Propostas e o foco vai à aba ativa', async () => {
    const h = await mount();
    showToolWindow('list');
    remount(h);
    // Foco dentro da Lista no momento da chamada (o comando vem do conteúdo dela).
    control('list').focus();
    opener('abrir revisão').click();
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()?.getAttribute('role')).toBe('tab');
    expect(active()?.getAttribute('aria-selected')).toBe('true');
  });
});
