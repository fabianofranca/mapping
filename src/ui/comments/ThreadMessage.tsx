import { t } from '../../i18n';
import { initials, userLabel, type ThreadMessage as Message } from '../../model';
import { Markdown } from '../markdown/Markdown';
import { CitationChip } from './CitationChip';
import { ProposalCard } from './ProposalCard';
import { relativeTime } from './relativeTime';

const renderCitation = (href: string, label: string) => (
  <CitationChip url={href} label={label} />
);

/** A message of the thread: initials, name, agent badge, relative time and the text in markdown. */
export function ThreadMessage({ message }: { readonly message: Message }) {
  const agent = message.author.kind === 'agent';
  return (
    <li class="thread-message">
      <span class="thread-avatar" aria-hidden="true">
        {initials(message.author)}
      </span>
      <div class="thread-message-body">
        <div class="thread-message-head">
          <span class="thread-message-author">{userLabel(message.author)}</span>
          {agent && <span class="thread-message-agent">{t('thread.agent')}</span>}
          <time class="thread-message-time" dateTime={message.at} title={message.at}>
            {relativeTime(message.at)}
          </time>
        </div>
        {message.proposal !== null && <ProposalCard proposalId={message.proposal} />}
        <Markdown text={message.text} lineBreaks renderMapping={renderCitation} />
      </div>
    </li>
  );
}
