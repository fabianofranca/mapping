import { useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
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
import { IconButton } from './controls';
import { classes } from './controls/classes';
import { Icon } from './icons';
import { RefPicker } from './RefPicker';
import { labelTexts } from './typedText';

// Célula de uma coluna `ref` de tabela (ME4, decisão (e)): a versão compacta do `RefField`.
// Mostra o alvo (ou "Escolher…", ou a referência quebrada) e abre o seletor compacto (também
// com Ctrl+B); Ctrl+clique vai até o alvo; ✕ limpa. É dado: nenhuma seta é desenhada.

/** Ctrl+B (Cmd+B no macOS): escolher o alvo da célula em foco. */
function isPickKey(e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  );
}

export interface RefCellProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** Chave do campo `table` e `_id` da linha: de onde vêm os alvos e o valor atual. */
  readonly tableKey: string;
  readonly rowId: string;
  readonly column: SpecRefColumn;
  readonly value: JsonValue | undefined;
  /** Nome acessível do controle (a coluna e a linha). */
  readonly label: string;
  readonly readOnly: boolean;
  /** Pendência na célula (obrigatória vazia, alvo quebrado…): estado inválido. */
  readonly invalid?: boolean;
  /** Motivo da pendência (dica). */
  readonly title?: string;
  /** Grava a referência (`null` limpa). */
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
    .join('\n');

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
        aria-label={t('ref.fieldButton', { field: label, value: text })}
        aria-keyshortcuts="Control+B"
        title={`${tip}\n${t('ref.choose')}  ${SHORTCUT_LABELS.pickRef}`}
        disabled={readOnly}
        onClick={(e) => {
          if ((e.ctrlKey || e.metaKey) && target) onGoToAnnotation(target.annotation);
          else open();
        }}
      >
        <Icon name={!hasValue ? 'search' : broken ? 'warning' : 'arrowRight'} />
        <span class="ref-control-text">{text}</span>
      </button>
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
          // O seletor devolve o foco à célula ao fechar (com ele aberto, a tabela é inerte).
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
