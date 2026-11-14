import { useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS, ariaKeys } from '../app/shortcuts';
import { t } from '../i18n';
import {
  parseRefValue,
  projectIndex,
  refLabel,
  resolveRef,
  type Annotation,
  type JsonValue,
  type Project,
  type SpecRefColumn,
} from '../model';
import type { ActionResult } from '../store/history';
import type { AnnotationLocation } from '../store/ui';
import { IconButton, Tooltip } from './controls';
import { classes } from './controls/classes';
import { Icon } from './icons';
import { RefPicker } from './RefPicker';
import { labelTexts, refButtonName } from './typedText';

// Cell of a table `ref` column (ME4, decision (e)): the compact version of `RefField`.
// Shows the target (or "Choose…", or the broken reference) and opens the compact picker (also
// with Ctrl+B); Ctrl+click goes to the target; ✕ clears. It is data: no arrow is drawn.

/** Ctrl+B (Cmd+B on macOS): choose the cell's target while focused. */
function isPickKey(e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  );
}

export interface RefCellProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** Key of the `table` field and `_id` of the row: where the targets and the current value come from. */
  readonly tableKey: string;
  readonly rowId: string;
  readonly column: SpecRefColumn;
  readonly value: JsonValue | undefined;
  /** Accessible name of the control (the column and the row). */
  readonly label: string;
  readonly readOnly: boolean;
  /** Pending item in the cell (required empty, broken target…): invalid state. */
  readonly invalid?: boolean;
  /** Reason for the pending item (tooltip). */
  readonly title?: string;
  /** Writes the reference (`null` clears). */
  readonly onSet: (value: JsonValue) => ActionResult;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

export function RefCell({
  project,
  annotation,
  tableKey,
  rowId,
  column,
  value,
  label,
  readOnly,
  invalid = false,
  title,
  onSet,
  onGoToAnnotation,
}: RefCellProps) {
  const [picking, setPicking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const ref = parseRefValue(value);
  const target = ref ? resolveRef(project, ref) : null;
  const hasValue = value != null && value !== '';
  const broken = hasValue && !target;
  const text = !hasValue
    ? t('ref.choosePlaceholder')
    : ref && target
      ? refLabel(project, ref, labelTexts())
      : t('ref.broken');
  const layer = target
    ? projectIndex(project).layers.get(target.annotation.layerId)
    : undefined;
  const tip = [
    hasValue && !broken ? `→ ${text}${layer ? ` (${layer.name})` : ''}` : text,
    title ?? '',
  ]
    .filter((s) => s !== '')
    .join(' · ');

  const open = () => {
    if (!readOnly) setPicking(true);
  };

  return (
    <div
      class="ref-field ref-cell"
      onKeyDown={(e) => {
        if (!isPickKey(e)) return;
        e.preventDefault();
        open();
      }}
    >
      <Tooltip label={`${tip} · ${t('ref.choose')}  ${SHORTCUT_LABELS.pickRef}`}>
        {/* Exception to Button: reference field (select look) (docs/DESIGN-SYSTEM.md, "Loose buttons") */}
        <button
          ref={button}
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
          aria-label={refButtonName(
            label,
            !hasValue
              ? { kind: 'empty' }
              : broken || !target
                ? { kind: 'broken' }
                : { kind: 'value', value: text },
          )}
          aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.pickRef)}
          disabled={readOnly}
          onClick={(e) => {
            if ((e.ctrlKey || e.metaKey) && target) onGoToAnnotation(target.annotation);
            else open();
          }}
        >
          <Icon name={!hasValue ? 'search' : broken ? 'warning' : 'arrowRight'} />
          <span class="ref-control-text">{text}</span>
        </button>
      </Tooltip>
      <IconButton
        icon="close"
        label={`${t('ref.clear')} (${label})`}
        disabled={readOnly || !hasValue}
        onClick={() => onSet(null)}
      />
      {picking && (
        <RefPicker
          compact
          project={project}
          annotation={annotation}
          field={column}
          cell={{ tableKey, rowId }}
          // The picker returns focus to the cell on close (while it is open, the table is inert).
          returnFocus={() => button.current}
          onClose={() => setPicking(false)}
          onPick={(picked, andGo) => {
            setPicking(false);
            onSet({ ...picked.ref });
            if (andGo) onGoToAnnotation(picked.annotation);
          }}
        />
      )}
    </div>
  );
}
