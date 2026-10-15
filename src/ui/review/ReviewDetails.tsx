import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  projectIndex,
  reviewKey,
  type ProposalIssue,
  type ProposalNote,
  type ReviewTarget,
} from '../../model';
import { Button, IconButton, TextArea } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon, type IconName } from '../icons';
import { markingPath } from '../labels';
import { Notice } from '../Notice';
import { ChangeCard } from './ChangeCard';
import { changeKindLabel } from './ChangeKind';
import {
  entityKindOf,
  entityLabel,
  entityName,
  imageName,
  markingName,
  targetName,
  type ReviewNames,
} from './changeText';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { Flag } from './Flag';
import { replaceChangeOf } from './ReviewCanvasControls';
import { useDecide, useReviewNames, useReviewNavigate } from './useReview';
import { useReviewCommands } from './useReviewCommands';

// Detalhes na revisão (HANDOFF-PROPOSALS 5.2 e, desde a fase 9.5, HANDOFF-REVIEW-DETAILS):
// o nível selecionado com a decisão de três estados, os avisos e as notas. Imagem, item e
// mudança de um item mostram o painel normal (`ReviewItemPanel`) entre a decisão e as
// notas; a proposta e o grupo Projeto continuam com um ChangeCard por mudança até a 9.6.

/** Até quantos cartões desenhar de uma vez (uma imagem grande pode ter centenas). */
const MAX_CARDS = 60;

const LEVEL_ICONS: Readonly<Record<ReviewTarget['level'], IconName>> = {
  proposal: 'proposal',
  project: 'settings',
  image: 'image',
  item: 'marking',
  change: 'changed',
};

/** Caminho legível do nível ("Checkout › Rodapé › Botão Pagar"). */
function levelPath(names: ReviewNames, target: ReviewTarget): string | null {
  const project = names.preview ?? names.current;
  if (target.level === 'item' && target.id) {
    const marking =
      projectIndex(project).markings.get(target.id) ??
      projectIndex(names.current).markings.get(target.id);
    if (!marking) return null;
    return [imageName(names, marking.imageId), markingPath(project, marking)].join(
      t('marking.pathSeparator'),
    );
  }
  if (target.level === 'change' && target.id) {
    const c = names.proposal.changes.find((x) => x.id === target.id);
    if (c?.markingId) {
      return [imageName(names, c.imageId ?? ''), markingName(names, c.markingId)].join(
        t('marking.pathSeparator'),
      );
    }
    if (c?.imageId) return imageName(names, c.imageId);
    return t('review.level.project');
  }
  return null;
}

/** O tipo da entidade em minúsculas ("camada"), para o texto do problema. */
const kindText = (kind: Parameters<typeof entityLabel>[0]) =>
  entityLabel(kind).toLocaleLowerCase();

/**
 * Texto de um problema do conjunto aceito. Cita a entidade pelo nome (marcação, imagem,
 * camada, anotação, especialização), nunca pelo id; sem nome em lugar nenhum, pelo tipo.
 */
function issueText(names: ReviewNames, issue: ProposalIssue): string {
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

function NoteEditor({
  note,
  onSave,
  onRemove,
}: {
  readonly note: ProposalNote;
  readonly onSave: (text: string) => void;
  readonly onRemove: () => void;
}) {
  const [text, setText] = useState(note.text);
  return (
    <div class="review-note">
      <TextArea
        aria-label={t('review.note.edit')}
        value={text}
        onInput={setText}
        onCommit={(value) => {
          if (value !== note.text) onSave(value);
        }}
      />
      <div class="review-note-actions">
        <span class="muted">{t('review.note.saveHint')}</span>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          {t('review.note.remove')}
        </Button>
      </div>
    </div>
  );
}

/** Notas de qualquer nível; numa rejeição a nota é sugerida, nunca obrigatória. */
function Notes({
  target,
  suggest,
}: {
  readonly target: ReviewTarget;
  readonly suggest: boolean;
}) {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  const [draft, setDraft] = useState('');
  const notes = review.derived.notes.value.get(reviewKey(target)) ?? [];
  const open = review.derived.proposal.value?.status === 'open';
  const check = (result: { ok: boolean; error?: unknown } | null) => {
    if (result && !result.ok && typeof result.error === 'string') {
      report(result.error as Parameters<typeof report>[0]);
    }
  };
  return (
    <section class="review-notes" aria-label={t('review.note.title')}>
      <h3 class="review-section-title">
        <Icon name="note" />
        {t('review.note.title')}
        <span class="muted">
          {suggest ? t('review.note.suggested') : t('review.note.optional')}
        </span>
      </h3>
      {notes.map((note) => (
        <NoteEditor
          key={note.id}
          note={note}
          onSave={(text) => void review.editNote(note.id, text).then(check)}
          onRemove={() => void review.removeNote(note.id).then(check)}
        />
      ))}
      {open && (
        <div class="review-note">
          <TextArea
            aria-label={t('review.note.new')}
            placeholder={t('review.note.placeholder')}
            value={draft}
            onInput={setDraft}
          />
          <div class="review-note-actions">
            <Button
              size="sm"
              disabled={draft.trim() === ''}
              onClick={() =>
                void review.addNote(target, draft).then((result) => {
                  check(result);
                  if (result?.ok) setDraft('');
                })
              }
            >
              <Icon name="note" />
              {t('review.note.add')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Detalhes na revisão sem painel normal: a proposta, o grupo Projeto e as mudanças sem
 * item (camadas, especializações, repositórios). Também o estado vazio.
 */
export function ReviewDetails() {
  const { review } = useEditor();
  const target = review.selected.value;
  if (!review.derived.tree.value || !review.derived.proposal.value) return null;
  if (!target) {
    return (
      <div class="review-details review-details-empty">
        <p class="muted">{t('review.details.empty')}</p>
      </div>
    );
  }
  return <ReviewLevel target={target} />;
}

interface ReviewLevelProps {
  readonly target: ReviewTarget;
  /**
   * O painel normal do item (fase 9.5): entra entre a decisão do nível e as notas, e a
   * decisão de uma mudança selecionada fica no bloco (sem ela, os cartões a trazem).
   */
  readonly panel?: ComponentChildren;
  /**
   * Com `panel`: as mudanças do item sem campo no painel (origem, trava, troca de imagem,
   * posição da imagem), que continuam em cartões sob "Outras mudanças" até a fase 9.6.
   */
  readonly otherIds?: readonly string[];
}

/**
 * Um nível da revisão (HANDOFF-PROPOSALS 5.2): a decisão de três estados e "Aceitar/
 * Rejeitar item", os avisos (item trancado, aplicar bloqueado), os cartões das mudanças
 * (ou o painel normal do item, com os cartões só do que não tem campo) e as notas. Nada
 * aqui calcula regra: tudo vem do derivado.
 */
export function ReviewLevel({ target, panel, otherIds }: ReviewLevelProps) {
  const { review, ui } = useEditor();
  const names = useReviewNames();
  const decide = useDecide();
  const navigate = useReviewNavigate();
  const d = review.derived;
  const tree = d.tree.value;
  const p = d.proposal.value;
  if (!names || !tree || !p) return null;

  const withPanel = panel !== undefined;
  const key = reviewKey(target);
  const ids = tree.changeIdsOf(target);
  const changes = new Map(p.changes.map((c) => [c.id, c]));
  const situation = d.situation.value;
  const invalid = d.invalid.value;
  const types = d.changeTypes.value;
  const fresh = review.newConflicts.value;
  const together = new Set(review.undoable.value?.cascaded ?? []);
  const comparison = d.supersession.value?.comparison ?? null;
  const open = p.status === 'open';
  const isChange = target.level === 'change';
  const summary = isChange ? null : d.levels.value.get(key);
  const decisionOf = (id: string): DecisionValue => p.decisions[id]?.state ?? null;
  const levelState = isChange
    ? (decisionOf(target.id ?? '') ?? 'undecided')
    : (summary?.state ?? 'undecided');
  const type = isChange ? types.get(target.id ?? '') : d.levelTypes.value.get(key);
  const locked = ids.some((id) => situation.get(id)?.locked === true);
  const anyInvalid = ids.some(
    (id) => invalid.changeIds.has(id) || invalid.related.has(id),
  );
  const issues = (d.validation.value?.issues ?? []).filter(
    (issue) =>
      target.level === 'proposal' ||
      issue.changeIds.some((id) => ids.includes(id)) ||
      issue.related.some((id) => ids.includes(id)),
  );
  const created = ids.some((id) => {
    const c = changes.get(id);
    return (
      c?.kind === 'create' &&
      ((target.level === 'item' && c.entity === 'marking' && c.entityId === target.id) ||
        (target.level === 'image' && c.entity === 'image' && c.entityId === target.id))
    );
  });
  const name = targetName(names, target);
  const path = levelPath(names, target);
  const levelValue: DecisionValue =
    levelState === 'accepted' || levelState === 'rejected' ? levelState : null;
  const closedReason = open ? undefined : t('review.closedReason');
  const changeSituation = isChange ? situation.get(target.id ?? '') : undefined;
  const decisionDisabled = isChange
    ? !open || changeSituation?.applied === true
    : !open || (summary != null && summary.applied === summary.total);
  const decisionReason = changeSituation?.applied
    ? t('review.appliedReason')
    : closedReason;
  const cardIds = withPanel ? (otherIds ?? []) : ids;
  const shown = cardIds.slice(0, MAX_CARDS);
  // A nota é sugerida numa rejeição: a própria mudança rejeitada ou alguma rejeitada no
  // nível ("parcial" só por aceitas e pendentes não é rejeição; fase 8.2, P8).
  const rejectedLevel = isChange
    ? levelState === 'rejected'
    : (summary?.rejected ?? 0) > 0;
  // Sem o painel, a mudança selecionada é decidida no próprio cartão.
  const showDecision = !isChange || withPanel;

  return (
    <div class={withPanel ? 'review-details review-details-panel' : 'review-details'}>
      <header class="review-details-head">
        <div class="review-details-name">
          <Icon name={LEVEL_ICONS[target.level]} />
          <h3 title={name}>{name}</h3>
        </div>
        {path && <p class="muted review-details-path">{path}</p>}
        <div class="review-details-flags">
          {locked && (
            <Flag icon="lock" title={t('review.lockedItem')}>
              {t('review.flag.locked')}
            </Flag>
          )}
          {type && !isChange && (
            <Flag>
              {t('review.details.typeCount', {
                type: changeKindLabel(type),
                count: ids.length,
              })}
            </Flag>
          )}
          {/* Com o painel, a identidade do item já diz "Criada pela proposta". */}
          {created && !withPanel && <Flag>{t('review.details.created')}</Flag>}
          {anyInvalid && (
            <Flag tone="danger" icon="blocked">
              {t('review.details.blocks')}
            </Flag>
          )}
        </div>
      </header>

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
                  {t('review.issue.acceptMissing', { count: issue.related.length })}
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
                  {t('review.issue.rejectCause', { count: issue.changeIds.length })}
                </Button>
              )}
            </>
          }
        >
          <span>{issueText(names, issue)}</span>
        </Notice>
      ))}

      {showDecision && (
        <section class="review-decision" aria-label={t('review.details.decision')}>
          <div class="review-decision-state">
            <DecisionMark state={levelState} counts={summary ?? undefined} />
            <b>{t(`review.details.state.${levelState}`)}</b>
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
          <DecisionControl
            variant="text"
            value={levelValue}
            name={name}
            conflict={changeSituation?.conflict === true}
            acceptText={t(`review.details.accept.${target.level}`)}
            rejectText={t(`review.details.reject.${target.level}`)}
            disabled={decisionDisabled}
            disabledReason={decisionReason}
            onDecide={(state) => decide(target, state)}
          />
          {!isChange && (
            <p class="change-card-hint">
              {t('review.details.decideHint', { count: ids.length })}
            </p>
          )}
        </section>
      )}

      {locked && (
        <Notice tone="warning" size="sm" icon="lock" title={t('review.locked.title')}>
          <span>{t('review.locked.text')}</span>
        </Notice>
      )}

      {panel}

      {cardIds.length > 0 && (
        <section
          class="review-cards"
          aria-label={
            withPanel ? t('review.panel.otherChanges') : t('review.details.changes')
          }
        >
          <h3 class="review-section-title">
            <Icon name="changed" />
            {withPanel ? t('review.panel.otherChanges') : t('review.details.changes')}
            <span class="muted">
              {withPanel
                ? t('review.panel.changes', { count: cardIds.length })
                : t('review.details.changeCount', { count: ids.length })}
            </span>
          </h3>
          {shown.map((id) => {
            const c = changes.get(id);
            if (!c) return null;
            const s = situation.get(id);
            const replaced =
              c.entity === 'image' &&
              c.field === 'file' &&
              replaceChangeOf(p, c.entityId);
            return (
              <ChangeCard
                key={id}
                change={c}
                names={names}
                type={types.get(id) ?? null}
                decision={decisionOf(id)}
                situation={s}
                newConflict={fresh.has(id)}
                invalid={invalid.changeIds.has(id)}
                together={together.has(id)}
                comparison={comparison?.get(id) ?? null}
                disabled={!open || s?.applied === true}
                disabledReason={s?.applied ? t('review.appliedReason') : closedReason}
                selected={isChange && target.id === id}
                onDecide={(state) => decide({ level: 'change', id }, state)}
                onSelect={() => navigate({ level: 'change', id })}
                onCompare={
                  replaced ? () => (ui.compareImage.value = c.entityId) : undefined
                }
              />
            );
          })}
          {cardIds.length > shown.length && (
            <p class="muted">
              {t('review.details.more', { count: cardIds.length - shown.length })}
            </p>
          )}
        </section>
      )}

      <Notes target={target} suggest={rejectedLevel} />
      {target.level === 'change' && !withPanel && (
        <IconButton
          icon="arrowUp"
          label={t('review.details.up')}
          text={t('review.details.up')}
          onClick={() => {
            const c = changes.get(target.id ?? '');
            if (!c) return;
            navigate(
              c.markingId
                ? { level: 'item', id: c.markingId }
                : c.imageId
                  ? { level: 'image', id: c.imageId }
                  : { level: 'project', id: null },
              false,
            );
          }}
        />
      )}
    </div>
  );
}
