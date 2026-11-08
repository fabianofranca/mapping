import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { ThreadView } from '../../src/ui/comments/ThreadView';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { AWAITING_HUMAN_PATHS } from '../../src/utils/threadStateGlyph';
import { createHarness } from './harness';

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

function view(texts: readonly string[], proposal: string | null = null) {
  const harness = createHarness(sampleProject());
  const thread = sampleThread({
    id: 'v1',
    messages: texts.map((text, i) => ({
      ...message(
        `m${i}`,
        `2026-09-01T1${i}:00:00.000Z`,
        i % 2 === 0 ? HUMAN : AGENT,
        text,
      ),
      proposal: i === 0 ? proposal : null,
    })),
  });
  render(
    <EditorContext.Provider value={harness.context}>
      <ThreadView thread={thread} />
    </EditorContext.Provider>,
  );
}

describe('ThreadView', () => {
  it('cada mensagem mostra iniciais, nome, selo de agente e o texto em markdown', () => {
    view(['**forte** e `código`', 'resposta']);
    expect(screen.getByText('MA')).toBeTruthy();
    expect(screen.getByText('AG')).toBeTruthy();
    expect(screen.getByText('forte').tagName).toBe('STRONG');
    expect(screen.getAllByText(t('thread.agent'))).toHaveLength(1);
    expect(document.querySelectorAll('time')).toHaveLength(2);
  });

  it('o link mapping:// aparece como o texto do rótulo, sem virar link', () => {
    view(['veja [o botão](mapping://project/M1)']);
    expect(screen.getByText(/o botão/)).toBeTruthy();
    expect(document.querySelector('.markdown a')).toBeNull();
  });

  it('o selo de estado leva o glifo antes do texto, escondido dos leitores de tela', () => {
    view(['oi', 'ok']);
    const badge = document.querySelector('.thread-state');
    const svg = badge?.firstElementChild;
    expect(svg?.tagName.toLowerCase()).toBe('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(AWAITING_HUMAN_PATHS[0]);
    expect(badge?.textContent).toBe(t('thread.state.awaitingHuman'));
  });

  it('mensagem com proposta é renderizada normalmente', () => {
    view(['texto da mensagem'], 'p-1');
    expect(screen.getByText('texto da mensagem')).toBeTruthy();
  });
});
