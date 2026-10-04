import { useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  fieldLabel,
  getBacklinks,
  refsBrokenBy,
  removeTableRow,
  tableRows,
  type SpecField,
  type TableRow,
} from '../model';
import { ActionMenu } from './ActionMenu';
import { Button } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { focusGrip, isNewRowKey } from './KeyValueGrid';
import { moveKeyDelta, useRowDrag } from './rowDrag';
import { BacklinkList, SimpleEditor, type FieldContext } from './FieldEditors';
import { issueMessage, issuesOf } from './typedText';

// DataGrid do DS 2.0 para campos `table`: coluna # numerada, alça de arraste (P6),
// edição na célula e menu ⋯ por linha. No celular cada linha vira um cartão (CSS).

type TableFieldDef = Extract<SpecField, { type: 'table' }>;

export function TableField({
  field,
  ...ctx
}: FieldContext & { readonly field: TableFieldDef }) {
  const { actions } = useEditor();
  const { project, annotation, readOnly } = ctx;
  const grid = useRef<HTMLDivElement>(null);
  const rows = tableRows(annotation.values?.[field.key]);
  const [confirm, setConfirm] = useState<{ row: TableRow; count: number } | null>(null);
  const backlinks = getBacklinks(project, annotation.id);
  const issues = issuesOf(project, annotation.id).filter(
    (i) => i.key === field.key && i.rowId !== undefined,
  );
  const label = fieldLabel(field);
  const rowName = (row: TableRow, index: number) => {
    const name = field.rowLabel ? row[field.rowLabel] : null;
    return typeof name === 'string' && name !== ''
      ? name
      : t('typed.row', { n: index + 1 });
  };

  const remove = (row: TableRow) => {
    const count = refsBrokenBy(project, (p) =>
      removeTableRow(p, annotation.id, field.key, row._id),
    );
    if (count > 0) setConfirm({ row, count });
    else actions.removeTableRow(annotation.id, field.key, row._id);
  };

  const move = (from: number, to: number, focus: boolean) => {
    const row = rows[from];
    if (!row || from === to) return;
    actions.moveTableRow(annotation.id, field.key, row._id, to);
    if (focus) focusGrip(grid.current, to);
  };
  const drag = useRowDrag(grid, (from, to) => move(from, to, false));

  const addRow = () => {
    if (readOnly) return;
    const result = actions.addTableRow(annotation.id, field.key);
    if (!result.ok) return;
    // A linha nova recebe o foco na primeira célula.
    requestAnimationFrame(() => {
      const all = grid.current?.querySelectorAll<HTMLElement>('[data-drag-row]');
      all?.[all.length - 1]
        ?.querySelector<HTMLElement>(
          '.grid-cell-value input, .grid-cell-value select, .grid-cell-value button',
        )
        ?.focus();
    });
  };

  const columns = `${field.columns.length}`;

  return (
    <div
      class="props-wide table-field"
      data-focus={field.key}
      onKeyDown={(e) => {
        if (!isNewRowKey(e)) return;
        e.preventDefault();
        addRow();
      }}
    >
      <div class="table-field-head">
        <span class="props-label" title={field.description}>
          {label}
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
        <span class="table-field-count">
          {rows.length === 1
            ? t('typed.rowsOne')
            : t('typed.rowsMany', { count: rows.length })}
        </span>
        <Button
          size="sm"
          class="button-link"
          title={`${t('typed.addRow')}  ${SHORTCUT_LABELS.newRow}`}
          aria-keyshortcuts={SHORTCUT_LABELS.newRow}
          disabled={readOnly}
          onClick={addRow}
        >
          {t('typed.addRow')}
        </Button>
      </div>
      {field.description && <small class="muted props-note">{field.description}</small>}
      {rows.length === 0 ? (
        <p class="muted">{t('typed.noRows')}</p>
      ) : (
        <div
          class="grid data-grid"
          role="table"
          aria-label={label}
          style={{ '--cols': columns }}
          ref={grid}
        >
          <div class="grid-row grid-head" role="row">
            <span role="columnheader" aria-hidden="true" />
            <span class="grid-cell grid-cell-num" role="columnheader">
              #
            </span>
            {field.columns.map((c) => (
              <span key={c.key} class="grid-cell" role="columnheader">
                {fieldLabel(c)}
                {c.required ? ' *' : ''}
              </span>
            ))}
            <span role="columnheader" aria-hidden="true" />
          </div>
          {rows.map((row, index) => {
            const name = rowName(row, index);
            const received = backlinks.filter(
              (b) =>
                'rowId' in b.ref && b.ref.key === field.key && b.ref.rowId === row._id,
            );
            return (
              <div
                key={row._id}
                class={drag.state?.from === index ? 'grid-row is-dragging' : 'grid-row'}
                role="row"
                data-drag-row=""
                data-drop={drag.drop(index, rows.length)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  const onGrip = (e.target as HTMLElement).classList.contains(
                    'grid-grip',
                  );
                  const delta = moveKeyDelta(e, onGrip);
                  if (delta === 0) return;
                  e.preventDefault();
                  const to = index + delta;
                  if (to >= 0 && to < rows.length) move(index, to, true);
                }}
              >
                <span class="grid-cell grid-cell-grip" role="cell">
                  {!readOnly && (
                    <button
                      type="button"
                      class="grid-grip"
                      aria-label={t('typed.dragRow', { row: name })}
                      title={t('annotation.dragHint')}
                      {...drag.handle(index)}
                    >
                      <Icon name="grip" />
                    </button>
                  )}
                </span>
                <span class="grid-cell grid-cell-num" role="cell">
                  <span class="grid-row-index">{index + 1}</span>
                  <strong class="grid-row-title">{name}</strong>
                </span>
                {field.columns.map((column) => {
                  const cellIssue = issues.find(
                    (i) => i.rowId === row._id && i.column === column.key,
                  );
                  return (
                    <span
                      key={column.key}
                      class="grid-cell grid-cell-value"
                      role="cell"
                      data-focus={`${field.key}:${row._id}:${column.key}`}
                    >
                      <span class="grid-cell-label" aria-hidden="true">
                        {fieldLabel(column)}
                        {column.required ? ' *' : ''}
                      </span>
                      <SimpleEditor
                        field={column}
                        value={row[column.key]}
                        label={`${fieldLabel(column)} (${name})`}
                        readOnly={readOnly}
                        invalid={cellIssue !== undefined}
                        title={
                          cellIssue
                            ? issueMessage(project, annotation, cellIssue)
                            : undefined
                        }
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
                    </span>
                  );
                })}
                <span class="grid-cell grid-cell-menu" role="cell">
                  <ActionMenu
                    label={t('typed.rowActions', { row: name })}
                    disabled={readOnly}
                    items={[
                      {
                        label: t('typed.moveRowUp'),
                        disabled: index === 0,
                        onSelect: () => move(index, index - 1, true),
                      },
                      {
                        label: t('typed.moveRowDown'),
                        disabled: index === rows.length - 1,
                        onSelect: () => move(index, index + 1, true),
                      },
                      {
                        label: t('typed.removeRow'),
                        danger: true,
                        onSelect: () => remove(row),
                      },
                    ]}
                  />
                </span>
                {received.length > 0 && (
                  <div class="grid-row-note">
                    <BacklinkList
                      project={project}
                      backlinks={received}
                      onGoToAnnotation={ctx.onGoToAnnotation}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirm && (
        <Dialog
          title={t('ref.deleteTitle')}
          onCancel={() => setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  actions.removeTableRow(annotation.id, field.key, confirm.row._id);
                  setConfirm(null);
                }}
              >
                {t('common.delete')}
              </Button>
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
