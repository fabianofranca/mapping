import { useContext, useId, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../../i18n';
import {
  changeLayerId,
  projectIndex,
  reviewKey,
  summarizeDecisions,
  type Change,
  type ProposalIssue,
  type ReviewTarget,
} from '../../model';
import { locale } from '../../store/settings';
import { Button, IconButton } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Notice } from '../Notice';
import {
  changeTitle,
  entityKindOf,
  entityLabel,
  entityName,
  markingName,
  targetName,
  type ReviewNames,
} from './changeText';
import { OpenMarkContext } from './ChangeMark';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { NoteField, useHasNote } from './NoteField';
import { OpenNewer } from './ReviewLevels';
import { useDecide, useReviewNames } from './useReview';

// Cabeçalho do que está selecionado nos Detalhes da revisão (HANDOFF-REVIEW-DETAILS 5.4, 5.5
// e 5.7, fase 9.6): o que é (marcação alterada, criada, removida; imagem; proposta; grupo
// Projeto), a decisão de três estados com as contagens, a criação ou a remoção por inteiro,
// o conjunto inválido com as duas saídas, o item trancado, o "junto" com Desfazer, a nota
// do item e a situação da proposta (aplicada ou substituída). Nada aqui calcula regra:
// tudo vem de `review.derived`.

/** Quantas mudanças aparecem por extenso nas listas curtas ("e mais N"). */
const LIST_MAX = 4;

/** Quantos nomes de dependências aparecem no aviso "junto". */
const TOGETHER_NAMES = 4;

// ---------------------------------------------------------------------------
// Textos por tipo de item

/**
 * A variante do cabeçalho: marcação ou imagem alterada, criada ou removida (a criação ou a
 * remoção da entidade inteira vem do índice por campo), a proposta ou o grupo Projeto.
 * Os rótulos têm uma chave para cada variante (não se montam por interpolação: "Aceitar
 * marcação" e "Aceitar remoção" não compõem igual nos dois idiomas).
 */
export type HeaderVariant =
  | 'marking'
  | 'markingCreate'
  | 'markingRemove'
  | 'image'
  | 'imageCreate'
  | 'imageRemove'
  | 'proposal'
  | 'project'
  | 'change';

export function headerVariant(
  target: ReviewTarget,
  whole: Change | null | undefined,
): HeaderVariant {
  if (target.level === 'proposal') return 'proposal';
  if (target.level === 'project') return 'project';
  if (target.level === 'change') return 'change';
  const base = target.level === 'image' ? 'image' : 'marking';
  if (whole?.kind === 'create') return `${base}Create`;
  if (whole?.kind === 'remove') return `${base}Remove`;
  return base;
}

/** Variante dos rótulos Aceitar/Rejeitar (criada e alterada decidem "a marcação"). */
function actionVariant(
  variant: HeaderVariant,
): Exclude<HeaderVariant, 'markingCreate' | 'imageCreate'> {
  if (variant === 'markingCreate') return 'marking';
  if (variant === 'imageCreate') return 'image';
  return variant;
}

// ---------------------------------------------------------------------------
// Problemas do conjunto aceito

/** O tipo da entidade em minúsculas ("camada"), para o texto do problema. */
const kindText = (kind: Parameters<typeof entityLabel>[0]) =>
  entityLabel(kind).toLocaleLowerCase();

/**
 * Texto de um problema do conjunto aceito. Cita a entidade pelo nome (marcação, imagem,
 * camada, anotação, especialização), nunca pelo id; sem nome em lugar nenhum, pelo tipo.
 */
export function issueText(names: ReviewNames, issue: ProposalIssue): string {
  const name = (id: string | undefined) => {
    if (id === undefined) return '';
    const found = entityName(names, id);
    if (found !== null) return found;
    const kind = entityKindOf(names, id);
    // Especialização e repositório têm id legível (`sdui`, `android`): é o próprio nome.
    if (kind === null || kind === 'specialization' || kind === 'platformRepo') return id;
    return kindText(kind);
  };
  // A mudança cita um alvo que não existe mais (nem no projeto, nem na proposta).
  if (issue.code === 'entity-missing' && entityName(names, issue.id) === null) {
    const kind = entityKindOf(names, issue.id);
    if (kind !== null) return t('review.issue.gone', { entity: kindText(kind) });
  }
  const params = { name: name(issue.id), other: name(issue.otherId) };
  switch (issue.code) {
    case 'rect-outside-parent':
      return t('review.issue.outsideParent', params);
    case 'rect-out-of-image':
      return t('review.issue.outOfImage', params);
    case 'images-overlap':
      return t('review.issue.imagesOverlap', params);
    case 'missing-specialization':
      return t('review.issue.missingSpecialization', params);
    case 'entity-missing':
    case 'entity-exists':
    case 'field-mismatch':
      return t('review.issue.doesNotFit', params);
    case 'proposal-closed':
      return t('review.issue.closed');
    default:
      return t('review.issue.generic', { ...params, code: issue.code });
  }
}

/** "Aceitar a(s) que falta(m)" / "Rejeitar a(s) que causa(m)": a forma concreta se for uma só. */
function exitLabel(
  names: ReviewNames,
  ids: readonly string[],
  many: TranslationKey,
  one: TranslationKey,
): string {
  const only =
    ids.length === 1 ? names.proposal.changes.find((c) => c.id === ids[0]) : null;
  return only
    ? t(one, { title: changeTitle(names, only) })
    : t(many, { count: ids.length });
}

function IssueNotices({
  target,
  ids,
  open,
}: {
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
  readonly open: boolean;
}) {
  const { review } = useEditor();
  const names = useReviewNames();
  const decide = useDecide();
  if (!names) return null;
  const inLevel = new Set(ids);
  const issues = (review.derived.validation.value?.issues ?? []).filter(
    (issue) =>
      target.level === 'proposal' ||
      issue.changeIds.some((id) => inLevel.has(id)) ||
      issue.related.some((id) => inLevel.has(id)),
  );
  return (
    <>
      {issues.map((issue) => (
        <Notice
          key={`${issue.code}:${issue.id}`}
          tone="error"
          size="sm"
          title={t('review.issue.title')}
          actions={
            <>
              {issue.related.length > 0 && (
                <Button
                  size="sm"
                  disabled={!open}
                  onClick={() =>
                    issue.related.forEach((id) =>
                      decide({ level: 'change', id }, 'accepted'),
                    )
                  }
                >
                  <Icon name="check" />
                  {exitLabel(
                    names,
                    issue.related,
                    'review.issue.acceptMissing',
                    'review.issue.acceptOne',
                  )}
                </Button>
              )}
              {issue.changeIds.length > 0 && (
                <Button
                  size="sm"
                  disabled={!open}
                  onClick={() =>
                    issue.changeIds.forEach((id) =>
                      decide({ level: 'change', id }, 'rejected'),
                    )
                  }
                >
                  <Icon name="close" />
                  {exitLabel(
                    names,
                    issue.changeIds,
                    'review.issue.rejectCause',
                    'review.issue.rejectOne',
                  )}
                </Button>
              )}
            </>
          }
        >
          <span>{issueText(names, issue)}</span>
        </Notice>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Criação e remoção por inteiro

/** "+ N anotações criadas" e a ajuda: a criação é uma mudança só. */
function CreationInfo({
  names,
  target,
  ids,
}: {
  readonly names: ReviewNames;
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
}) {
  const inLevel = new Set(ids);
  let annotations = 0;
  let markings = 0;
  for (const c of names.proposal.changes) {
    if (c.kind !== 'create' || !inLevel.has(c.id)) continue;
    if (
      target.level === 'item' &&
      c.entity === 'annotation' &&
      c.markingId === target.id
    ) {
      annotations++;
    } else if (target.level === 'image' && c.entity === 'marking') {
      markings++;
    }
  }
  return (
    <div class="review-header-info">
      {annotations > 0 && <b>{t('review.panel.createdCount', { count: annotations })}</b>}
      {markings > 0 && <b>{t('review.panel.createdMarkings', { count: markings })}</b>}
      <span class="muted">{t('review.panel.createHint')}</span>
    </div>
  );
}

/** O que sai junto com uma marcação ou imagem removida: filhas (com link) e anotações. */
function RemovalList({
  names,
  target,
  ids,
}: {
  readonly names: ReviewNames;
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
}) {
  const { review } = useEditor();
  const inLevel = new Set(ids);
  const markings: string[] = [];
  const byLayer = new Map<string, string[]>();
  for (const c of names.proposal.changes) {
    if (c.kind !== 'remove' || !inLevel.has(c.id)) continue;
    if (c.entity === 'marking' && c.entityId !== target.id) markings.push(c.entityId);
    else if (c.entity === 'annotation') {
      const layer = changeLayerId(c, names.current) ?? '';
      const list = byLayer.get(layer);
      const name = entityName(names, c.entityId) ?? t('annotation.unnamed');
      if (list) list.push(name);
      else byLayer.set(layer, [name]);
    }
  }
  if (markings.length === 0 && byLayer.size === 0) return null;
  const layerName = (id: string) =>
    projectIndex(names.current).layers.get(id)?.name ?? t('review.level.project');
  return (
    <div class="review-header-info">
      <b>{t('review.panel.removesWith')}</b>
      <ul class="review-removal-list">
        {markings.slice(0, LIST_MAX * 3).map((id) => (
          <li key={id}>
            <Icon name="marking" />
            <Button
              size="sm"
              class="button-link"
              onClick={() => review.select({ level: 'item', id })}
            >
              {markingName(names, id)}
            </Button>
          </li>
        ))}
        {[...byLayer].map(([layer, list]) => (
          <li key={layer}>
            <Icon name="layers" />
            <span>
              <b>{layerName(layer)}</b>
              {': '}
              {list.slice(0, LIST_MAX).join(', ')}
              {list.length > LIST_MAX
                ? ` ${t('review.panel.more', { count: list.length - LIST_MAX })}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Junto e situação da proposta

/** "N mudanças rejeitadas junto: …" com Desfazer (o aviso dos lotes, aqui no item). */
function TogetherNotice({
  names,
  ids,
}: {
  readonly names: ReviewNames;
  readonly ids: readonly string[];
}) {
  const { review } = useEditor();
  const undo = review.undoable.value;
  if (!undo || undo.cascaded.length === 0) return null;
  const inLevel = new Set(ids);
  const here = undo.cascaded.filter((id) => inLevel.has(id));
  if (here.length === 0) return null;
  const byId = new Map(names.proposal.changes.map((c) => [c.id, c]));
  const titles = here
    .slice(0, TOGETHER_NAMES)
    .map((id) => byId.get(id))
    .filter((c): c is Change => c !== undefined)
    .map((c) => changeTitle(names, c));
  const rest = here.length - titles.length;
  const key =
    undo.state === 'accepted'
      ? 'review.panel.together.accepted'
      : undo.state === 'rejected'
        ? 'review.panel.together.rejected'
        : 'review.panel.together.cleared';
  return (
    <Notice
      tone="info"
      size="sm"
      icon="link"
      actions={
        <Button size="sm" onClick={() => void review.undoLastDecision()}>
          {t('review.undo')}
        </Button>
      }
    >
      <span>
        {t(key, {
          count: here.length,
          names:
            titles.join(', ') +
            (rest > 0 ? ` ${t('review.panel.more', { count: rest })}` : ''),
        })}
      </span>
    </Notice>
  );
}

/** Proposta aplicada (só para ver) ou substituída (com "Abrir a nova"). */
function ProposalStatusNotice({ names }: { readonly names: ReviewNames }) {
  const { review } = useEditor();
  const p = names.proposal;
  if (p.status === 'applied') {
    const at = Object.values(p.applied)
      .map((a) => a.at)
      .sort()
      .at(-1);
    return (
      <Notice tone="info" size="sm">
        <span>
          {t('review.panel.closedNotice', {
            date: at ? formatFullDate(at, locale.value) : '',
          })}
        </span>
      </Notice>
    );
  }
  if (p.status !== 'superseded') return null;
  const by = review.derived.supersession.value?.by ?? null;
  return (
    <Notice
      tone="warning"
      size="sm"
      title={t('review.superseded.title')}
      actions={by && <OpenNewer id={by.id} title={by.title} />}
    >
      <span>{t('review.superseded.text')}</span>
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Selos da identidade e decisão de uma mudança inteira

/** Selos embaixo do nome do item: criada, será removida, trancada e bloqueia aplicar. */
export function IdentityFlags({
  target,
  whole,
}: {
  readonly target: ReviewTarget;
  readonly whole: Change | null;
}) {
  const { review } = useEditor();
  const d = review.derived;
  const ids = d.tree.value?.changeIdsOf(target) ?? [];
  const situation = d.situation.value;
  const invalid = d.invalid.value;
  const locked = ids.some((id) => situation.get(id)?.locked === true);
  const blocks = ids.some((id) => invalid.changeIds.has(id) || invalid.related.has(id));
  return (
    <>
      {whole?.kind === 'create' && (
        <Flag icon="plus">{t('review.panel.createdByProposal')}</Flag>
      )}
      {whole?.kind === 'remove' && (
        <Flag icon="minus">{t('review.panel.willBeRemoved')}</Flag>
      )}
      {locked && (
        <Flag icon="lock" title={t('review.lockedItem')}>
          {t('review.flag.locked')}
        </Flag>
      )}
      {blocks && (
        <Flag tone="danger" icon="blocked">
          {t('review.panel.blocksApply')}
        </Flag>
      )}
    </>
  );
}

/** ✓ ✕ da criação ou remoção de uma entidade inteira (uma anotação), no cabeçalho dela. */
export function WholeDecision({ change }: { readonly change: Change }) {
  const { review } = useEditor();
  const openMark = useContext(OpenMarkContext);
  const names = useReviewNames();
  const decide = useDecide();
  if (!names) return null;
  const p = names.proposal;
  const applied = review.derived.situation.value.get(change.id)?.applied === true;
  return (
    <DecisionControl
      value={p.decisions[change.id]?.state ?? null}
      name={changeTitle(names, change)}
      disabled={p.status !== 'open' || applied}
      disabledReason={applied ? t('review.appliedReason') : t('review.closedReason')}
      onDecide={(state) => decide({ level: 'change', id: change.id }, state)}
      onDecidedByKeyboard={(control) =>
        review.requestControlFocus(change.id, 'card', control)
      }
      takeFocus={() => review.takeControlFocus(change.id, 'card')}
      onRejectedByMouse={() => {
        // A nota sugerida mora no popover da mudança: o pedido vai ao store e o popover
        // abre (o cartão pode ser trocado pela rejeição; o novo cumpre o pedido ao montar).
        review.requestNote(change.id);
        if (openMark) openMark.value = `${change.id}|`;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// O cabeçalho

interface ReviewHeaderProps {
  /** O nível decidido pelo cabeçalho: a proposta, o grupo Projeto, uma imagem ou um item. */
  readonly target: ReviewTarget;
  /** Criação ou remoção da entidade inteira (do índice por campo), se houver. */
  readonly whole?: Change | null;
}

export function ReviewHeader({ target, whole = null }: ReviewHeaderProps) {
  const { review } = useEditor();
  const names = useReviewNames();
  const decide = useDecide();
  const [noteShown, setNoteShown] = useState(false);
  const [noteFocus, setNoteFocus] = useState(0);
  const reasonId = useId();
  const hasNote = useHasNote(target);
  const d = review.derived;
  const tree = d.tree.value;
  const p = d.proposal.value;
  if (!names || !tree || !p) return null;

  const key = reviewKey(target);
  const ids = tree.changeIdsOf(target);
  const summary =
    target.level === 'change' ? summarizeDecisions(p, ids) : d.levels.value.get(key);
  const open = p.status === 'open';
  const state = summary?.state ?? 'undecided';
  const value: DecisionValue =
    state === 'accepted' || state === 'rejected' ? state : null;
  const locked = ids.some((id) => d.situation.value.get(id)?.locked === true);
  const variant = headerVariant(target, whole);
  const action = actionVariant(variant);
  const name = targetName(names, target);
  const disabled = !open || (summary != null && summary.applied === summary.total);
  const rejected = (summary?.rejected ?? 0) > 0;
  const reason = !open ? t('review.closedReason') : t('review.appliedReason');

  return (
    <section class="review-header" aria-label={t('review.details.decision')}>
      <ProposalStatusNotice names={names} />
      <div class="review-header-state">
        <DecisionMark state={state} counts={summary ?? undefined} />
        <b>{t(`review.header.kind.${variant}`)}</b>
        {summary && (
          <span class="muted">
            {t('proposals.progressLabel', {
              accepted: summary.accepted,
              rejected: summary.rejected,
              undecided: summary.undecided,
            })}
          </span>
        )}
      </div>
      <div class="review-header-actions">
        <DecisionControl
          variant="text"
          value={value}
          name={name}
          acceptText={t(`review.header.accept.${action}`)}
          rejectText={t(`review.header.reject.${action}`)}
          disabled={disabled}
          disabledReason={reason}
          describedBy={reasonId}
          onDecide={(next) => decide(target, next)}
        />
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
      </div>
      {disabled && (
        <p class="review-hint muted" id={reasonId}>
          {reason}
        </p>
      )}
      {whole?.kind === 'create' && target.level !== 'proposal' && (
        <CreationInfo names={names} target={target} ids={ids} />
      )}
      {whole?.kind === 'remove' && (
        <RemovalList names={names} target={target} ids={ids} />
      )}
      <NoteField
        target={target}
        show={noteShown}
        focusSeq={noteFocus}
        onHide={() => setNoteShown(false)}
      />
      {ids.length > 1 && (
        <p class="review-hint muted">
          {t('review.details.decideHint', { count: ids.length })}
        </p>
      )}
      {rejected && <p class="review-hint muted">{t('review.note.suggested')}</p>}
      <IssueNotices target={target} ids={ids} open={open} />
      {locked && (
        <Notice tone="warning" size="sm" icon="lock" title={t('review.locked.title')}>
          <span>{t('review.locked.text')}</span>
        </Notice>
      )}
      <TogetherNotice names={names} ids={ids} />
    </section>
  );
}
