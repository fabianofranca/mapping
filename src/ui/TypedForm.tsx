import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  defaultColumnValue,
  fieldLabel,
  tableRows,
  type JsonValue,
  type SpecField,
  type TableRow,
} from '../model';
import { fieldDisplay, type SpecFieldGroup } from '../model/specFieldDisplay';
import type { ActionResult } from '../store/history';
import { SimpleEditor } from './FieldEditors';
import { FieldDisplayItems, HiddenFieldsLine } from './FieldGroups';
import { Icon } from './icons';
import { PropertyGrid, Property } from './PropertyGrid';
import { TableEditor } from './TableField';
import { refButtonName } from './typedText';

// Form for a type's fields, without a project: the values come from outside and each edit goes out
// through `onChange`. It is the same design as the Details (SimpleEditor, TableEditor), used by
// the Catalog playground. It does not use the store or the EditorContext.

type TableFieldDef = Extract<SpecField, { type: 'table' }>;

const OK: ActionResult = { ok: true, value: undefined };

export interface TypedFormProps {
  readonly fields: readonly SpecField[];
  /** The type's `fieldGroups`: the same subheadings and conditions as Details (state kept here). */
  readonly fieldGroups?: readonly SpecFieldGroup[] | undefined;
  readonly values: Readonly<Record<string, unknown>>;
  /** An edit: the field key and the new value (`null` clears; table = all the rows). */
  readonly onChange: (key: string, value: JsonValue) => void;
  readonly readOnly?: boolean;
}

export function TypedForm({
  fields,
  fieldGroups,
  values,
  onChange,
  readOnly = false,
}: TypedFormProps) {
  // The Playground has no editor: the collapsed groups and "Show" live here.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const none = new Set<string>();
  const base = fieldDisplay({ fields, fieldGroups }, values, none);
  const display = showAll
    ? fieldDisplay({ fields, fieldGroups }, values, new Set(fields.map((f) => f.key)))
    : base;
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <PropertyGrid>
      <FieldDisplayItems
        items={display.items}
        isCollapsed={(id) => collapsed.has(id)}
        onToggle={toggle}
        renderField={(field) => (
          <TypedFormField
            key={field.key}
            field={field}
            value={values[field.key] as JsonValue | undefined}
            readOnly={readOnly}
            onChange={onChange}
          />
        )}
      />
      {base.hidden.length > 0 && (
        <HiddenFieldsLine
          count={base.hidden.length}
          shown={showAll}
          onToggle={() => setShowAll((on) => !on)}
        />
      )}
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
    >
      {field.type === 'ref' ? (
        /* Exception to Button: reference field (select look), disabled (docs/DESIGN-SYSTEM.md, "Loose buttons") */
        <button
          id={id}
          type="button"
          class="ref-control is-empty"
          disabled
          title={t('typedForm.refUnavailable')}
          aria-label={refButtonName(label, { kind: 'empty' })}
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
