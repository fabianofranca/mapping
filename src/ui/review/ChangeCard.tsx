import { t } from '../../i18n';
import type { Change, ChangeComparison, ChangeType } from '../../model';
import type { ChangeSituation } from '../../store/derived';
import { IconButton } from '../controls';
import { classes } from '../controls/classes';
import { ChangeKind } from './ChangeKind';
import { changeTitle, valueParts, type ReviewNames } from './changeText';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { DiffValue, type DiffRow } from './DiffValue';
import { Flag } from './Flag';

// Uma mudança nos Detalhes (HANDOFF-PROPOSALS 2.1, ChangeCard): cabeçalho com a decisão,
// o tipo, o campo e os sinalizadores; corpo com os valores (DiffValue) e a ajuda do efeito.
// Conflito sempre com as três linhas (Atual, Antes, Depois); inválida com a barra vermelha
// e "Envolvida".

interface ChangeCardProps {
  readonly change: Change;
  readonly names: ReviewNames;
  readonly type: ChangeType | null;
  readonly decision: DecisionValue;
  readonly situation: ChangeSituation | undefined;
  /** Conflito que apareceu desde a última abertura (edição entre sessões). */
  readonly newConflict: boolean;
  readonly invalid: boolean;
  /** Mudou junto com a última decisão, pelas dependências. */
  readonly together: boolean;
  /** Proposta substituída: igual, diferente ou ausente na nova. */
  readonly comparison: ChangeComparison | null;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly onDecide: (state: DecisionValue) => void;
  /** Mostra a mudança na lista e no canvas. */
  readonly onSelect: () => void;
  /** Imagem trocada: abre a comparação antes/depois. */
  readonly onCompare?: () => void;
  readonly selected: boolean;
}

/** Linhas do corpo: Atual (só em conflito), Antes e Depois. */
export function diffRows(
  names: ReviewNames,
  c: Change,
  situation: ChangeSituation | undefined,
): DiffRow[] {
  const rows: DiffRow[] = [];
  if (situation?.conflict) {
    rows.push({
      kind: 'current',
      label: t('review.diff.current'),
      parts: valueParts(names, c, situation.current, c.to),
    });
  }
  if (c.kind !== 'create') {
    rows.push({
      kind: 'before',
      label: t('review.diff.before'),
      parts: valueParts(names, c, c.from, c.to),
    });
  }
  if (c.kind !== 'remove') {
    rows.push({
      kind: 'after',
      label: t('review.diff.after'),
      parts: valueParts(names, c, c.to, c.from),
    });
  }
  return rows;
}

const text = (parts: readonly { text: string }[]) => parts.map((p) => p.text).join('');

export function ChangeCard({
  change: c,
  names,
  type,
  decision,
  situation,
  newConflict,
  invalid,
  together,
  comparison,
  disabled,
  disabledReason,
  onDecide,
  onSelect,
  onCompare,
  selected,
}: ChangeCardProps) {
  const title = changeTitle(names, c);
  const conflict = situation?.conflict === true;
  const applied = situation?.applied === true;
  const rows = diffRows(names, c, situation);
  let hint: string | null = null;
  if (conflict && c.kind === 'update' && situation) {
    const current = text(valueParts(names, c, situation.current, c.to));
    const after = text(valueParts(names, c, c.to, c.from));
    hint = t('review.hint.conflict', { current, after });
  } else if (conflict) {
    hint = t('review.hint.conflictEntity');
  } else if (c.field === 'rect') {
    hint = t('review.hint.pixels');
  }
  return (
    <article
      class={classes(
        'change-card',
        conflict && 'change-card-conflict',
        invalid && 'change-card-invalid',
        selected && 'change-card-selected',
      )}
      aria-label={title}
      data-change={c.id}
    >
      <header class="change-card-head">
        <DecisionMark state={decision ?? 'undecided'} />
        {type && <ChangeKind type={type} size="sm" />}
        <button type="button" class="change-card-title" title={title} onClick={onSelect}>
          {title}
        </button>
        {conflict && (
          <Flag tone="warn" icon="warning">
            {newConflict ? t('review.flag.newConflict') : t('review.flag.conflict')}
          </Flag>
        )}
        {situation?.locked && (
          <Flag icon="lock" title={t('review.lockedItem')}>
            {t('review.flag.locked')}
          </Flag>
        )}
        {invalid && <Flag tone="danger">{t('review.flag.involved')}</Flag>}
        {together && (
          <Flag icon="link" title={t('review.flag.togetherHint')}>
            {t('review.flag.together')}
          </Flag>
        )}
        {applied && <Flag tone="ok">{t('review.flag.applied')}</Flag>}
        {comparison && (
          <Flag tone={comparison === 'missing' ? 'danger' : 'neutral'}>
            {t(`review.compare.${comparison}`)}
          </Flag>
        )}
        {onCompare && (
          <IconButton
            icon="compare"
            size="sm"
            label={t('review.compare.open')}
            onClick={onCompare}
          />
        )}
        <DecisionControl
          value={decision}
          name={title}
          conflict={conflict}
          disabled={disabled}
          disabledReason={disabledReason}
          onDecide={onDecide}
        />
      </header>
      {!together && rows.length > 0 && (
        <div class="change-card-body">
          <DiffValue rows={rows} />
          {hint && <p class="change-card-hint">{hint}</p>}
        </div>
      )}
    </article>
  );
}
