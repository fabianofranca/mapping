import { useId } from 'preact/hooks';
import { t } from '../i18n';
import {
  defaultColumnValue,
  fieldLabel,
  tableRows,
  type JsonValue,
  type SpecField,
  type TableRow,
} from '../model';
import type { ActionResult } from '../store/history';
import { SimpleEditor } from './FieldEditors';
import { Icon } from './icons';
import { PropertyGrid, Property } from './PropertyGrid';
import { TableEditor } from './TableField';

// Formulário dos campos de um tipo, sem projeto: os valores vêm de fora e cada edição sai
// por `onChange`. É o mesmo desenho dos Detalhes (SimpleEditor, TableEditor), usado pelo
// playground do Catálogo. Não usa o store nem o EditorContext.

type TableFieldDef = Extract<SpecField, { type: 'table' }>;

const OK: ActionResult = { ok: true, value: undefined };

export interface TypedFormProps {
  readonly fields: readonly SpecField[];
  readonly values: Readonly<Record<string, unknown>>;
  /** Uma edição: a chave do campo e o novo valor (`null` limpa; tabela = todas as linhas). */
  readonly onChange: (key: string, value: JsonValue) => void;
  readonly readOnly?: boolean;
}

export function TypedForm({
  fields,
  values,
  onChange,
  readOnly = false,
}: TypedFormProps) {
  return (
    <PropertyGrid>
      {fields.map((field) => (
        <TypedFormField
          key={field.key}
          field={field}
          value={values[field.key] as JsonValue | undefined}
          readOnly={readOnly}
          onChange={onChange}
        />
      ))}
    </PropertyGrid>
  );
}

interface FieldProps {
  readonly field: SpecField;
  readonly value: JsonValue | undefined;
  readonly readOnly: boolean;
  readonly onChange: (key: string, value: JsonValue) => void;
}

function TypedFormField({ field, value, readOnly, onChange }: FieldProps) {
  const id = useId();
  if (field.type === 'table') {
    return (
      <FormTable field={field} value={value} readOnly={readOnly} onChange={onChange} />
    );
  }
  const label = fieldLabel(field);
  return (
    <Property
      label={label}
      for={id}
      required={field.required}
      hint={field.description}
      focusKey={field.key}
      note={field.description}
    >
      {field.type === 'ref' ? (
        <button
          id={id}
          type="button"
          class="ref-control is-empty"
          disabled
          title={t('typedForm.refUnavailable')}
          aria-label={t('ref.fieldButton', {
            field: label,
            value: t('ref.choosePlaceholder'),
          })}
        >
          <Icon name="search" />
          <span class="ref-control-text">{t('ref.choosePlaceholder')}</span>
        </button>
      ) : (
        <SimpleEditor
          id={id}
          field={field}
          value={value}
          label={label}
          readOnly={readOnly}
          onSet={(next) => {
            onChange(field.key, next);
            return OK;
          }}
        />
      )}
    </Property>
  );
}

function FormTable({
  field,
  value,
  readOnly,
  onChange,
}: FieldProps & { readonly field: TableFieldDef }) {
  const rows = tableRows(value);
  const emit = (next: readonly TableRow[]) => onChange(field.key, next as JsonValue);

  return (
    <TableEditor
      field={field}
      rows={rows}
      readOnly={readOnly}
      onAddRow={() => {
        const row: TableRow = {
          _id: crypto.randomUUID(),
          ...Object.fromEntries(field.columns.map((c) => [c.key, defaultColumnValue(c)])),
        };
        emit([...rows, row]);
        return true;
      }}
      onSetCell={(rowId, column, cell) => {
        emit(rows.map((r) => (r._id === rowId ? { ...r, [column]: cell } : r)));
        return OK;
      }}
      onMoveRow={(rowId, to) => {
        const from = rows.findIndex((r) => r._id === rowId);
        if (from < 0) return;
        const next = [...rows];
        const [moved] = next.splice(from, 1);
        if (moved) next.splice(to, 0, moved);
        emit(next);
      }}
      onRemoveRow={(rowId) => emit(rows.filter((r) => r._id !== rowId))}
    />
  );
}
