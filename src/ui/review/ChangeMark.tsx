import { signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext, useEffect, useId, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { tokenValue } from '../../theme/tokens';
import { classes } from '../controls/classes';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Popover } from '../Popover';
import {
  ChangePopover,
  markFieldLabel,
  markGlyph,
  markSides,
  markType,
  popoverTitle,
  type MarkSubject,
} from './ChangePopover';
import { entityName, type ReviewNames } from './changeText';
import { DecisionMark } from './DecisionMark';
import { useReviewNames } from './useReview';

// Marcador do campo alterado (HANDOFF-REVIEW-DETAILS 2.1 e 4, fase 9.5): uma peça de 18 px
// com o tipo à esquerda (o glifo do ChangeKind) e a decisão à direita (a forma do
// DecisionMark); conflito com ⚠ em âmbar; parte de uma criação ou remoção só com o tipo,
// tracejada. É um botão que abre o `ChangePopover` no `Popover` da app: pelo hover, com
// `duration-hover-intent`; pelo foco, na hora; o clique (ou Enter) fixa. Esc e o clique
// fora fecham e devolvem o foco ao marcador; um aberto por vez (`OpenMarkContext`).

/** Qual marcador está aberto (a chave dele) num painel; um por vez. */
export const OpenMarkContext = createContext<Signal<string | null> | null>(null);

/** O estado "qual marcador está aberto" de um painel. */
export function createOpenMark(): Signal<string | null> {
  return signal<string | null>(null);
}

/** Milissegundos de um token de duração (`300ms` → 300). */
function ms(token: string): number {
  return Number.parseInt(tokenValue(token, 'light'), 10);
}

/** Como o popover abriu: o hover fecha ao sair; o foco, ao sair o foco; o clique fixa. */
type OpenMode = 'hover' | 'focus' | 'pinned';

/** Nome acessível do marcador (HANDOFF-REVIEW-DETAILS 7). */
function markLabel(
  names: ReviewNames,
  subject: MarkSubject,
  extra: {
    readonly state: 'undecided' | 'accepted' | 'rejected';
    readonly conflict: boolean;
    readonly invalid: boolean;
    readonly together: boolean;
    readonly applied: boolean;
    readonly current: string;
    readonly proposed: string;
  },
): string {
  const field = markFieldLabel(names, subject);
  if (subject.part) {
    const entity = entityName(names, subject.change.entityId) ?? '';
    const head = t(
      subject.change.kind === 'create'
        ? 'review.mark.part.create'
        : 'review.mark.part.remove',
      { field, entity },
    );
    const value = subject.change.kind === 'create' ? extra.proposed : extra.current;
    const side =
      subject.change.kind === 'create'
        ? t('review.pop.proposed')
        : t('review.diff.current');
    return `${head}. ${side}: ${value}`;
  }
  const facts = [
    t(`review.mark.state.${extra.state}`),
    extra.conflict ? t('review.mark.conflict') : null,
    extra.together ? t('review.mark.together') : null,
    extra.applied ? t('review.mark.applied') : null,
    extra.invalid ? t('review.mark.invalid') : null,
  ].filter((s) => s !== null);
  const head = t('review.mark.label', {
    field,
    kind: t(`review.mark.kind.${markType(subject)}`),
    state: facts.join(', '),
  });
  return `${head} ${t('review.mark.values', {
    current: extra.current,
    proposed: extra.proposed,
  })}`;
}

const partsText = (parts: readonly { text: string }[]) =>
  parts.map((p) => p.text).join('');

export function ChangeMark(subject: MarkSubject) {
  const { change, field, part } = subject;
  const { review } = useEditor();
  const names = useReviewNames();
  const openMark = useContext(OpenMarkContext);
  const [mode, setMode] = useState<OpenMode>('focus');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const host = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!names || !openMark) return null;

  const key = `${change.id}|${field}`;
  const open = openMark.value === key;
  const show = (next: OpenMode) => {
    clearTimeout(timer.current);
    if (openMark.peek() !== key) setMode(next);
    openMark.value = key;
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (openMark.peek() === key) openMark.value = null;
  };

  const d = review.derived;
  const situation = d.situation.value.get(change.id);
  const decision = names.proposal.decisions[change.id]?.state ?? null;
  const conflict = !part && situation?.conflict === true;
  const invalid = !part && d.invalid.value.changeIds.has(change.id);
  const together = !part && review.undoable.value?.cascaded.includes(change.id) === true;
  const applied = situation?.applied === true;
  const type = markType(subject);
  const sides = markSides(names, subject, situation);
  const label = markLabel(names, subject, {
    state: decision ?? 'undecided',
    conflict,
    invalid,
    together,
    applied,
    current: partsText(sides.current),
    proposed: partsText(sides.proposed),
  });
  const glyph = conflict ? 'warning' : together ? 'link' : markGlyph(type);

  return (
    <span
      class="change-mark-host"
      ref={host}
      onMouseEnter={() => {
        clearTimeout(timer.current);
        if (openMark.peek() === key) return;
        timer.current = setTimeout(() => show('hover'), ms('duration-hover-intent'));
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        if (openMark.peek() !== key || mode !== 'hover') return;
        timer.current = setTimeout(hide, ms('duration-base'));
      }}
      onFocusOut={(e) => {
        // O foco saiu do marcador e do popover para outro lugar (Tab depois do último).
        const next = e.relatedTarget;
        if (next instanceof Node && !host.current?.contains(next)) hide();
      }}
    >
      <Popover
        open={open}
        onOpenChange={(next) => (next ? show('pinned') : hide())}
        id={panelId}
        panelClass="change-popover"
        scroll="follow"
        label={popoverTitle(names, subject)}
        trigger={() => (
          <button
            type="button"
            class={classes(
              'change-mark',
              part && 'is-part',
              conflict && 'is-conflict',
              invalid && 'is-invalid',
              open && 'is-open',
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={label}
            data-change={change.id}
            data-state={part ? undefined : (decision ?? 'undecided')}
            onFocus={() => {
              if (openMark.peek() !== key) show('focus');
            }}
            onClick={() => {
              // Clique ou Enter fixa o popover aberto; de novo, fecha.
              if (openMark.peek() === key && mode === 'pinned') hide();
              else {
                show('pinned');
                setMode('pinned');
              }
            }}
          >
            <Icon name={glyph} />
            {!part && <DecisionMark state={decision ?? 'undecided'} decorative />}
          </button>
        )}
      >
        <ChangePopover subject={subject} />
      </Popover>
    </span>
  );
}
