import { t } from '../../i18n';

// Conversation window (stage #1881, CV1): the body of the tool window stacked under Details.
// For now it only shows the empty state; the conversation itself arrives in the next phases.

export function ConversationWindow() {
  return (
    <p class="conversation-empty muted" role="status">
      {t('conversation.empty')}
    </p>
  );
}
