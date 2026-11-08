import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  type Annotation,
  type Backlink,
  type JsonValue,
  type Project,
  type SpecSimpleColumn,
  refPathText,
} from '../model';
import type { ActionResult } from '../store/history';
import type { AnnotationLocation } from '../store/ui';
import { Segmented, Select, TextArea, TextField } from './controls';
import { markingLabel } from './labels';
import { mergeLinkedItems, type SuggestionItem } from './suggestions';
import { annotationSourceLabel } from './typedText';

// Peças comuns dos campos tipados: o editor de um valor simples (campo ou célula de
// tabela) e a lista de referências recebidas.

/** Botões segmentados até este número de opções; acima, lista. */
const SEGMENTED_MAX = 3;

export interface FieldContext {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

function valueText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Lê o número digitado (aceita vírgula decimal); `undefined` = inválido. */
export function parseNumberInput(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Um texto com quebra de linha, ou mais comprido que isto, abre no editor de várias linhas. */
export const MULTILINE_MIN_LENGTH = 60;
const MULTILINE_ROWS = 4;

/** Ignora a quebra de linha do Enter que ainda está em curso (até o `keyup` dele). */
function swallowEnterOnce(el: HTMLTextAreaElement) {
  const block = (e: Event) => {
    if (
      e instanceof InputEvent &&
      e.inputType.startsWith('insert') &&
      e.inputType !== 'insertText'
    )
      e.preventDefault();
  };
  const stop = () => {
    el.removeEventListener('beforeinput', block);
    el.removeEventListener('keyup', stop);
  };
  el.addEventListener('beforeinput', block);
  el.addEventListener('keyup', stop);
  setTimeout(stop, 0);
}

interface MultilineProps {
  readonly id: string | undefined;
  readonly label: string;
  /** O valor atual do projeto: o que o campo mostra enquanto a pessoa não editou. */
  readonly initial: string;
  /** Rascunho que já nasce editado (o que foi digitado antes da troca por Shift+Enter). */
  readonly startText?: string;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  /** Foca ao montar, com o cursor no fim (a troca por Shift+Enter). */
  readonly autoFocus: boolean;
  /** O foco veio no meio de um Enter: a quebra desse mesmo Enter não entra no campo novo. */
  readonly swallowBreak?: boolean;
  readonly onCommit: (text: string) => void;
  /** Avisa que o Enter gravou (o pai cuida do foco se o editor trocar). */
  readonly onEnterCommit?: () => void;
}

/**
 * Texto em várias linhas: sair do campo grava. Enquanto o texto não tem quebra, o Enter também
 * grava (como no campo de uma linha) e o Shift+Enter quebra; com uma quebra, o Enter quebra.
 */
function MultilineEditor({
  id,
  label,
  initial,
  startText,
  readOnly,
  invalid,
  required,
  autoFocus,
  swallowBreak = false,
  onCommit,
  onEnterCommit,
}: MultilineProps) {
  // Rascunho + o valor do projeto sobre o qual foi digitado: se o projeto mudou por fora
  // (desfazer, recarga) ou nada foi editado, o campo mostra o valor atual do projeto.
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(
    startText === undefined ? null : { base: initial, text: startText },
  );
  const current =
    draft !== null && draft.base === initial && draft.text !== initial
      ? draft.text
      : initial;
  const area = useRef<HTMLTextAreaElement>(null);
  // Foco e cursor no fim só ao montar: renderizar por digitação não os move.
  useLayoutEffect(() => {
    const el = area.current;
    if (el === null || !autoFocus) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    if (swallowBreak) swallowEnterOnce(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TextArea
      id={id}
      aria-label={label}
      aria-required={required}
      rows={MULTILINE_ROWS}
      disabled={readOnly}
      invalid={invalid}
      value={current}
      onInput={(text) => setDraft({ base: initial, text })}
      onCommit={(text) => {
        // Sair sem editar não grava (nem o valor velho por cima de um valor novo).
        if (text !== initial) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || readOnly) return;
        if (e.currentTarget.value.includes('\n')) return;
        e.preventDefault();
        onEnterCommit?.();
        onCommit(e.currentTarget.value);
      }}
      textAreaRef={area}
    />
  );
}

/**
 * Editor de um campo `string` da anotação: uma linha; abre em várias linhas quando o texto já
 * tem quebra ou passa de `MULTILINE_MIN_LENGTH`, ou quando a pessoa aperta Shift+Enter (o que
 * foi digitado segue, com a quebra). Só nos campos da anotação: a célula de tabela continua
 * de uma linha.
 */
export function StringEditor(props: SimpleEditorProps) {
  const { field, value, label, readOnly, id, invalid = false, onSet } = props;
  const text = valueText(value);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const multiline =
    draft !== null || text.includes('\n') || text.length > MULTILINE_MIN_LENGTH;
  const box = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  // O Enter gravou no campo de uma linha e o valor passou a pedir várias: o TEXTAREA nasce focado.
  const focusMultiline = useRef(false);
  const focusOnMount = multiline && focusMultiline.current;
  useLayoutEffect(() => {
    if (multiline) focusMultiline.current = false;
  }, [multiline]);
  // O Enter gravou um valor curto e o editor voltou a uma linha: o foco vai ao campo novo.
  useLayoutEffect(() => {
    if (multiline || !refocus.current) return;
    refocus.current = false;
    // Só se o foco ainda estava neste editor (o campo trocado deixou-o no `body`).
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const input = box.current?.querySelector('input');
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [multiline]);
  if (!multiline) {
    return (
      <div
        class="string-editor"
        ref={box}
        onFocusOut={() => {
          focusMultiline.current = false;
        }}
        onKeyDownCapture={(e) => {
          const input = e.target;
          if (e.key !== 'Enter' || readOnly || e.isComposing) return;
          if (!(input instanceof HTMLInputElement)) return;
          if (!e.shiftKey) {
            focusMultiline.current = true;
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setDraft(`${input.value}\n`);
        }}
      >
        <SimpleEditor {...props} />
      </div>
    );
  }
  return (
    <>
      <MultilineEditor
        id={id}
        label={label}
        initial={text}
        startText={draft ?? undefined}
        readOnly={readOnly}
        invalid={invalid || error !== null}
        required={field.required === true}
        autoFocus={draft !== null || focusOnMount}
        swallowBreak={focusOnMount}
        onEnterCommit={() => {
          refocus.current = true;
        }}
        onCommit={(typed) => {
          // A quebra de linha no fim (um Enter de sobra) não é parte do texto: tira, para que
          // um valor como a URL de uma imagem não vá ao disco com `\n`.
          const next = typed.replace(/[\r\n]+$/, '');
          const result = onSet(next === '' ? null : next);
          setError(result.ok ? null : t('typed.invalidValue'));
          if (result.ok) setDraft(null);
        }}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export interface SimpleEditorProps {
  readonly field: SpecSimpleColumn;
  readonly value: JsonValue | undefined;
  /** Nome acessível do controle. */
  readonly label: string;
  readonly readOnly: boolean;
  /** `id` do controle (o rótulo da grade de propriedades aponta para ele). */
  readonly id?: string;
  /** Pendência no valor (obrigatório vazio, opção inexistente…): estado inválido. */
  readonly invalid?: boolean;
  /** Dica do controle (ex.: o motivo da pendência numa célula). */
  readonly title?: string;
  /** Grava o valor (`null` limpa). */
  readonly onSet: (value: JsonValue) => ActionResult;
  /**
   * `linkedRef` (campo `string`): os alvos do `ref` irmão entram na lista antes das sugestões
   * fixas; ao confirmar com um deles escolhido, `onSetLinked` grava o texto e o `ref` juntos.
   */
  readonly linked?: {
    readonly items: readonly SuggestionItem[];
    readonly onSetLinked: (text: JsonValue, itemId: string) => ActionResult;
  };
}

/** Editor de um campo simples: texto, número, data ou opções. */
export function SimpleEditor({
  field,
  value,
  label,
  readOnly,
  id,
  invalid = false,
  title,
  onSet,
  linked,
}: SimpleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult) => {
    setError(result.ok ? null : t('typed.invalidValue'));
    return result.ok;
  };
  const required = field.required === true;
  const text = valueText(value);
  const bad = invalid || error !== null;
  // Texto e número podem sair cortados na célula ("ana@exe"): o valor inteiro vai na dica,
  // antes do motivo da pendência, se houver (etapa 7, achado A3).
  const fullTitle = [text, title ?? ''].filter((s) => s !== '').join('\n') || undefined;
  let editor;

  switch (field.type) {
    case 'string':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={fullTitle}
          aria-label={label}
          aria-required={required}
          disabled={readOnly}
          value={text}
          suggestions={
            linked
              ? mergeLinkedItems(linked.items, field.suggestions ?? [])
              : field.suggestions
          }
          onCommit={(next, chosen) => {
            const value = next === '' ? null : next;
            return report(
              linked && chosen?.id !== undefined
                ? linked.onSetLinked(value, chosen.id)
                : onSet(value),
            );
          }}
        />
      );
      break;
    case 'number':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={fullTitle}
          aria-label={label}
          aria-required={required}
          inputMode="decimal"
          disabled={readOnly}
          value={text}
          onCommit={(next) => {
            const parsed = parseNumberInput(next);
            if (parsed === undefined) {
              setError(t('typed.invalidNumber'));
              return false;
            }
            return report(onSet(parsed));
          }}
        />
      );
      break;
    case 'date':
      editor = (
        <TextField
          id={id}
          size="sm"
          type="date"
          invalid={bad}
          title={title}
          aria-label={label}
          aria-required={required}
          disabled={readOnly}
          value={text}
          onChange={(e) => {
            const next = e.currentTarget.value;
            report(onSet(next === '' ? null : next));
          }}
        />
      );
      break;
    case 'enum':
      editor =
        field.options.length <= SEGMENTED_MAX ? (
          <Segmented
            label={label}
            items={field.options.map((option) => ({ id: option, label: option }))}
            value={field.options.includes(text) ? text : null}
            invalid={bad}
            disabled={readOnly}
            // Opcional: tocar na opção escolhida limpa o campo.
            onSelect={(option) => {
              if (text !== option) report(onSet(option));
              else if (!required) report(onSet(null));
            }}
          />
        ) : (
          <Select
            id={id}
            size="sm"
            invalid={bad}
            title={title}
            aria-label={label}
            aria-required={required}
            disabled={readOnly}
            value={field.options.includes(text) ? text : ''}
            onChange={(e) => {
              const next = e.currentTarget.value;
              report(onSet(next === '' ? null : next));
            }}
          >
            <option value="">{t('typed.enumNone')}</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        );
      break;
  }

  return (
    <>
      {editor}
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Quem aponta para uma tupla, linha ou campo: "← Input input_nome (Nome)". Tocar vai até a origem. */
export function BacklinkList({
  project,
  backlinks,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly backlinks: readonly Backlink[];
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  if (backlinks.length === 0) return null;
  return (
    <ul class="backlinks" aria-label={t('ref.backlinks')}>
      {backlinks.map((b) => {
        const source = annotationSourceLabel(project, b.source);
        const marking = project.markings.find((m) => m.id === b.source.markingId);
        return (
          <li key={`${b.source.id}:${refPathText(b)}`}>
            <button
              type="button"
              class="link-button"
              title={t('ref.backlinkGo', { source })}
              onClick={() => onGoToAnnotation(b.source)}
            >
              {t('ref.backlink', {
                source,
                marking: marking ? markingLabel(project, marking) : '',
              })}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
