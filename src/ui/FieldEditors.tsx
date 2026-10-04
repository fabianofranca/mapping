import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  type Annotation,
  type Backlink,
  type JsonValue,
  type Project,
  type SpecColumn,
} from '../model';
import type { ActionResult } from '../store/history';
import type { AnnotationLocation } from '../store/ui';
import { Segmented, Select, TextField } from './controls';
import { markingLabel } from './labels';
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

interface SimpleEditorProps {
  readonly field: SpecColumn;
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
}: SimpleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult) => {
    setError(result.ok ? null : t('typed.invalidValue'));
    return result.ok;
  };
  const required = field.required === true;
  const text = valueText(value);
  const bad = invalid || error !== null;
  let editor;

  switch (field.type) {
    case 'string':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={title}
          aria-label={label}
          aria-required={required}
          disabled={readOnly}
          value={text}
          onCommit={(next) => report(onSet(next === '' ? null : next))}
        />
      );
      break;
    case 'number':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={title}
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
          <li key={`${b.source.id}:${b.key}`}>
            <button
              type="button"
              class="link-button"
              title={t('ref.backlinkGo', { source })}
              onClick={() => onGoToAnnotation(b.source)}
            >
              {t('ref.backlink', {
                source,
                marking: marking ? markingLabel(marking) : '',
              })}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
