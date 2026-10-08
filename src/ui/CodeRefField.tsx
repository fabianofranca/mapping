import { useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  codeRefEntries,
  codeRefPlatforms,
  fieldLabel,
  findPlatform,
  isCodeLine,
  typeOfAnnotation,
  type AnnotationIssue,
  type CodeRefEntry,
  type SpecField,
} from '../model';
import { ActionMenu } from './ActionMenu';
import { CodeEntryActions, codeEntryText, codeEntryTooltip } from './CodeRefs';
import { Button, Select, TextField, Tooltip } from './controls';
import { useEditor } from './EditorContext';
import type { FieldContext } from './FieldEditors';
import { Icon } from './icons';
import { focusGrip, isNewRowKey } from './KeyValueGrid';
import { moveKeyDelta, useRowDrag } from './rowDrag';
import { issueReason, issuesOf } from './typedText';

// Editor do campo `codeRef` (etapa 3b.3), no padrão das linhas de `table`: contagem e
// "+ Entrada" no cabeçalho, alça de arraste e menu ⋯ por entrada. Cada entrada tem um
// título ("<plataforma> · <arquivo>", com o caminho completo na dica) e as ações abrir
// no repositório e copiar caminho, e embaixo os campos plataforma, caminho, símbolo e
// linha. Toda alteração passa por uma action do store (uma entrada no desfazer).

type CodeRefFieldDef = Extract<SpecField, { type: 'codeRef' }>;
type Column = 'platform' | 'path' | 'symbol' | 'line';

/** Erro de uma edição recusada, mostrado embaixo da entrada. */
interface EditError {
  readonly entryId: string;
  readonly column: Column;
  readonly text: string;
}

/** Lê a linha digitada: vazio limpa, inteiro ≥ 1 vale; `undefined` = inválida. */
export function parseLineInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return isCodeLine(value) ? value : undefined;
}

export function CodeRefField({
  field,
  ...ctx
}: FieldContext & { readonly field: CodeRefFieldDef }) {
  const { actions } = useEditor();
  const { project, annotation, readOnly } = ctx;
  const grid = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<EditError | null>(null);

  const entries = codeRefEntries(annotation.values?.[field.key]);
  const spec = typeOfAnnotation(project, annotation)?.spec;
  const allowed = spec ? codeRefPlatforms(spec, field) : [];
  const issues = issuesOf(project, annotation.id).filter((i) => i.key === field.key);
  const fieldIssues = issues.filter(
    (i) => i.rowId === undefined && i.code !== 'unknown-field',
  );
  const label = fieldLabel(field);
  const platformName = (id: string) => findPlatform(project, id)?.name ?? id;

  const move = (from: number, to: number, focus: boolean) => {
    const entry = entries[from];
    if (!entry || from === to) return;
    actions.moveCodeRefEntry(annotation.id, field.key, entry._id, to);
    if (focus) focusGrip(grid.current, to);
  };
  const drag = useRowDrag(grid, (from, to) => move(from, to, false));

  const addEntry = () => {
    if (readOnly || allowed.length === 0) return;
    // A entrada nova repete a plataforma da última (ou usa a primeira permitida).
    const last = entries.at(-1)?.platform;
    const platform = last !== undefined && allowed.includes(last) ? last : allowed[0];
    if (platform === undefined) return;
    const result = actions.addCodeRefEntry(annotation.id, field.key, { platform });
    if (!result.ok) return;
    // O foco vai para o caminho da entrada nova.
    requestAnimationFrame(() => {
      const all = grid.current?.querySelectorAll<HTMLElement>('[data-drag-row]');
      all?.[all.length - 1]
        ?.querySelector<HTMLElement>('[data-focus$=":path"] input')
        ?.focus();
    });
  };

  const update = (
    entry: CodeRefEntry,
    column: Column,
    changes: Parameters<typeof actions.updateCodeRefEntry>[3],
  ): boolean => {
    const result = actions.updateCodeRefEntry(
      annotation.id,
      field.key,
      entry._id,
      changes,
    );
    setError(
      result.ok
        ? null
        : {
            entryId: entry._id,
            column,
            text: t(
              result.error === 'invalid-path' ? 'code.invalidPath' : 'code.invalidValue',
            ),
          },
    );
    return result.ok;
  };

  return (
    <div
      class="props-wide table-field"
      data-focus={field.key}
      onKeyDown={(e) => {
        if (!isNewRowKey(e)) return;
        e.preventDefault();
        addEntry();
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
          {entries.length === 1
            ? t('code.entriesOne')
            : t('code.entriesMany', { count: entries.length })}
        </span>
        <Button
          size="sm"
          class="button-link"
          title={`${t('code.addEntry')}  ${SHORTCUT_LABELS.newRow}`}
          aria-keyshortcuts={SHORTCUT_LABELS.newRow}
          disabled={readOnly || allowed.length === 0}
          onClick={addEntry}
        >
          {t('code.addEntry')}
        </Button>
      </div>
      {field.description && <small class="muted props-note">{field.description}</small>}
      {allowed.length === 0 && <p class="field-error">{t('code.noPlatforms')}</p>}
      {fieldIssues.map((issue) => (
        <p key={issue.code} class="field-error">
          {issueReason(project, annotation, issue)}
        </p>
      ))}
      {entries.length === 0 ? (
        <p class="muted">{t('code.noEntries')}</p>
      ) : (
        <div class="grid code-grid" role="list" aria-label={label} ref={grid}>
          {entries.map((entry, index) => {
            const display = {
              platformName: platformName(entry.platform),
              fileName:
                entry.path === null
                  ? null
                  : entry.path.slice(entry.path.lastIndexOf('/') + 1),
              line: entry.line,
              path: entry.path,
              symbol: entry.symbol,
              platform: entry.platform,
            };
            const entryName = codeEntryText(display);
            const entryIssues = issues.filter(
              (i) => i.rowId === entry._id && i.code !== 'unknown-field',
            );
            const invalid = (column: Column) =>
              entryIssues.some((i) => i.column === column) ||
              (error?.entryId === entry._id && error.column === column);
            const reasons = [
              ...entryIssues.map((i: AnnotationIssue) =>
                issueReason(project, annotation, i),
              ),
              ...(error?.entryId === entry._id ? [error.text] : []),
            ];
            const options = allowed.includes(entry.platform)
              ? allowed
              : [entry.platform, ...allowed];
            return (
              <div
                key={entry._id}
                class={
                  drag.state?.from === index
                    ? 'grid-row code-entry is-dragging'
                    : 'grid-row code-entry'
                }
                role="listitem"
                data-drag-row=""
                data-drop={drag.drop(index, entries.length)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  const onGrip = (e.target as HTMLElement).classList.contains(
                    'grid-grip',
                  );
                  const delta = moveKeyDelta(e, onGrip);
                  if (delta === 0) return;
                  e.preventDefault();
                  const to = index + delta;
                  if (to >= 0 && to < entries.length) move(index, to, true);
                }}
              >
                <span class="grid-cell grid-cell-grip">
                  {!readOnly && (
                    <button
                      type="button"
                      class="grid-grip"
                      aria-label={t('code.dragEntry', { entry: entryName })}
                      title={t('annotation.dragHint')}
                      {...drag.handle(index)}
                    >
                      <Icon name="grip" />
                    </button>
                  )}
                </span>
                <span class="code-entry-title">
                  <Tooltip label={codeEntryTooltip(display)}>
                    <strong class="code-entry-name">{entryName}</strong>
                  </Tooltip>
                  {entry.path !== null && (
                    <span class="code-entry-path muted">{entry.path}</span>
                  )}
                </span>
                <span class="code-entry-actions">
                  <CodeEntryActions project={project} entry={display} />
                  <ActionMenu
                    label={t('code.entryActions', { entry: entryName })}
                    disabled={readOnly}
                    items={[
                      {
                        label: t('code.moveUp'),
                        disabled: index === 0,
                        onSelect: () => move(index, index - 1, true),
                      },
                      {
                        label: t('code.moveDown'),
                        disabled: index === entries.length - 1,
                        onSelect: () => move(index, index + 1, true),
                      },
                      {
                        label: t('code.removeEntry'),
                        danger: true,
                        onSelect: () =>
                          actions.removeCodeRefEntry(annotation.id, field.key, entry._id),
                      },
                    ]}
                  />
                </span>
                <div class="code-entry-fields">
                  <span
                    class="code-entry-field code-entry-field-path"
                    data-focus={`${field.key}:${entry._id}:path`}
                  >
                    <TextField
                      size="sm"
                      label={t('code.path')}
                      placeholder={t('code.pathPlaceholder')}
                      invalid={invalid('path')}
                      disabled={readOnly}
                      value={entry.path ?? ''}
                      onCommit={(text) =>
                        update(entry, 'path', { path: text.trim() === '' ? null : text })
                      }
                    />
                  </span>
                  <span
                    class="code-entry-field code-entry-field-platform"
                    data-focus={`${field.key}:${entry._id}:platform`}
                  >
                    <Select
                      size="sm"
                      label={t('code.platform')}
                      value={entry.platform}
                      invalid={invalid('platform')}
                      disabled={readOnly}
                      onChange={(e) =>
                        update(entry, 'platform', { platform: e.currentTarget.value })
                      }
                    >
                      {options.map((id) => (
                        <option key={id} value={id}>
                          {platformName(id)}
                        </option>
                      ))}
                    </Select>
                  </span>
                  <span
                    class="code-entry-field code-entry-field-symbol"
                    data-focus={`${field.key}:${entry._id}:symbol`}
                  >
                    <TextField
                      size="sm"
                      label={t('code.symbol')}
                      invalid={invalid('symbol')}
                      disabled={readOnly}
                      value={entry.symbol ?? ''}
                      onCommit={(text) => update(entry, 'symbol', { symbol: text })}
                    />
                  </span>
                  <span
                    class="code-entry-field code-entry-field-line"
                    data-focus={`${field.key}:${entry._id}:line`}
                  >
                    <TextField
                      size="sm"
                      label={t('code.line')}
                      inputMode="numeric"
                      invalid={invalid('line')}
                      disabled={readOnly}
                      value={entry.line === null ? '' : String(entry.line)}
                      onCommit={(text) => {
                        const line = parseLineInput(text);
                        if (line === undefined) {
                          setError({
                            entryId: entry._id,
                            column: 'line',
                            text: t('code.invalidLine'),
                          });
                          return false;
                        }
                        return update(entry, 'line', { line });
                      }}
                    />
                  </span>
                </div>
                {reasons.length > 0 && (
                  <div class="code-entry-issues">
                    {reasons.map((reason) => (
                      <p key={reason} class="field-error">
                        {reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
