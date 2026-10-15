import { computed, signal, type Signal } from '@preact/signals';
import { createContext } from 'preact';
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { t } from '../../i18n';
import { reviewKey } from '../../model';
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
// fora fecham e devolvem o foco ao marcador; um aberto por vez (`OpenMarkContext`). Focar
// o marcador seleciona aquela mudança na revisão (fase 9.6): A, R e Backspace decidem o
// campo focado, e a linha da mudança acende na janela Propostas.

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
    readonly note: boolean;
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
    extra.note ? t('review.mark.withNote') : null,
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
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);

  // A mudança selecionada na janela Propostas: o marcador rola até si e, num clique ou Enter
  // na lista (`review.requestMark`), recebe o foco (o popover abre pelo foco). Pelas setas só
  // rola e destaca. No commit que desenha o marcador, ainda que a seção que o esconde tenha
  // acabado de abrir (modelo de foco da etapa 8: o dono do elemento cumpre o pedido).
  // Um computed por marcador: mudar a seleção refaz só o que deixa e o que passa a ser o alvo.
  const targetSignal = useMemo(
    () =>
      computed(() => {
        const now = review.selected.value;
        return !part && now?.level === 'change' && now.id === change.id;
      }),
    [review, change.id, part],
  );
  const isTarget = targetSignal.value;
  const request = isTarget ? review.markRequest.value : null;
  const asked = request?.changeId === change.id ? request.seq : 0;
  useLayoutEffect(() => {
    if (!isTarget) return;
    button.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isTarget]);
  useLayoutEffect(() => {
    if (asked === 0) return;
    review.clearMarkRequest();
    button.current?.focus({ preventScroll: true });
    // Cada pedido vale uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
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
    if (openMark.peek() === key) {
      openMark.value = null;
      // Fechado, o pedido da nota sugerida (rejeitar com o mouse) não vale mais.
      review.clearNoteRequest();
    }
  };

  const d = review.derived;
  const situation = d.situation.value.get(change.id);
  const target = isTarget;
  const hasNote = d.notes.value.has(reviewKey({ level: 'change', id: change.id }));
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
    note: hasNote,
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
            ref={button}
            type="button"
            class={classes(
              'change-mark',
              part && 'is-part',
              conflict && 'is-conflict',
              invalid && 'is-invalid',
              open && 'is-open',
              target && 'is-target',
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={label}
            aria-current={target ? 'true' : undefined}
            aria-keyshortcuts="A R Backspace"
            data-change={change.id}
            data-part={part ? '' : undefined}
            data-state={part ? undefined : (decision ?? 'undecided')}
            onFocus={() => {
              if (openMark.peek() !== key) show('focus');
              // Focar o marcador seleciona a mudança: os atalhos agem sobre ela.
              const now = review.selected.peek();
              if (!(now?.level === 'change' && now.id === change.id)) {
                review.select({ level: 'change', id: change.id });
              }
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
        {(close) => <ChangePopover subject={subject} close={close} />}
      </Popover>
    </span>
  );
}
