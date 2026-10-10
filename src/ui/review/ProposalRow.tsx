import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import type { ProposalRow as ProposalRowData } from '../../store/derived';
import { locale } from '../../store/settings';
import { Button } from '../controls';
import { Icon } from '../icons';
import { DecisionMark } from './DecisionMark';
import { Flag, type FlagTone } from './Flag';
import { formatFullDate, formatWhen, joinParts } from './format';

// Linha da lista de propostas (HANDOFF-PROPOSALS 5.1 e componente ProposalRow): estado do
// conjunto, título com o status, contexto (origem · autor · data), contagens e a linha
// "N aceitas aguardando aplicação"; ação Revisar, Continuar ou Ver. Só lê o derivado.

export type ProposalAction = 'review' | 'continue' | 'view';

export interface ProposalStatusView {
  readonly flag: { readonly tone: FlagTone; readonly text: string } | null;
  readonly action: ProposalAction;
  /** A ação é a principal da janela (a proposta que chegou e ninguém abriu). */
  readonly primary: boolean;
}

/**
 * Status mostrado e ação de uma linha. `showNew`: esta é a linha que leva a `Flag` "Nova"
 * (só uma por janela).
 */
export function proposalStatus(
  row: ProposalRowData,
  showNew: boolean,
): ProposalStatusView {
  const { proposal: p, progress } = row;
  switch (p.status) {
    case 'open': {
      if (row.fresh) {
        return {
          flag: showNew ? { tone: 'new', text: t('proposals.status.new') } : null,
          action: 'review',
          primary: true,
        };
      }
      const started = progress.accepted + progress.rejected > 0 || p.notes.length > 0;
      return started
        ? {
            flag: { tone: 'neutral', text: t('proposals.status.inReview') },
            action: 'continue',
            primary: false,
          }
        : { flag: null, action: 'review', primary: false };
    }
    case 'superseded':
      return {
        flag: { tone: 'warn', text: t('proposals.status.superseded') },
        action: 'view',
        primary: false,
      };
    case 'applied':
      return {
        flag: { tone: 'ok', text: t('proposals.status.applied') },
        action: 'view',
        primary: false,
      };
    case 'withdrawn':
      return {
        flag: { tone: 'neutral', text: t('proposals.status.withdrawn') },
        action: 'view',
        primary: false,
      };
  }
}

/** "2 aceitas e 4 sem decisão ficaram para trás" (proposta substituída). */
export function leftBehindText(row: ProposalRowData): string | null {
  const behind = row.leftBehind;
  if (!behind) return null;
  const accepted = behind.acceptedPending.length;
  const undecided = behind.undecided.length;
  if (accepted === 0 && undecided === 0) return t('proposals.leftBehindNone');
  if (undecided === 0) return t('proposals.leftBehindAccepted', { accepted });
  if (accepted === 0) return t('proposals.leftBehindUndecided', { undecided });
  return t('proposals.leftBehind', { accepted, undecided });
}

/** "N aceitas aguardando aplicação" (com o singular). */
export function awaitingText(count: number): string {
  return count === 1
    ? t('proposals.awaitingOne')
    : t('proposals.awaitingMany', { count });
}

function Count({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: number;
  readonly children: ComponentChildren;
}) {
  return (
    <span class="review-count" title={label}>
      {children}
      <span>{value}</span>
      <span class="visually-hidden">{label}</span>
    </span>
  );
}

/** Contagens pendentes · aceitas · rejeitadas · conflitos, com o estado pela forma. */
export function DecisionCounts({
  undecided,
  accepted,
  rejected,
  conflicts,
}: {
  readonly undecided: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly conflicts?: number;
}) {
  return (
    <span class="review-counts">
      <Count label={t('review.count.undecided')} value={undecided}>
        <DecisionMark state="undecided" decorative />
      </Count>
      <Count label={t('review.count.accepted')} value={accepted}>
        <DecisionMark state="accepted" decorative />
      </Count>
      <Count label={t('review.count.rejected')} value={rejected}>
        <DecisionMark state="rejected" decorative />
      </Count>
      {conflicts !== undefined && conflicts > 0 && (
        <span class="review-count review-count-warn" title={t('review.count.conflicts')}>
          <Icon name="warning" />
          <span>{conflicts}</span>
          <span class="visually-hidden">{t('review.count.conflicts')}</span>
        </span>
      )}
    </span>
  );
}

interface ProposalRowProps {
  readonly row: ProposalRowData;
  readonly showNew: boolean;
  /** Agora (para a data relativa). */
  readonly now: Date;
  readonly onAction: (row: ProposalRowData, action: ProposalAction) => void;
}

export function ProposalRow({ row, showNew, now, onAction }: ProposalRowProps) {
  const { proposal: p, progress } = row;
  const status = proposalStatus(row, showNew);
  const lang = locale.value;
  const meta = joinParts([p.origin, p.author, formatWhen(p.createdAt, now, lang)]);
  const behind = leftBehindText(row);
  const awaiting =
    p.status === 'open' && progress.acceptedPending > 0
      ? awaitingText(progress.acceptedPending)
      : null;
  const actionLabel = t(`proposals.action.${status.action}`);
  return (
    <div class="proposal-row" role="listitem" data-proposal={p.id} data-status={p.status}>
      <div class="proposal-row-main">
        <DecisionMark
          state={progress.state}
          counts={progress}
          label={t('proposals.progressLabel', {
            accepted: progress.accepted,
            rejected: progress.rejected,
            undecided: progress.undecided,
          })}
        />
        <div class="proposal-row-text">
          <div class="proposal-row-title">
            <b title={p.title}>{p.title}</b>
            {status.flag && <Flag tone={status.flag.tone}>{status.flag.text}</Flag>}
          </div>
          <div class="proposal-row-meta" title={formatFullDate(p.createdAt, lang)}>
            {meta}
          </div>
        </div>
      </div>
      <div class="proposal-row-counts">
        {p.status === 'open' && (
          <DecisionCounts
            undecided={progress.undecided}
            accepted={progress.accepted}
            rejected={progress.rejected}
            conflicts={row.conflicts}
          />
        )}
        {p.status === 'applied' && (
          <span class="muted">
            {t('proposals.appliedCount', { count: progress.applied })}
          </span>
        )}
        {p.status === 'withdrawn' && (
          <span class="muted">
            {t('proposals.withdrawnCount', { count: progress.total })}
          </span>
        )}
        {behind && <span class="proposal-row-await proposal-row-warn">{behind}</span>}
        {awaiting && (
          <span class="proposal-row-await">
            <DecisionMark state="accepted" decorative />
            {awaiting}
          </span>
        )}
      </div>
      <div class="proposal-row-action">
        <Button
          variant={status.primary ? 'primary' : 'default'}
          aria-label={`${actionLabel}: ${p.title}`}
          onClick={() => onAction(row, status.action)}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
