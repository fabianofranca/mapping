import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ariaKeys } from '../../app/shortcuts';
import { t } from '../../i18n';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  changeType,
  isRecord,
  type Change,
  type ChangeType,
  type JsonValue,
} from '../../model';
import type { ChangeSituation, ReviewView } from '../../store/derived';
import { locale } from '../../store/settings';
import { Button, IconButton } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon, type IconName } from '../icons';
import { ChangeKind } from './ChangeKind';
import { changeTitle, valueParts, type ReviewNames, type ValuePart } from './changeText';
import { useClickSource } from './clickSource';
import { REVIEW_KEYS, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { DiffValue, type DiffRow } from './DiffValue';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { NoteField, useHasNote } from './NoteField';
import { replaceChangeOf } from './ReviewCanvasControls';
import { useDecide, useReviewNames } from './useReview';

// Conteúdo do popover de um marcador (HANDOFF-REVIEW-DETAILS 2.1 e 5.3, fases 9.5 e 9.6):
// título com o tipo e o campo, os valores (o outro lado primeiro; em conflito, Atual, Antes
// e Depois), a ajuda do efeito e o rodapé com a decisão do campo (Aceitar, Rejeitar,
// Limpar; em conflito, Sobrescrever e Manter atual), a nota da mudança e Comparar. Só
// existe aberto: o painel desenha os marcadores, nunca popovers fechados.

/** O que um marcador representa: uma mudança, ou um campo da entidade criada ou removida. */
export interface MarkSubject {
  readonly change: Change;
  /** Campo mostrado: o da mudança, um campo da entidade (parte) ou `''` (a entidade). */
  readonly field: string;
  /** Campo de uma entidade criada ou removida: sem decisão própria. */
  readonly part: boolean;
  /** Na parte: o valor do campo na entidade mostrada, na forma de `from`/`to`. */
  readonly value?: JsonValue;
}

/** Linhas do corpo em conflito: Atual, Antes e Depois (as duas últimas só quando existem). */
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

/** Até quantos caracteres (ou linhas) um valor aparece inteiro antes do "Ver tudo". */
const LONG_TEXT = 240;
const LONG_LINES = 6;
/** Até quantas linhas de uma tabela aparecem antes do "Ver tudo". */
const TABLE_ROWS = 5;

const GLYPHS: Readonly<Record<ChangeType, IconName>> = {
  created: 'plus',
  removed: 'minus',
  moved: 'moved',
  changed: 'changed',
  replaced: 'replaced',
};

/** Tipo do marcador: o da mudança; num par livre, novo ou removido pelo lado vazio. */
export function markType(subject: MarkSubject): ChangeType {
  const c = subject.change;
  if (c.kind === 'update' && c.field?.startsWith(ENTRIES_FIELD_PREFIX)) {
    if (c.from === null) return 'created';
    if (c.to === null) return 'removed';
  }
  return changeType(c);
}

/** Glifo do tipo (o mesmo do `ChangeKind`). */
export function markGlyph(type: ChangeType): IconName {
  return GLYPHS[type];
}

/** A mudança vista como a alteração de um campo (para títulos e valores de uma parte). */
function asField(subject: MarkSubject): Change {
  const { change, field, value } = subject;
  if (!subject.part) return change;
  return { ...change, kind: 'update', field, from: null, to: value ?? null };
}

/** Nome do campo ("Nome", "Posição", "estilo · Button"); `''`: o título da mudança. */
export function markFieldLabel(names: ReviewNames, subject: MarkSubject): string {
  return changeTitle(names, asField(subject));
}

const text = (parts: readonly ValuePart[]) => parts.map((p) => p.text).join('');

/** Os dois lados de um marcador: o valor atual e o proposto, em partes. */
export function markSides(
  names: ReviewNames,
  subject: MarkSubject,
  situation: ChangeSituation | undefined,
): { readonly current: readonly ValuePart[]; readonly proposed: readonly ValuePart[] } {
  const c = subject.change;
  if (subject.part) {
    const own = valueParts(names, asField(subject), subject.value ?? null);
    return c.kind === 'create'
      ? { current: [{ text: t('review.pop.notThere') }], proposed: own }
      : { current: own, proposed: [{ text: t('review.pop.notThere') }] };
  }
  if (c.kind === 'create') {
    return {
      current: [{ text: t('review.pop.notThere') }],
      proposed: valueParts(names, c, c.to),
    };
  }
  if (c.kind === 'remove') {
    return {
      current: valueParts(names, c, c.from),
      proposed: [{ text: t('review.pop.notThere') }],
    };
  }
  const entry = c.field?.startsWith(ENTRIES_FIELD_PREFIX) === true;
  const now = situation?.current !== undefined ? situation.current : c.from;
  return {
    current:
      entry && now === null
        ? [{ text: t('review.pop.notThere') }]
        : valueParts(names, c, now, c.to),
    proposed:
      entry && c.to === null
        ? [{ text: t('review.pop.notThere') }]
        : valueParts(names, c, c.to, c.from),
  };
}

/** As linhas de uma tabela (`values.<campo>` com lista de registros), em texto. */
function tableLines(value: JsonValue | undefined): { id: string; text: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row, i) => {
    if (!isRecord(row)) return { id: String(i), text: String(row) };
    const id = typeof row._id === 'string' ? row._id : String(i);
    const cells = Object.entries(row)
      .filter(([k, v]) => k !== '_id' && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    return { id, text: cells.join(' · ') };
  });
}

/** Tabela dos dois lados: as linhas que saem riscadas no atual, as novas em negrito. */
function TableSides({
  current,
  proposed,
  all,
  order,
}: {
  readonly current: readonly { id: string; text: string }[];
  readonly proposed: readonly { id: string; text: string }[];
  readonly all: boolean;
  readonly order: 'current-first' | 'proposed-first';
}) {
  const inProposed = new Set(proposed.map((r) => r.id));
  const inCurrent = new Set(current.map((r) => r.id));
  const side = (kind: 'current' | 'proposed') => {
    const rows = kind === 'current' ? current : proposed;
    const shown = all ? rows : rows.slice(0, TABLE_ROWS);
    return (
      <div key={kind} class="diff-value-row">
        <dt class="diff-value-label">
          {kind === 'current' ? t('review.diff.current') : t('review.pop.proposed')}
        </dt>
        <dd
          class={`diff-value-value diff-value-${kind === 'current' ? 'before' : 'after'}`}
        >
          {rows.length === 0 ? (
            t('review.value.empty')
          ) : (
            <ol class="change-popover-rows">
              {shown.map((r) =>
                kind === 'current' && !inProposed.has(r.id) ? (
                  <li key={r.id}>
                    <del>{r.text}</del>
                  </li>
                ) : kind === 'proposed' && !inCurrent.has(r.id) ? (
                  <li key={r.id}>
                    <b>{r.text}</b>
                  </li>
                ) : (
                  <li key={r.id}>{r.text}</li>
                ),
              )}
            </ol>
          )}
        </dd>
      </div>
    );
  };
  return (
    <dl class="diff-value">
      {order === 'current-first'
        ? [side('current'), side('proposed')]
        : [side('proposed'), side('current')]}
    </dl>
  );
}

/** O texto passa do limite do popover fechado (o resto vem por "Ver tudo"). */
function isLong(parts: readonly ValuePart[]): boolean {
  const value = text(parts);
  return value.length > LONG_TEXT || value.split('\n').length > LONG_LINES;
}

/** Onde decidir um campo que faz parte da criação ou da remoção da entidade. */
function partHint(c: Change): string {
  const create = c.kind === 'create';
  if (c.entity === 'image') {
    return t(
      create ? 'review.pop.decideOnImage.create' : 'review.pop.decideOnImage.remove',
    );
  }
  if (c.entity === 'annotation') {
    return t(
      create
        ? 'review.pop.decideOnAnnotation.create'
        : 'review.pop.decideOnAnnotation.remove',
    );
  }
  return t(create ? 'review.pop.decideOnItem.create' : 'review.pop.decideOnItem.remove');
}

/** Ajuda do efeito: o conflito, a posição (decidida junto) ou a tabela (um campo só). */
function effectHint(
  names: ReviewNames,
  subject: MarkSubject,
  situation: ChangeSituation | undefined,
  table: boolean,
): string | null {
  const c = subject.change;
  if (!subject.part && situation?.conflict) {
    if (c.kind !== 'update') return t('review.hint.conflictEntity');
    const current = text(valueParts(names, c, situation.current, c.to));
    const after = text(valueParts(names, c, c.to, c.from));
    return t('review.hint.conflict', { current, after });
  }
  if (subject.field === 'rect') return t('review.pop.rectHint');
  if (table) return t('review.pop.tableHint');
  return null;
}

/** Título do popover ("Nome · alterado"): o mesmo nome do diálogo. */
export function popoverTitle(names: ReviewNames, subject: MarkSubject): string {
  return t('review.pop.title', {
    field: markFieldLabel(names, subject),
    kind: t(`review.mark.kind.${markType(subject)}`),
  });
}

/** Ações do rodapé: a decisão do campo. Em conflito, os rótulos dizem o efeito. */
function PopoverDecision({
  subject,
  names,
  situation,
  decision,
  disabled,
  reasonId,
  onRejectedByMouse,
}: {
  readonly subject: MarkSubject;
  readonly names: ReviewNames;
  readonly situation: ChangeSituation | undefined;
  readonly decision: DecisionValue;
  readonly disabled: boolean;
  readonly reasonId: string;
  /** Rejeitou com o mouse: a nota é sugerida (campo vazio com o foco). */
  readonly onRejectedByMouse: () => void;
}) {
  const decide = useDecide();
  const accept = useRef<HTMLButtonElement>(null);
  const rejectClick = useClickSource();
  const c = subject.change;
  const field = markFieldLabel(names, subject);
  const conflict = situation?.conflict === true;
  const apply = (state: DecisionValue) => decide({ level: 'change', id: c.id }, state);
  const describedBy = disabled ? reasonId : undefined;

  let acceptLabel = t(
    decision === 'accepted' ? 'review.decide.accepted' : 'review.decide.accept',
    {
      name: field,
    },
  );
  let rejectLabel = t(
    decision === 'rejected' ? 'review.decide.rejected' : 'review.decide.reject',
    {
      name: field,
    },
  );
  if (conflict) {
    if (c.kind === 'update') {
      const current = text(valueParts(names, c, situation.current, c.to));
      const after = text(valueParts(names, c, c.to, c.from));
      acceptLabel = t('review.pop.acceptConflict', { current, after });
      rejectLabel = t('review.pop.rejectConflict', { current });
    } else {
      acceptLabel = t('review.decide.acceptConflict', { name: field });
      rejectLabel = t('review.decide.rejectConflict', { name: field });
    }
  }

  return (
    <div class="change-popover-actions" role="group" aria-label={field}>
      <Button
        size="sm"
        variant="accept"
        buttonRef={accept}
        aria-pressed={decision === 'accepted'}
        aria-label={acceptLabel}
        aria-keyshortcuts={ariaKeys(REVIEW_KEYS.accept)}
        aria-describedby={describedBy}
        title={`${t('review.accept')}  ${REVIEW_KEYS.accept}`}
        disabled={disabled}
        onClick={() => apply(decision === 'accepted' ? null : 'accepted')}
      >
        <Icon name="check" />
        {conflict ? t('review.pop.overwrite') : t('review.accept')}
      </Button>
      <Button
        size="sm"
        variant="reject"
        aria-pressed={decision === 'rejected'}
        aria-label={rejectLabel}
        aria-keyshortcuts={ariaKeys(REVIEW_KEYS.reject)}
        aria-describedby={describedBy}
        title={`${t('review.reject')}  ${REVIEW_KEYS.reject}`}
        disabled={disabled}
        {...rejectClick.handlers}
        onClick={() => {
          const next = decision === 'rejected' ? null : 'rejected';
          apply(next);
          // Tudo que não veio do teclado conta como mouse e sugere a nota; o teclado não
          // move o foco (a nota abre pelo botão de nota).
          const byKeyboard = rejectClick.takeKeyboard();
          if (next === 'rejected' && !byKeyboard) onRejectedByMouse();
        }}
      >
        <Icon name="close" />
        {conflict ? t('review.pop.keepCurrent') : t('review.reject')}
      </Button>
      {decision !== null && !disabled && (
        <Button
          size="sm"
          variant="ghost"
          aria-keyshortcuts={ariaKeys(REVIEW_KEYS.clear)}
          onClick={() => {
            // O botão sai do DOM ao limpar: o foco vai ao Aceitar, que fica (nunca ao body).
            accept.current?.focus();
            apply(null);
          }}
        >
          {t('review.pop.clear')}
        </Button>
      )}
    </div>
  );
}

export function ChangePopover({
  subject,
  close,
}: {
  readonly subject: MarkSubject;
  /** Fecha o popover devolvendo o foco ao marcador (o `Popover` passa). */
  readonly close: () => void;
}) {
  const { review, ui } = useEditor();
  const names = useReviewNames();
  const [all, setAll] = useState(false);
  const [noteShown, setNoteShown] = useState(false);
  const [noteFocus, setNoteFocus] = useState(0);
  const reasonId = useId();
  const hasNote = useHasNote({ level: 'change', id: subject.change.id });
  // Rejeitar com o mouse pede a nota sugerida pelo store (`review.requestNote`): a decisão
  // pode trocar o cartão da anotação criada e remontar o marcador, e o popover novo (que
  // reabre pelo `OpenMarkContext`) cumpre o pedido no commit que o desenha, com o foco no
  // campo. Cada instância passa o pedido para o próprio estado; quem o apaga é o fechar
  // do popover, a nota que sai vazia, outra seleção ou sair da revisão.
  const noteAsk = review.noteRequest.value;
  const asked = noteAsk?.changeId === subject.change.id ? noteAsk.seq : 0;
  useLayoutEffect(() => {
    if (asked === 0) return;
    setNoteShown(true);
    setNoteFocus((n) => n + 1);
  }, [asked]);
  // O estado "mudou de decisão" é anunciado (região `status`), venha de onde vier.
  const decisionNow = names?.proposal.decisions[subject.change.id]?.state ?? null;
  const lastDecision = useRef(decisionNow);
  const [announce, setAnnounce] = useState('');
  const fieldName = names ? markFieldLabel(names, subject) : '';
  useEffect(() => {
    if (lastDecision.current === decisionNow) return;
    lastDecision.current = decisionNow;
    setAnnounce(
      t(`review.pop.announce.${decisionNow ?? 'cleared'}`, { field: fieldName }),
    );
  }, [decisionNow, fieldName]);
  if (!names) return null;
  const c = subject.change;
  const p = names.proposal;
  const d = review.derived;
  const view: ReviewView = review.view.value;
  const situation = d.situation.value.get(c.id);
  const conflict = !subject.part && situation?.conflict === true;
  const type = markType(subject);
  const decision = p.decisions[c.id] ?? null;
  const state = decision?.state ?? 'undecided';
  const invalid = !subject.part && d.invalid.value.changeIds.has(c.id);
  const together =
    !subject.part && review.undoable.value?.cascaded.includes(c.id) === true;
  const comparison = subject.part
    ? null
    : (d.supersession.value?.comparison?.get(c.id) ?? null);
  const applied = situation?.applied === true;
  const replaced =
    !subject.part &&
    c.entity === 'image' &&
    c.field === 'file' &&
    replaceChangeOf(p, c.entityId);

  // Tabela: as linhas dos dois lados (uma tabela é um campo só, decidido inteiro).
  const tableValue = c.kind === 'update' && c.field?.startsWith(VALUES_FIELD_PREFIX);
  const fromRows = !subject.part && tableValue ? tableLines(c.from) : null;
  const toRows = !subject.part && tableValue ? tableLines(c.to) : null;
  const table = fromRows !== null && toRows !== null;

  const sides = markSides(names, subject, situation);
  const order = view === 'proposed' ? 'current-first' : 'proposed-first';
  const rows: DiffRow[] = conflict
    ? diffRows(names, c, situation)
    : order === 'current-first'
      ? [
          { kind: 'before', label: t('review.diff.current'), parts: sides.current },
          { kind: 'after', label: t('review.pop.proposed'), parts: sides.proposed },
        ]
      : [
          { kind: 'after', label: t('review.pop.proposed'), parts: sides.proposed },
          { kind: 'before', label: t('review.diff.current'), parts: sides.current },
        ];
  const long = table
    ? Math.max(fromRows.length, toRows.length) > TABLE_ROWS
    : rows.some((row) => isLong(row.parts));
  const hint = effectHint(names, subject, situation, table);

  // Decidir só numa proposta aberta e numa mudança ainda não aplicada (o motivo vai no
  // `aria-describedby` dos botões desabilitados).
  const open = p.status === 'open';
  const disabled = !open || applied;
  const reason = applied
    ? t('review.appliedReason')
    : p.status === 'superseded'
      ? decision === null
        ? t('review.pop.supersededPending')
        : t('review.closedReason')
      : t('review.closedReason');
  // Aplicada ou retirada: o popover só mostra a decisão e as datas, sem botões.
  const closedForGood = p.status === 'applied' || p.status === 'withdrawn';
  const appliedAt = p.applied[c.id]?.at;
  const when = (iso: string) => formatFullDate(iso, locale.value);

  return (
    <div class={all ? 'change-popover-content is-expanded' : 'change-popover-content'}>
      <header class="change-popover-head">
        <ChangeKind type={type} size="sm" />
        <strong class="change-popover-title">{popoverTitle(names, subject)}</strong>
        {conflict && (
          <Flag tone="warn" icon="warning">
            {review.newConflicts.value.has(c.id)
              ? t('review.flag.newConflict')
              : t('review.flag.conflict')}
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
      </header>
      <div class="change-popover-body">
        {table ? (
          <TableSides current={fromRows} proposed={toRows} all={all} order={order} />
        ) : (
          <DiffValue rows={rows} />
        )}
      </div>
      {long && !all && (
        <Button size="sm" class="button-link" onClick={() => setAll(true)}>
          {t('review.pop.showAll')}
        </Button>
      )}
      {hint && <p class="review-hint">{hint}</p>}
      <footer class="change-popover-foot">
        {subject.part ? (
          <p class="muted">{partHint(c)}</p>
        ) : (
          <>
            <span class="change-popover-state">
              <DecisionMark state={state} decorative />
              {t('review.pop.decision', { state: t(`review.details.state.${state}`) })}
            </span>
            {decision && appliedAt && (
              <p class="muted">
                {t('review.pop.closed', {
                  accepted: when(decision.at),
                  applied: when(appliedAt),
                })}
              </p>
            )}
            {disabled && (
              <p class="muted" id={reasonId}>
                {reason}
              </p>
            )}
            {!closedForGood && (
              <PopoverDecision
                subject={subject}
                names={names}
                situation={situation}
                decision={decision?.state ?? null}
                disabled={disabled}
                reasonId={reasonId}
                onRejectedByMouse={() => review.requestNote(c.id)}
              />
            )}
            <div class="change-popover-more">
              {open && (
                <IconButton
                  icon="note"
                  size="sm"
                  label={t('review.note.add')}
                  pressed={noteShown || hasNote}
                  onClick={() => {
                    setNoteShown(true);
                    setNoteFocus((n) => n + 1);
                  }}
                />
              )}
              {replaced && (
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    ui.compareImage.value = c.entityId;
                  }}
                >
                  <Icon name="compare" />
                  {t('review.compare.button')}
                </Button>
              )}
            </div>
            <NoteField
              target={{ level: 'change', id: c.id }}
              show={noteShown}
              focusSeq={noteFocus}
              onHide={() => {
                setNoteShown(false);
                review.clearNoteRequest();
              }}
            />
            <span class="visually-hidden" role="status">
              {announce}
            </span>
          </>
        )}
      </footer>
    </div>
  );
}
