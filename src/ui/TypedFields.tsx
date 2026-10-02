import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  fieldLabel,
  findRefTargets,
  getBacklinks,
  parseRef,
  refLabel,
  refsBrokenBy,
  removeTableRow,
  resolveRef,
  tableRows,
  type Annotation,
  type Backlink,
  type JsonValue,
  type Project,
  type RefTarget,
  type SpecColumn,
  type SpecField,
  type TableRow,
} from '../model';
import type { ActionResult } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { AnnotationLocation } from '../store/ui';
import { CommitInput } from './CommitInput';
import { Dialog } from './Dialog';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from './icons';
import { imageLabel, markingLabel, markingPath } from './labels';
import { annotationSourceLabel, labelTexts } from './typedText';

/** Botões segmentados até este número de opções; acima, lista. */
const SEGMENTED_MAX = 3;

type RefFieldDef = Extract<SpecField, { type: 'ref' }>;
type TableFieldDef = Extract<SpecField, { type: 'table' }>;

export interface FieldContext {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly actions: ProjectActions;
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
  readonly label: string;
  readonly readOnly: boolean;
  /** Grava o valor (`null` limpa). */
  readonly onSet: (value: JsonValue) => ActionResult;
}

/** Editor de um campo simples: texto, número, data ou opções. */
export function SimpleEditor({
  field,
  value,
  label,
  readOnly,
  onSet,
}: SimpleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult) => {
    setError(result.ok ? null : t('typed.invalidValue'));
    return result.ok;
  };
  const required = field.required === true;
  const text = valueText(value);
  let editor;

  switch (field.type) {
    case 'string':
      editor = (
        <CommitInput
          class="input"
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
        <CommitInput
          class={error ? 'input input-invalid' : 'input'}
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
        <input
          class="input"
          type="date"
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
          <div class="segmented typed-options" role="group" aria-label={label}>
            {field.options.map((option) => (
              <button
                key={option}
                type="button"
                class="button"
                aria-pressed={text === option}
                disabled={readOnly}
                // Opcional: tocar na opção escolhida limpa o campo.
                onClick={() => {
                  if (text !== option) report(onSet(option));
                  else if (!required) report(onSet(null));
                }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <select
            class="input"
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
          </select>
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

/** Rótulo do campo com `*` nos obrigatórios e a descrição embaixo. */
function FieldLabel({ field }: { readonly field: SpecField }) {
  return (
    <span class="typed-label">
      {fieldLabel(field)}
      {field.required && (
        <span
          class="required"
          title={t('typed.required')}
          aria-label={t('typed.required')}
        >
          {' *'}
        </span>
      )}
    </span>
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

/** Um campo da anotação tipada, com o editor do tipo dele. */
export function TypedField({
  field,
  ...ctx
}: FieldContext & { readonly field: SpecField }) {
  const { project, annotation, actions, readOnly } = ctx;
  const value = annotation.values?.[field.key];
  const backlinks = getBacklinks(project, annotation.id).filter(
    (b) => 'key' in b.ref && !('rowId' in b.ref) && b.ref.key === field.key,
  );

  let editor;
  if (field.type === 'table') {
    editor = <TableField field={field} {...ctx} />;
  } else if (field.type === 'ref') {
    editor = <RefField field={field} {...ctx} />;
  } else {
    editor = (
      <SimpleEditor
        field={field}
        value={value}
        label={fieldLabel(field)}
        readOnly={readOnly}
        onSet={(next) => actions.setFieldValue(annotation.id, field.key, next)}
      />
    );
  }

  return (
    <div class="typed-field">
      <FieldLabel field={field} />
      {field.description && <small class="muted">{field.description}</small>}
      {editor}
      <BacklinkList
        project={project}
        backlinks={backlinks}
        onGoToAnnotation={ctx.onGoToAnnotation}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela: cartões empilhados no celular, tabela no desktop (CSS).

function TableField({ field, ...ctx }: FieldContext & { readonly field: TableFieldDef }) {
  const { project, annotation, actions, readOnly } = ctx;
  const rows = tableRows(annotation.values?.[field.key]);
  const [confirm, setConfirm] = useState<{ row: TableRow; count: number } | null>(null);
  const backlinks = getBacklinks(project, annotation.id);
  const rowName = (row: TableRow, index: number) => {
    const label = field.rowLabel ? row[field.rowLabel] : null;
    return typeof label === 'string' && label !== ''
      ? label
      : t('typed.row', { n: index + 1 });
  };

  const remove = (row: TableRow) => {
    const count = refsBrokenBy(project, (p) =>
      removeTableRow(p, annotation.id, field.key, row._id),
    );
    if (count > 0) setConfirm({ row, count });
    else actions.removeTableRow(annotation.id, field.key, row._id);
  };

  return (
    <div class="typed-table" style={{ '--cols': field.columns.length }}>
      {rows.length === 0 ? (
        <p class="muted">{t('typed.noRows')}</p>
      ) : (
        <>
          <div class="typed-table-head" aria-hidden="true">
            {field.columns.map((c) => (
              <span key={c.key}>
                {fieldLabel(c)}
                {c.required ? ' *' : ''}
              </span>
            ))}
          </div>
          <ol class="typed-rows">
            {rows.map((row, index) => (
              <li key={row._id} class="typed-row">
                <div class="typed-row-header">
                  <strong>{rowName(row, index)}</strong>
                  <div class="typed-row-actions">
                    <button
                      type="button"
                      class="button"
                      aria-label={t('typed.moveRowUp')}
                      title={t('typed.moveRowUp')}
                      disabled={readOnly || index === 0}
                      onClick={() =>
                        actions.moveTableRow(annotation.id, field.key, row._id, index - 1)
                      }
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      class="button"
                      aria-label={t('typed.moveRowDown')}
                      title={t('typed.moveRowDown')}
                      disabled={readOnly || index === rows.length - 1}
                      onClick={() =>
                        actions.moveTableRow(annotation.id, field.key, row._id, index + 1)
                      }
                    >
                      <ArrowDownIcon />
                    </button>
                    <button
                      type="button"
                      class="button"
                      aria-label={t('typed.removeRow')}
                      title={t('typed.removeRow')}
                      disabled={readOnly}
                      onClick={() => remove(row)}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
                <div class="typed-cells">
                  {field.columns.map((column) => (
                    <div key={column.key} class="typed-cell">
                      <span class="typed-cell-label">
                        {fieldLabel(column)}
                        {column.required ? ' *' : ''}
                      </span>
                      <SimpleEditor
                        field={column}
                        value={row[column.key]}
                        label={`${fieldLabel(column)} (${rowName(row, index)})`}
                        readOnly={readOnly}
                        onSet={(next) =>
                          actions.setTableCell(
                            annotation.id,
                            field.key,
                            row._id,
                            column.key,
                            next,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <BacklinkList
                  project={project}
                  backlinks={backlinks.filter(
                    (b) =>
                      'rowId' in b.ref &&
                      b.ref.key === field.key &&
                      b.ref.rowId === row._id,
                  )}
                  onGoToAnnotation={ctx.onGoToAnnotation}
                />
              </li>
            ))}
          </ol>
        </>
      )}
      <div class="row">
        <button
          type="button"
          class="button"
          disabled={readOnly}
          onClick={() => actions.addTableRow(annotation.id, field.key)}
        >
          {t('typed.addRow')}
        </button>
      </div>
      {confirm && (
        <Dialog
          title={t('ref.deleteTitle')}
          onCancel={() => setConfirm(null)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => {
                  actions.removeTableRow(annotation.id, field.key, confirm.row._id);
                  setConfirm(null);
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>
            {t('ref.deleteRow', {
              name: rowName(confirm.row, rows.indexOf(confirm.row)),
              count: confirm.count,
            })}
          </p>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referência: alvo atual, Escolher, Limpar e Ir para o alvo.

function RefField({ field, ...ctx }: FieldContext & { readonly field: RefFieldDef }) {
  const { project, annotation, actions, readOnly } = ctx;
  const [picking, setPicking] = useState(false);
  const ref = parseRef(annotation.values?.[field.key]);
  const target = ref ? resolveRef(project, ref) : null;
  const hasValue = annotation.values?.[field.key] != null;

  return (
    <div class="ref-field">
      <p class={hasValue && !target ? 'ref-current value-alert' : 'ref-current'}>
        {!hasValue
          ? t('ref.none')
          : `→ ${ref && target ? refLabel(project, ref, labelTexts()) : t('ref.broken')}`}
      </p>
      <div class="row">
        <button
          type="button"
          class="button"
          disabled={readOnly}
          onClick={() => setPicking(true)}
        >
          {t('ref.choose')}
        </button>
        <button
          type="button"
          class="button"
          disabled={readOnly || !hasValue}
          onClick={() => actions.setFieldValue(annotation.id, field.key, null)}
        >
          {t('ref.clear')}
        </button>
        <button
          type="button"
          class="button"
          disabled={!target}
          onClick={() => target && ctx.onGoToAnnotation(target.annotation)}
        >
          {t('ref.goTo')}
        </button>
      </div>
      {picking && (
        <RefPicker
          project={project}
          annotation={annotation}
          field={field}
          onCancel={() => setPicking(false)}
          onPick={(picked) => {
            setPicking(false);
            actions.setFieldValue(annotation.id, field.key, { ...picked.ref });
          }}
        />
      )}
    </div>
  );
}

interface TargetGroup {
  readonly annotation: Annotation;
  readonly context: string;
  readonly items: RefTarget[];
}

/** Agrupa os alvos por anotação, com o contexto "imagem › marcação". */
function groupTargets(project: Project, targets: readonly RefTarget[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    const id = target.annotation.id;
    let group = groups.get(id);
    if (!group) {
      const marking = project.markings.find((m) => m.id === target.annotation.markingId);
      const image = project.images.find((i) => i.id === marking?.imageId);
      const context = [
        image ? imageLabel(image) : '',
        marking ? markingPath(project, marking) : '',
      ]
        .filter((s) => s !== '')
        .join(t('marking.pathSeparator'));
      group = { annotation: target.annotation, context, items: [] };
      groups.set(id, group);
    }
    group.items.push(target);
  }
  return [...groups.values()];
}

function noTargetsMessage(field: RefFieldDef): string {
  const tags = (field.accepts.tags ?? []).join(', ');
  if (tags !== '' && field.accepts.free) return t('ref.noTargetsTagsFree', { tags });
  if (tags !== '') return t('ref.noTargetsTags', { tags });
  return t('ref.noTargetsFree');
}

/** Seletor com busca: só os alvos aceitos pelo campo, agrupados por anotação. */
function RefPicker({
  project,
  annotation,
  field,
  onCancel,
  onPick,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly field: RefFieldDef;
  readonly onCancel: () => void;
  readonly onPick: (target: RefTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const targets = findRefTargets(project, annotation.id, field.key, labelTexts());
  const groups = groupTargets(project, targets);
  const needle = query.trim().toLocaleLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      items:
        needle === ''
          ? g.items
          : g.items.filter((i) =>
              `${i.label} ${g.context}`.toLocaleLowerCase().includes(needle),
            ),
    }))
    .filter((g) => g.items.length > 0);
  const current = parseRef(annotation.values?.[field.key]);
  const isCurrent = (target: RefTarget) =>
    current !== null && JSON.stringify(current) === JSON.stringify(target.ref);

  return (
    <Dialog
      title={t('ref.pickerTitle', { field: fieldLabel(field) })}
      onCancel={onCancel}
      actions={
        <button type="button" class="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      }
    >
      {targets.length === 0 ? (
        <p class="notice notice-info">{noTargetsMessage(field)}</p>
      ) : (
        <div class="ref-picker">
          <input
            class="input"
            type="search"
            aria-label={t('ref.search')}
            placeholder={t('ref.search')}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {shown.length === 0 && <p class="muted">{t('ref.noMatches')}</p>}
          <ul class="ref-groups">
            {shown.map((group) => (
              <li key={group.annotation.id} class="ref-group">
                <span class="ref-group-title">
                  <strong>{annotationSourceLabel(project, group.annotation)}</strong>
                  <small class="muted">{group.context}</small>
                </span>
                <ul class="ref-options">
                  {group.items.map((item) => (
                    <li key={JSON.stringify(item.ref)}>
                      <button
                        type="button"
                        class="button ref-option"
                        aria-pressed={isCurrent(item)}
                        onClick={() => onPick(item)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
