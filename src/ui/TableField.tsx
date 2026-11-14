import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ariaKeys, SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  fieldLabel,
  getBacklinks,
  refsBrokenBy,
  removeTableRow,
  tableRows,
  type JsonValue,
  type SpecField,
  type SpecRefColumn,
  type SpecSimpleColumn,
  type TableRow,
} from '../model';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { useCiteMenuItems } from './CiteMenuItems';
import { Button, HelpTip } from './controls';
import { useDetailsExtension } from './DetailsExtension';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { gripAt, isGrip, isNewRowKey } from './KeyValueGrid';
import { useFocusRequest } from './focus';
import { moveKeyDelta, useRowDrag } from './rowDrag';
import {
  BacklinkList,
  SimpleEditor,
  type FieldContext,
  type SimpleEditorProps,
} from './FieldEditors';
import { linkedCellTargets, type LinkedTargets } from './linkedRef';
import { NoticeLines } from './NoticeBadge';
import { RefCell } from './RefCell';
import type { ActionResult } from '../store/history';
import { issueMessage, issuesOf, refButtonName } from './typedText';

// DS 2.0 DataGrid for `table` fields: numbered # column, drag handle (P6),
// in-cell editing and a ⋯ menu per row.

type TableFieldDef = Extract<SpecField, { type: 'table' }>;

/** `table` field of the Details: connects the editor to the project actions. */
export function TableField({
  field,
  ...ctx
}: FieldContext & { readonly field: TableFieldDef }) {
  const { actions } = useEditor();
  const citeItems = useCiteMenuItems();
  const { project, annotation, readOnly } = ctx;
  const rows = tableRows(annotation.values?.[field.key]);
  const backlinks = getBacklinks(project, annotation.id);
  const issues = issuesOf(project, annotation.id).filter(
    (i) => i.key === field.key && i.rowId !== undefined,
  );
  // The targets of each column with `linkedRef`, computed once per render.
  const targetsByColumn = new Map<string, LinkedTargets>();

  return (
    <TableEditor
      field={field}
      rows={rows}
      readOnly={readOnly}
      onAddRow={() => actions.addTableRow(annotation.id, field.key).ok}
      onSetCell={(rowId, column, value) =>
        actions.setTableCell(annotation.id, field.key, rowId, column, value)
      }
      onMoveRow={(rowId, to) => actions.moveTableRow(annotation.id, field.key, rowId, to)}
      onRemoveRow={(rowId) => actions.removeTableRow(annotation.id, field.key, rowId)}
      brokenByRemoving={(row) =>
        refsBrokenBy(project, (p) => removeTableRow(p, annotation.id, field.key, row._id))
      }
      cellIssue={(row, column) => {
        const issue = issues.find((i) => i.rowId === row._id && i.column === column);
        return issue ? issueMessage(project, annotation, issue) : undefined;
      }}
      rowNote={(row) => {
        const received = backlinks.filter(
          (b) => 'rowId' in b.ref && b.ref.key === field.key && b.ref.rowId === row._id,
        );
        return (
          received.length > 0 && (
            <BacklinkList
              project={project}
              backlinks={received}
              onGoToAnnotation={ctx.onGoToAnnotation}
            />
          )
        );
      }}
      annotationId={annotation.id}
      rowMenuItems={(row) => {
        const target = {
          kind: 'row',
          annotationId: annotation.id,
          key: field.key,
          rowId: row._id,
        } as const;
        return citeItems(target, target);
      }}
      linkedCell={(row, column) => {
        const linkedKey = column.type === 'string' ? column.linkedRef : undefined;
        if (linkedKey === undefined) return undefined;
        let targets = targetsByColumn.get(column.key);
        if (!targets) {
          targets = linkedCellTargets(project, annotation, field.key, linkedKey);
          targetsByColumn.set(column.key, targets);
        }
        const found = targets;
        return {
          items: found.items,
          onSetLinked: (text, itemId) => {
            const ref = found.find(itemId);
            return ref
              ? actions.setTableCells(annotation.id, field.key, row._id, {
                  [column.key]: text,
                  [linkedKey]: { ...ref },
                })
              : actions.setTableCell(annotation.id, field.key, row._id, column.key, text);
          },
        };
      }}
      renderRefCell={({ row, column, label, invalid, title }) => (
        <RefCell
          project={project}
          annotation={annotation}
          tableKey={field.key}
          rowId={row._id}
          column={column}
          value={row[column.key]}
          label={label}
          readOnly={readOnly}
          invalid={invalid}
          title={title}
          onSet={(next) =>
            actions.setTableCell(annotation.id, field.key, row._id, column.key, next)
          }
          onGoToAnnotation={ctx.onGoToAnnotation}
        />
      )}
    />
  );
}

/** What the table hands over to draw a cell of a `ref` column (only in the Details). */
export interface RefCellContext {
  readonly row: TableRow;
  readonly column: SpecRefColumn;
  /** Accessible name: the column and the row. */
  readonly label: string;
  readonly invalid: boolean;
  readonly title: string | undefined;
}

export interface TableEditorProps {
  readonly field: TableFieldDef;
  readonly rows: readonly TableRow[];
  readonly readOnly: boolean;
  /** Adds an empty row; `false` if it did not fit. */
  readonly onAddRow: () => boolean;
  readonly onSetCell: (rowId: string, column: string, value: JsonValue) => ActionResult;
  readonly onMoveRow: (rowId: string, toIndex: number) => unknown;
  readonly onRemoveRow: (rowId: string) => unknown;
  /** How many references break when the row is removed (> 0 asks for confirmation). */
  readonly brokenByRemoving?: (row: TableRow) => number;
  /** Reason for a cell's pending item (the cell becomes invalid). */
  readonly cellIssue?: (row: TableRow, column: string) => string | undefined;
  /** Note below the row (received references). */
  readonly rowNote?: (row: TableRow) => ComponentChildren;
  /** Annotation of the Details: connects the review extension point (absent outside them). */
  readonly annotationId?: string;
  /**
   * Draws the cell of a `ref` column (needs the project, which the editor does not have). Without it
   * (the creation form), the cell shows the unavailable selector.
   */
  readonly renderRefCell?: (cell: RefCellContext) => ComponentChildren;
  /**
   * `linkedRef` of a `string` column (needs the project): returns the targets and the joint
   * write of the cell. Without it (the creation form), only the fixed suggestions apply.
   */
  readonly linkedCell?: (
    row: TableRow,
    column: SpecSimpleColumn,
  ) => SimpleEditorProps['linked'];
  /**
   * Extra items in the row's ⋯ menu (Copy reference, Cite, Comment), only in the Details. With
   * them the menu also opens in read-only mode (move and remove stay disabled).
   */
  readonly rowMenuItems?: (row: TableRow) => readonly ActionMenuItem[];
}

/**
 * `table` field editor, independent of the project: receives the rows and returns the
 * edits through callbacks. Used by the Details (`TableField`) and by `TypedForm`.
 */
export function TableEditor({
  field,
  rows,
  readOnly,
  onAddRow,
  onSetCell,
  onMoveRow,
  onRemoveRow,
  brokenByRemoving,
  cellIssue,
  rowNote,
  annotationId,
  renderRefCell,
  linkedCell,
  rowMenuItems,
}: TableEditorProps) {
  const inherited = useDetailsExtension();
  const ext = annotationId !== undefined ? inherited : null;
  const grid = useRef<HTMLDivElement>(null);
  const extra =
    ext && annotationId !== undefined ? ext.tableRows(annotationId, field.key) : null;
  // The rows of the last render and the actions and "+ Row" buttons: the focus return
  // of "References will break" is read on close, already with the new table.
  const rowsNow = useRef(rows);
  rowsNow.current = rows;
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const requestFocus = useFocusRequest();
  const [confirm, setConfirm] = useState<{
    row: TableRow;
    index: number;
    count: number;
  } | null>(null);
  const label = fieldLabel(field);
  // The confirmation row, found by `_id` among the current rows (an external reload swaps the
  // object); if it left, the one from when the dialog opened applies.
  const confirmFound = confirm ? rows.findIndex((r) => r._id === confirm.row._id) : -1;
  const confirmIndex = confirmFound >= 0 ? confirmFound : (confirm?.index ?? 0);
  const confirmRow = (confirmFound >= 0 ? rows[confirmFound] : confirm?.row) ?? null;
  const rowName = (row: TableRow, index: number) => {
    const name = field.rowLabel ? row[field.rowLabel] : null;
    return typeof name === 'string' && name !== ''
      ? name
      : t('typed.row', { n: index + 1 });
  };

  /**
   * Focus on closing "References will break" (the row menu closes before the dialog
   * opens): the row's actions button; if the row left, that of the row that took its place (or of the
   * previous one, for the last); with no rows, the table's "+ Row" (stage 7, finding A1).
   */
  const focusAfterConfirm = (row: TableRow, index: number) => () => {
    const current = rowsNow.current;
    const target =
      current.find((r) => r._id === row._id) ??
      current[Math.max(0, Math.min(index, current.length - 1))];
    return (target && menuButtons.current.get(target._id)) ?? addButton.current;
  };

  const remove = (row: TableRow) => {
    const count = brokenByRemoving?.(row) ?? 0;
    if (count > 0) setConfirm({ row, index: rows.indexOf(row), count });
    else onRemoveRow(row._id);
  };

  const move = (from: number, to: number, focus: boolean) => {
    const row = rows[from];
    if (!row || from === to) return;
    onMoveRow(row._id, to);
    if (focus) requestFocus(() => gripAt(grid.current, to));
  };
  const drag = useRowDrag(grid, (from, to) => move(from, to, false));

  const addRow = () => {
    if (readOnly) return;
    if (!onAddRow()) return;
    // The new row gets focus in the first cell, in the commit that draws it.
    requestFocus(() => {
      const all = grid.current?.querySelectorAll<HTMLElement>('[data-drag-row]');
      return all?.[all.length - 1]?.querySelector<HTMLElement>(
        '[data-cell-value] input, [data-cell-value] select, [data-cell-value] button',
      );
    });
  };

  const columns = `${field.columns.length}`;

  return (
    <div
      class="props-wide table-field"
      data-focus={field.key}
      data-field={annotationId === undefined ? undefined : field.key}
      onKeyDown={(e) => {
        if (!isNewRowKey(e)) return;
        e.preventDefault();
        addRow();
      }}
    >
      <div class="table-field-head">
        <span class="props-label">
          {label}
          {field.required && (
            <span
              class="required"
              title={t('typed.required')}
              aria-label={t('typed.required')}
            >
              {t('typed.requiredMark')}
            </span>
          )}
        </span>
        {field.description && <HelpTip name={label} text={field.description} />}
        {ext &&
          annotationId !== undefined &&
          ext.mark(annotationId, `values.${field.key}`)}
        <span class="table-field-count">
          {rows.length === 1
            ? t('typed.rowsOne')
            : t('typed.rowsMany', { count: rows.length })}
        </span>
        <Button
          size="sm"
          class="button-link"
          title={`${t('typed.addRow')}  ${SHORTCUT_LABELS.newRow}`}
          aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.newRow)}
          disabled={readOnly}
          buttonRef={addButton}
          onClick={addRow}
        >
          {t('typed.addRow')}
        </Button>
      </div>
      {ext &&
        annotationId !== undefined &&
        ext.below(annotationId, `values.${field.key}`)}
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
              {t('typed.rowNumber')}
            </span>
            {field.columns.map((c) => (
              <span
                key={c.key}
                class="grid-cell"
                role="columnheader"
                title={fieldLabel(c)}
              >
                {fieldLabel(c)}
                {c.required ? t('typed.requiredMark') : ''}
              </span>
            ))}
            {ext ? (
              <span role="columnheader" class="visually-hidden">
                {ext.markColumn}
              </span>
            ) : (
              <span role="columnheader" aria-hidden="true" />
            )}
          </div>
          {rows.map((row, index) => {
            const name = rowName(row, index);
            const note = rowNote?.(row);
            const added = extra?.added.has(row._id) === true;
            return (
              <div
                key={row._id}
                class={
                  drag.state?.from === index
                    ? 'grid-row is-dragging'
                    : added
                      ? 'grid-row is-added'
                      : 'grid-row'
                }
                role="row"
                data-drag-row=""
                data-row-id={row._id}
                data-drop={drag.drop(index, rows.length)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  const onGrip = isGrip(e.target);
                  const delta = moveKeyDelta(e, onGrip);
                  if (delta === 0) return;
                  e.preventDefault();
                  const to = index + delta;
                  if (to >= 0 && to < rows.length) move(index, to, true);
                }}
              >
                <span class="grid-cell grid-cell-grip" role="cell">
                  {!readOnly && (
                    /* Exceção ao Button: row drag handle (docs/DESIGN-SYSTEM.md, "Botões avulsos") */
                    <button
                      type="button"
                      class="grid-grip"
                      data-grip=""
                      aria-label={t('typed.dragRow', { row: name })}
                      title={t('annotation.dragHint')}
                      {...drag.handle(index)}
                    >
                      <Icon name="grip" />
                    </button>
                  )}
                </span>
                <span class="grid-cell grid-cell-num" role="cell">
                  {added && (
                    <span
                      class="grid-row-added"
                      role="img"
                      aria-label={extra?.addedLabel}
                      title={extra?.addedLabel}
                    >
                      <Icon name="plus" />
                    </span>
                  )}
                  <span class="grid-row-index">{index + 1}</span>
                  <strong class="grid-row-title">{name}</strong>
                </span>
                {field.columns.map((column) => {
                  const issue = cellIssue?.(row, column.key);
                  return (
                    <span
                      key={column.key}
                      class="grid-cell grid-cell-value"
                      data-cell-value=""
                      role="cell"
                      data-focus={`${field.key}:${row._id}:${column.key}`}
                    >
                      <span class="grid-cell-label" aria-hidden="true">
                        {fieldLabel(column)}
                        {column.required ? t('typed.requiredMark') : ''}
                      </span>
                      {column.type === 'ref' ? (
                        renderRefCell ? (
                          renderRefCell({
                            row,
                            column,
                            label: `${fieldLabel(column)} (${name})`,
                            invalid: issue !== undefined,
                            title: issue,
                          })
                        ) : (
                          /* Exceção ao Button: reference field (select look), disabled (docs/DESIGN-SYSTEM.md, "Botões avulsos") */
                          <button
                            type="button"
                            class="ref-control is-empty"
                            disabled
                            title={t('typedForm.refUnavailable')}
                            aria-label={refButtonName(`${fieldLabel(column)} (${name})`, {
                              kind: 'empty',
                            })}
                          >
                            <Icon name="search" />
                            <span class="ref-control-text">
                              {t('ref.choosePlaceholder')}
                            </span>
                          </button>
                        )
                      ) : (
                        <SimpleEditor
                          field={column}
                          value={row[column.key]}
                          label={`${fieldLabel(column)} (${name})`}
                          readOnly={readOnly}
                          invalid={issue !== undefined}
                          title={issue}
                          linked={linkedCell?.(row, column)}
                          onSet={(next) => onSetCell(row._id, column.key, next)}
                        />
                      )}
                    </span>
                  );
                })}
                <span class="grid-cell grid-cell-menu" role="cell">
                  {/* With the extension (review), the actions column is left empty: the marker belongs to the field. */}
                  {!ext && (
                    <ActionMenu
                      label={t('typed.rowActions', { row: name })}
                      triggerRef={(el) => {
                        if (el) menuButtons.current.set(row._id, el);
                        else menuButtons.current.delete(row._id);
                      }}
                      disabled={readOnly && rowMenuItems === undefined}
                      items={[
                        {
                          label: t('typed.moveRowUp'),
                          disabled: readOnly || index === 0,
                          onSelect: () => move(index, index - 1, true),
                        },
                        {
                          label: t('typed.moveRowDown'),
                          disabled: readOnly || index === rows.length - 1,
                          onSelect: () => move(index, index + 1, true),
                        },
                        {
                          label: t('typed.removeRow'),
                          danger: true,
                          disabled: readOnly,
                          onSelect: () => remove(row),
                        },
                        ...(rowMenuItems?.(row) ?? []),
                      ]}
                    />
                  )}
                </span>
                {note && <div class="grid-row-note">{note}</div>}
              </div>
            );
          })}
        </div>
      )}
      {extra?.note && <p class="muted table-field-note">{extra.note}</p>}
      <NoticeLines notices={field.notices} />
      {field.columns.map((column) => (
        <NoticeLines key={column.key} notices={column.notices} column={column.key} />
      ))}
      {confirm && confirmRow && (
        <Dialog
          title={t('ref.deleteTitle')}
          alert
          onCancel={() => setConfirm(null)}
          returnFocus={focusAfterConfirm(confirm.row, confirmIndex)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  onRemoveRow(confirm.row._id);
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
              name: rowName(confirmRow, confirmIndex),
              count: confirm.count,
            })}
          </p>
        </Dialog>
      )}
    </div>
  );
}
