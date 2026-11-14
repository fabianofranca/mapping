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

// pt-BR kept: shared fixture data (the email of HUMAN in tests/model/threadFixtures)
beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
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
  it('each message shows initials, name, agent badge and the text as markdown', () => {
    view(['**strong** and `code`', 'reply']);
    expect(screen.getByText('MA')).toBeTruthy();
    expect(screen.getByText('AG')).toBeTruthy();
    expect(screen.getByText('strong').tagName).toBe('STRONG');
    expect(screen.getAllByText(t('thread.agent'))).toHaveLength(1);
    expect(document.querySelectorAll('time')).toHaveLength(2);
  });

  it('the mapping:// link shows as the label text, without becoming a link', () => {
    view(['see [the button](mapping://project/M1)']);
    expect(screen.getByText(/the button/)).toBeTruthy();
    expect(document.querySelector('.markdown a')).toBeNull();
  });

  it('the state badge carries the glyph before the text, hidden from screen readers', () => {
    view(['hi', 'ok']);
    const badge = document.querySelector('.thread-state');
    const svg = badge?.firstElementChild;
    expect(svg?.tagName.toLowerCase()).toBe('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(AWAITING_HUMAN_PATHS[0]);
    expect(badge?.textContent).toBe(t('thread.state.awaitingHuman'));
  });

  it('each state badge uses the state class (the pin color)', () => {
    view(['hi', 'ok']);
    expect(
      document.querySelector('.thread-state')?.classList.contains('thread-state-human'),
    ).toBe(true);
  });

  it('a message with a proposal renders normally', () => {
    view(['message text'], 'p-1');
    expect(screen.getByText('message text')).toBeTruthy();
  });
});
