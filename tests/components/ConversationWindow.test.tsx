import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { ConversationWindow } from '../../src/ui/comments/ConversationWindow';

// Conversation window (stage #1881, CV1): for now it only shows the empty state.

afterEach(() => {
  cleanup();
  locale.value = 'en-US';
});

describe('ConversationWindow', () => {
  it('shows the empty state text in en-US', () => {
    locale.value = 'en-US';
    render(<ConversationWindow />);
    expect(
      screen.getByText(
        'No conversation open. Choose one in Details, in Comments or on a pin.',
      ),
    ).toBeTruthy();
  });

  it('follows the language', () => {
    locale.value = 'pt-BR';
    render(<ConversationWindow />);
    expect(screen.getByText(t('conversation.empty'))).toBeTruthy();
    expect(t('conversation.title')).toBe('Conversa');
  });
});
