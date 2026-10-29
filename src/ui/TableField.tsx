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
import { ActionMenu } from './ActionMenu';
import { Button } from './controls';
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
import { RefCell } from './RefCell';
import type { ActionResult } from '../store/history';
import { issueMessage, issuesOf } from './typedText';

// DataGrid do DS 2.0 para campos `table`: coluna # numerada, alça de arraste (P6),
// edição na célula e menu ⋯ por linha.

type TableFieldDef = Extract<SpecField, { type: 'table' }>;

/** Campo `table` dos Detalhes: liga o editor às actions do projeto. */
export function TableField({
  field,
  ...ctx
}: FieldContext & { readonly field: TableFieldDef }) {
  const { actions } = useEditor();
  const { project, annotation, readOnly } = ctx;
  const rows = tableRows(annotation.values?.[field.key]);
  const backlinks = getBacklinks(project, annotation.id);
  const issues = issuesOf(project, annotation.id).filter(
    (i) => i.key === field.key && i.rowId !== undefined,
  );
  // Os alvos de cada coluna com `linkedRef`, calculados uma vez por renderização.
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

/** O que a tabela entrega para desenhar uma célula de coluna `ref` (só nos Detalhes). */
export interface RefCellContext {
  readonly row: TableRow;
  readonly column: SpecRefColumn;
  /** Nome acessível: a coluna e a linha. */
  readonly label: string;
  readonly invalid: boolean;
  readonly title: string | undefined;
}

export interface TableEditorProps {
  readonly field: TableFieldDef;
  readonly rows: readonly TableRow[];
  readonly readOnly: boolean;
  /** Acrescenta uma linha vazia; `false` se não coube. */
  readonly onAddRow: () => boolean;
  readonly onSetCell: (rowId: string, column: string, value: JsonValue) => ActionResult;
  readonly onMoveRow: (rowId: string, toIndex: number) => unknown;
  readonly onRemoveRow: (rowId: string) => unknown;
  /** Quantas referências quebram ao remover a linha (> 0 pede confirmação). */
  readonly brokenByRemoving?: (row: TableRow) => number;
  /** Motivo da pendência de uma célula (a célula fica inválida). */
  readonly cellIssue?: (row: TableRow, column: string) => string | undefined;
  /** Nota embaixo da linha (referências recebidas). */
  readonly rowNote?: (row: TableRow) => ComponentChildren;
  /** Anotação dos Detalhes: liga o ponto de extensão da revisão (ausente fora deles). */
  readonly annotationId?: string;
  /**
   * Desenha a célula de uma coluna `ref` (precisa do projeto, que o editor não tem). Sem ele
   * (o formulário de criação), a célula mostra o seletor indisponível.
   */
  readonly renderRefCell?: (cell: RefCellContext) => ComponentChildren;
  /**
   * `linkedRef` de uma coluna `string` (precisa do projeto): devolve os alvos e a gravação
   * conjunta da célula. Sem ele (o formulário de criação), só valem as sugestões fixas.
   */
  readonly linkedCell?: (
    row: TableRow,
    column: SpecSimpleColumn,
  ) => SimpleEditorProps['linked'];
}

/**
 * Editor de campos `table`, independente do projeto: recebe as linhas e devolve as
 * edições por callbacks. Usado pelos Detalhes (`TableField`) e pelo `TypedForm`.
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
}: TableEditorProps) {
  const inherited = useDetailsExtension();
  const ext = annotationId !== undefined ? inherited : null;
  const grid = useRef<HTMLDivElement>(null);
  const extra =
    ext && annotationId !== undefined ? ext.tableRows(annotationId, field.key) : null;
  // As linhas da última renderização e os botões de ações e "+ Linha": o retorno do foco
  // do "Referências vão quebrar" é lido ao fechar, já com a tabela nova.
  const rowsNow = useRef(rows);
  rowsNow.current = rows;
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const requestFocus = useFocusRequest();
  const [confirm, setConfirm] = useState<{ row: TableRow; count: number } | null>(null);
  const label = fieldLabel(field);
  const rowName = (row: TableRow, index: number) => {
    const name = field.rowLabel ? row[field.rowLabel] : null;
    return typeof name === 'string' && name !== ''
      ? name
      : t('typed.row', { n: index + 1 });
  };

  /**
   * Foco ao fechar o "Referências vão quebrar" (o menu da linha fecha antes de o diálogo
   * abrir): o botão de ações da linha; se ela saiu, o da linha que ficou no lugar (ou da
   * anterior, na última); sem linhas, o "+ Linha" da tabela (etapa 7, achado A1).
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
    if (count > 0) setConfirm({ row, count });
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
    // A linha nova recebe o foco na primeira célula, no commit que a desenha.
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
      {field.description && <small class="muted props-note">{field.description}</small>}
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
              #
            </span>
            {field.columns.map((c) => (
              <span
                key={c.key}
                class="grid-cell"
                role="columnheader"
                title={fieldLabel(c)}
              >
                {fieldLabel(c)}
                {c.required ? ' *' : ''}
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
                        {column.required ? ' *' : ''}
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
                          <button
                            type="button"
                            class="ref-control is-empty"
                            disabled
                            title={t('typedForm.refUnavailable')}
                            aria-label={t('ref.fieldButton', {
                              field: `${fieldLabel(column)} (${name})`,
                              value: t('ref.choosePlaceholder'),
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
                  {/* Com a extensão (revisão), a coluna de ações fica vazia: o marcador é do campo. */}
                  {!ext && (
                    <ActionMenu
                      label={t('typed.rowActions', { row: name })}
                      triggerRef={(el) => {
                        if (el) menuButtons.current.set(row._id, el);
                        else menuButtons.current.delete(row._id);
                      }}
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
                  )}
                </span>
                {note && <div class="grid-row-note">{note}</div>}
              </div>
            );
          })}
        </div>
      )}
      {extra?.note && <p class="muted table-field-note">{extra.note}</p>}
      {confirm && (
        <Dialog
          title={t('ref.deleteTitle')}
          alert
          onCancel={() => setConfirm(null)}
          returnFocus={focusAfterConfirm(
            confirm.row,
            rows.findIndex((r) => r._id === confirm.row._id),
          )}
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
              name: rowName(confirm.row, rows.indexOf(confirm.row)),
              count: confirm.count,
            })}
          </p>
        </Dialog>
      )}
    </div>
  );
}
