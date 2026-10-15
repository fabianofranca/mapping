import type { Ref } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { ProposalRow as ProposalRowData } from '../../store/derived';
import { showToast } from '../../store/ui';
import { matchesSearch } from '../../utils/search';
import { Button, Segmented, TextField } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Notice } from '../Notice';
import { ProposalRow } from './ProposalRow';
import { useReviewCommands } from './useReviewCommands';

// Janela Propostas fora do modo revisão (HANDOFF-PROPOSALS 5.1): propostas abertas e
// fechadas, com busca por título, origem e autor, a contagem de aceitas aguardando
// aplicação em cada linha e o estado vazio. Os dados vêm de `review.derived.rows`; o selo
// "Nova" vai em toda linha `fresh` (a mesma contagem da barra de status; fase 8.2).

type Scope = 'all' | 'open' | 'closed';

interface ProposalListProps {
  /** Abre a Ajuda na seção das propostas ("Como o agente envia propostas"). */
  readonly onHelp: () => void;
  /** "Verificar a pasta agora". */
  readonly onScan: () => void;
}

/** Estado vazio: como as propostas chegam e onde elas valem. */
export function ProposalsEmpty({
  onHelp,
  onScan,
  helpRef,
}: ProposalListProps & {
  /** O primeiro botão (alvo do foco quando a última proposta é apagada). */
  readonly helpRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div class="proposals-empty">
      <span class="proposals-empty-icon" aria-hidden="true">
        <Icon name="proposal" />
      </span>
      <h3>{t('proposals.emptyTitle')}</h3>
      <p>{t('proposals.emptyText')}</p>
      <div class="proposals-empty-actions">
        <Button onClick={onHelp} buttonRef={helpRef}>
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
  const { review, session, store, ui } = useEditor();
  const { openReview, report } = useReviewCommands();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<ProposalRowData | null>(null);
  const [removing, setRemoving] = useState(false);
  const rowsRef = useRef<HTMLDivElement>(null);
  const emptyFocus = useRef<HTMLButtonElement>(null);
  // Onde estava a linha apagada: um dono só para o foco (o `returnFocus` do diálogo, que
  // fecha depois da ação, já sem a linha; etapa 8, F2).
  const removedAt = useRef(0);
  const rows = review.derived.rows.value;
  const problems = session.proposals.problems.value;

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
  const now = new Date();

  // Revisar, Continuar e Ver abrem a revisão (a retirada só explica que não há o que rever).
  const onAction = (row: ProposalRowData) => {
    openReview(row.proposal.id);
  };

  const onRemove = (row: ProposalRowData) => {
    removedAt.current = [...shownOpen, ...shownClosed].indexOf(row);
    setPending(row);
  };

  /** A linha que ocupa o lugar da apagada (ou a anterior); sem linhas, o estado vazio ou a lista. */
  const focusAfterRemoval = (): HTMLElement | null => {
    const actions = rowsRef.current?.querySelectorAll<HTMLElement>(
      '[data-proposal-action]',
    );
    if (actions && actions.length > 0) {
      return actions[Math.min(removedAt.current, actions.length - 1)] ?? null;
    }
    return emptyFocus.current ?? rowsRef.current;
  };

  const confirmRemoval = async (row: ProposalRowData) => {
    setRemoving(true);
    try {
      const result = await review.removeProposal(row.proposal.id);
      if (result.ok) {
        showToast(ui, t('proposals.removed', { title: row.proposal.title }));
      } else {
        report(result.error);
      }
    } finally {
      setRemoving(false);
      setPending(null);
    }
  };

  const removalDialog = pending && (
    <Dialog
      title={t('proposals.removeTitle')}
      alert
      onCancel={() => {
        if (!removing) setPending(null);
      }}
      returnFocus={focusAfterRemoval}
      actions={
        <>
          <Button disabled={removing} onClick={() => setPending(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={removing}
            onClick={() => void confirmRemoval(pending)}
          >
            {t('proposals.removeConfirm')}
          </Button>
        </>
      }
    >
      <p>{t('proposals.removeMessage', { title: pending.proposal.title })}</p>
      {pending.proposal.status === 'applied' && (
        <p class="muted">{t('proposals.removeAppliedNote')}</p>
      )}
    </Dialog>
  );

  // O diálogo fica sempre na mesma posição do fragmento: apagar a última proposta troca a
  // lista pelo estado vazio sem remontar o diálogo aberto.
  if (rows.length === 0 && problems.length === 0) {
    return (
      <>
        <ProposalsEmpty onHelp={onHelp} onScan={onScan} helpRef={emptyFocus} />
        {removalDialog}
      </>
    );
  }

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
            now={now}
            onAction={onAction}
            onOpenNewer={openReview}
            onRemove={onRemove}
            removeDisabled={store.locked.value || removing}
          />
        ))}
      </>
    );

  return (
    <>
      <div class="proposal-list">
        <div class="review-filters" role="group" aria-label={t('proposals.filters')}>
          <Segmented
            label={t('proposals.scope')}
            value={scope}
            onSelect={setScope}
            items={[
              { id: 'all', label: t('proposals.scopeAll', { count: rows.length }) },
              { id: 'open', label: t('proposals.scopeOpen', { count: open.length }) },
              {
                id: 'closed',
                label: t('proposals.scopeClosed', { count: closed.length }),
              },
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
        <div
          role="list"
          aria-label={t('proposals.title')}
          class="proposal-rows"
          ref={rowsRef}
          tabIndex={-1}
        >
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
      {removalDialog}
    </>
  );
}
