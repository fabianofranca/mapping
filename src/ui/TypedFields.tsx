import { useId, useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  fieldLabel,
  getBacklinks,
  parseRefValue,
  projectIndex,
  refLabel,
  resolveRef,
  type SpecField,
} from '../model';
import { CodeRefField } from './CodeRefField';
import { BacklinkList, SimpleEditor, type FieldContext } from './FieldEditors';
import { IconButton } from './controls';
import { classes } from './controls/classes';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { Property } from './PropertyGrid';
import { RefPicker, type RefFieldDef } from './RefPicker';
import { TableField } from './TableField';
import { issueReason, issuesOf, labelTexts } from './typedText';

export type { FieldContext } from './FieldEditors';

/**
 * Um campo da anotação tipada, numa linha da grade de propriedades (a tabela ocupa
 * a largura toda). Pendência no campo: estado inválido e o motivo embaixo.
 */
export function TypedField({
  field,
  ...ctx
}: FieldContext & { readonly field: SpecField }) {
  const { actions } = useEditor();
  const id = useId();
  const { project, annotation, readOnly } = ctx;

  if (field.type === 'table') return <TableField field={field} {...ctx} />;
  if (field.type === 'codeRef') return <CodeRefField field={field} {...ctx} />;

  const value = annotation.values?.[field.key];
  const backlinks = getBacklinks(project, annotation.id).filter(
    (b) => 'key' in b.ref && !('rowId' in b.ref) && b.ref.key === field.key,
  );
  const issue = issuesOf(project, annotation.id).find(
    (i) => i.key === field.key && i.rowId === undefined && i.code !== 'unknown-field',
  );
  const label = fieldLabel(field);

  return (
    <Property
      label={label}
      for={id}
      required={field.required}
      hint={field.description}
      focusKey={field.key}
      issue={issue ? issueReason(project, annotation, issue) : null}
      note={field.description}
    >
      {field.type === 'ref' ? (
        <RefField id={id} field={field} invalid={issue !== undefined} {...ctx} />
      ) : (
        <SimpleEditor
          id={id}
          field={field}
          value={value}
          label={label}
          readOnly={readOnly}
          invalid={issue !== undefined}
          onSet={(next) => actions.setFieldValue(annotation.id, field.key, next)}
        />
      )}
      <BacklinkList
        project={project}
        backlinks={backlinks}
        onGoToAnnotation={ctx.onGoToAnnotation}
      />
    </Property>
  );
}

/** Ctrl+B (Cmd+B no macOS): escolher o alvo da referência em foco. */
function isPickKey(e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  );
}

/**
 * ReferenceField do DS 2.0: o botão mostra o alvo (ou "Escolher…", ou a referência
 * quebrada) e abre o seletor (também com Ctrl+B); Ctrl+clique ou ↗ vai até o alvo;
 * ✕ limpa.
 */
function RefField({
  id,
  field,
  invalid,
  ...ctx
}: FieldContext & {
  readonly id: string;
  readonly field: RefFieldDef;
  readonly invalid: boolean;
}) {
  const { actions } = useEditor();
  const { project, annotation, readOnly } = ctx;
  const [picking, setPicking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const ref = parseRefValue(annotation.values?.[field.key]);
  const target = ref ? resolveRef(project, ref) : null;
  const hasValue = annotation.values?.[field.key] != null;
  const broken = hasValue && !target;
  const text = !hasValue
    ? t('ref.choosePlaceholder')
    : ref && target
      ? refLabel(project, ref, labelTexts())
      : t('ref.broken');
  const layer = target
    ? projectIndex(project).layers.get(target.annotation.layerId)
    : undefined;

  const goTo = () => {
    if (target) ctx.onGoToAnnotation(target.annotation);
  };
  const open = () => {
    if (!readOnly) setPicking(true);
  };

  return (
    <div
      class="ref-field"
      onKeyDown={(e) => {
        if (!isPickKey(e)) return;
        e.preventDefault();
        open();
      }}
    >
      <button
        ref={button}
        id={id}
        type="button"
        class={classes(
          'ref-control',
          !hasValue && 'is-empty',
          broken && 'is-broken',
          invalid && !broken && 'input-invalid',
        )}
        aria-haspopup="dialog"
        aria-expanded={picking}
        aria-invalid={invalid || undefined}
        aria-label={t('ref.fieldButton', { field: fieldLabel(field), value: text })}
        aria-keyshortcuts="Control+B"
        title={`${t('ref.choose')}  ${SHORTCUT_LABELS.pickRef}`}
        disabled={readOnly}
        onClick={(e) => {
          if ((e.ctrlKey || e.metaKey) && target) goTo();
          else open();
        }}
      >
        <Icon name={!hasValue ? 'search' : broken ? 'warning' : 'arrowRight'} />
        <span class="ref-control-text">{hasValue && !broken ? `→ ${text}` : text}</span>
        {layer && <span class="ref-control-layer">{layer.name}</span>}
      </button>
      <IconButton
        icon="externalLink"
        label={t('ref.goTo')}
        shortcut={t('ref.goToShortcut')}
        disabled={!target}
        onClick={goTo}
      />
      <IconButton
        icon="close"
        label={t('ref.clear')}
        disabled={readOnly || !hasValue}
        onClick={() => actions.setFieldValue(annotation.id, field.key, null)}
      />
      {picking && (
        <RefPicker
          project={project}
          annotation={annotation}
          field={field}
          onClose={() => {
            setPicking(false);
            button.current?.focus();
          }}
          onPick={(picked, andGo) => {
            setPicking(false);
            actions.setFieldValue(annotation.id, field.key, { ...picked.ref });
            if (andGo) ctx.onGoToAnnotation(picked.annotation);
            else button.current?.focus();
          }}
        />
      )}
    </div>
  );
}
