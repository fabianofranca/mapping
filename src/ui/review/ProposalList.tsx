import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { ProposalRow as ProposalRowData } from '../../store/derived';
import { matchesSearch } from '../../utils/search';
import { Button, Segmented, TextField } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Notice } from '../Notice';
import { ProposalRow } from './ProposalRow';
import { useReviewCommands } from './useReviewCommands';

// Janela Propostas fora do modo revisão (HANDOFF-PROPOSALS 5.1): propostas abertas e
// fechadas, com busca por título, origem e autor, a contagem de aceitas aguardando
// aplicação em cada linha e o estado vazio. Os dados vêm de `review.derived.rows`.

type Scope = 'all' | 'open' | 'closed';

interface ProposalListProps {
  /** Abre a Ajuda na seção das propostas ("Como o agente envia propostas"). */
  readonly onHelp: () => void;
  /** "Verificar a pasta agora". */
  readonly onScan: () => void;
}

/** Estado vazio: como as propostas chegam e onde elas valem. */
export function ProposalsEmpty({ onHelp, onScan }: ProposalListProps) {
  return (
    <div class="proposals-empty">
      <span class="proposals-empty-icon" aria-hidden="true">
        <Icon name="proposal" />
      </span>
      <h3>{t('proposals.emptyTitle')}</h3>
      <p>{t('proposals.emptyText')}</p>
      <div class="proposals-empty-actions">
        <Button onClick={onHelp}>
          <Icon name="help" />
          {t('proposals.howAgentSends')}
        </Button>
        <Button variant="ghost" onClick={onScan}>
          <Icon name="refresh" />
          {t('proposals.scan')}
        </Button>
      </div>
      <p class="proposals-empty-note">{t('proposals.emptyNote')}</p>
    </div>
  );
}

const isOpen = (row: ProposalRowData) => row.proposal.status === 'open';

export function ProposalList({ onHelp, onScan }: ProposalListProps) {
  const { review, session } = useEditor();
  const { openReview } = useReviewCommands();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const rows = review.derived.rows.value;
  const problems = session.proposals.problems.value;

  if (rows.length === 0 && problems.length === 0) {
    return <ProposalsEmpty onHelp={onHelp} onScan={onScan} />;
  }

  const open = rows.filter(isOpen);
  const closed = rows.filter((r) => !isOpen(r));
  const matches = (row: ProposalRowData) =>
    matchesSearch(
      [row.proposal.title, row.proposal.origin ?? '', row.proposal.author ?? ''].join(
        ' ',
      ),
      query,
    );
  const shownOpen = scope === 'closed' ? [] : open.filter(matches);
  const shownClosed = scope === 'open' ? [] : closed.filter(matches);
  // "Nova" só numa linha por janela: a mais recente que chegou e ninguém abriu.
  const newId = rows.find((r) => r.fresh)?.proposal.id ?? null;
  const now = new Date();

  // Revisar, Continuar e Ver abrem a revisão (a retirada só explica que não há o que rever).
  const onAction = (row: ProposalRowData) => {
    openReview(row.proposal.id);
  };

  const group = (label: string, list: readonly ProposalRowData[]) =>
    list.length > 0 && (
      <>
        <div class="review-group" role="presentation">
          <b>{label}</b>
          <span>{list.length}</span>
        </div>
        {list.map((row) => (
          <ProposalRow
            key={row.proposal.id}
            row={row}
            showNew={row.proposal.id === newId}
            now={now}
            onAction={onAction}
          />
        ))}
      </>
    );

  return (
    <div class="proposal-list">
      <div class="review-filters" role="group" aria-label={t('proposals.filters')}>
        <Segmented
          label={t('proposals.scope')}
          value={scope}
          onSelect={setScope}
          items={[
            { id: 'all', label: t('proposals.scopeAll', { count: rows.length }) },
            { id: 'open', label: t('proposals.scopeOpen', { count: open.length }) },
            { id: 'closed', label: t('proposals.scopeClosed', { count: closed.length }) },
          ]}
        />
        <span class="review-search">
          <TextField
            type="search"
            size="sm"
            value={query}
            placeholder={t('proposals.searchPlaceholder')}
            aria-label={t('proposals.search')}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </span>
      </div>
      <div role="list" aria-label={t('proposals.title')} class="proposal-rows">
        {group(t('proposals.groupOpen'), shownOpen)}
        {group(t('proposals.groupClosed'), shownClosed)}
        {shownOpen.length + shownClosed.length === 0 && rows.length > 0 && (
          <p class="muted review-none">{t('proposals.noMatch')}</p>
        )}
      </div>
      {problems.length > 0 && (
        <Notice tone="warning" size="sm" title={t('proposals.problems')}>
          <ul class="proposal-problems">
            {problems.map((p) => (
              <li key={p.id}>
                <code>{p.id}</code>: {p.errors[0] ?? ''}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
