import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { reviewKey, type ProposalNote, type ReviewTarget } from '../../model';
import { TextArea } from '../controls';
import { useEditor } from '../EditorContext';
import { useReviewCommands } from './useReviewCommands';

// Nota para o agente (HANDOFF-REVIEW-DETAILS 5.5, fase 9.6): um campo de texto que grava ao
// sair dele, no cabeçalho do item (a nota do item) e no popover de uma mudança (a nota da
// mudança). Texto vazio apaga a nota; num campo novo que fica vazio, o campo some. As
// decisões e as notas moram na proposta: nada aqui guarda estado fora dela.

interface NoteAreaProps {
  readonly target: ReviewTarget;
  readonly note: ProposalNote | null;
  readonly readOnly: boolean;
  /** Cada valor novo leva o foco ao campo (o botão de nota, a rejeição pelo mouse). */
  readonly focusSeq: number;
  /** O campo foi gravado e saiu: `empty` quando ficou sem texto. */
  readonly onSettled: (empty: boolean) => void;
}

function NoteArea({ target, note, readOnly, focusSeq, onSettled }: NoteAreaProps) {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  const [text, setText] = useState(note?.text ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  // O campo sai do DOM com o foco dentro (a decisão troca o cartão e remonta o popover): o
  // navegador dispara o `blur` na remoção, e esse não é "a pessoa saiu do campo". Gravar o
  // texto vale; esconder o campo e apagar o pedido da nota sugerida não, senão o campo novo
  // (que cumpre o pedido ao montar) nasce sem pedido. O cleanup roda antes de o DOM sair.
  const leaving = useRef(false);
  useLayoutEffect(
    () => () => {
      leaving.current = true;
    },
    [],
  );
  // O foco vai ao campo no commit que o desenha, nunca depois (modelo de foco da etapa 8).
  useLayoutEffect(() => {
    if (focusSeq > 0) area.current?.focus();
  }, [focusSeq]);
  const check = (result: { ok: boolean; error?: unknown } | null) => {
    if (result && !result.ok && typeof result.error === 'string') {
      report(result.error as Parameters<typeof report>[0]);
    }
  };
  const commit = (value: string) => {
    if (readOnly) return;
    const empty = value.trim() === '';
    if (note) {
      if (empty) void review.removeNote(note.id).then(check);
      else if (value !== note.text) void review.editNote(note.id, value).then(check);
    } else if (!empty) {
      void review.addNote(target, value).then(check);
    }
    if (!leaving.current) onSettled(empty);
  };
  return (
    <TextArea
      aria-label={t('review.note.edit')}
      placeholder={t('review.note.placeholder')}
      textAreaRef={area}
      rows={2}
      value={text}
      readOnly={readOnly}
      onInput={setText}
      onCommit={commit}
    />
  );
}

interface NoteFieldProps {
  readonly target: ReviewTarget;
  /** O campo foi aberto pelo botão de nota (mesmo sem nota ainda). */
  readonly show: boolean;
  readonly focusSeq: number;
  /** Um campo novo que ficou vazio, ou uma nota apagada: quem abriu o esconde. */
  readonly onHide: () => void;
}

/** As notas do alvo (e um campo novo, se `show`); nada se não há o que mostrar. */
export function NoteField({ target, show, focusSeq, onHide }: NoteFieldProps) {
  const { review } = useEditor();
  const notes = review.derived.notes.value.get(reviewKey(target)) ?? [];
  const open = review.derived.proposal.value?.status === 'open';
  if (notes.length === 0 && !(show && open)) return null;
  const list: readonly (ProposalNote | null)[] = notes.length > 0 ? notes : [null];
  return (
    <div class="review-note-field">
      {list.map((note, i) => (
        <NoteArea
          key={note?.id ?? 'new'}
          target={target}
          note={note}
          readOnly={!open}
          focusSeq={i === 0 ? focusSeq : 0}
          onSettled={(empty) => {
            if (empty) onHide();
          }}
        />
      ))}
      {open && <small class="muted">{t('review.note.saveHint')}</small>}
    </div>
  );
}

/** A mudança ou o nível tem nota? (o botão de nota fica marcado) */
export function useHasNote(target: ReviewTarget): boolean {
  const { review } = useEditor();
  return (review.derived.notes.value.get(reviewKey(target))?.length ?? 0) > 0;
}
