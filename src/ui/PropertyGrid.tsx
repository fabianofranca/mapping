import type { ComponentChildren } from 'preact';
import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import type { SpecNotice } from '../model';
import { HelpTip } from './controls';
import { NoticeLabelIcon, NoticeLines } from './NoticeBadge';

// DS 2.0 PropertyGrid: label on the left (`--size-label-col` column) and control on the
// right. The states come from the controls.

export function PropertyGrid({ children }: { readonly children: ComponentChildren }) {
  return <div class="props">{children}</div>;
}

interface PropertyProps {
  readonly label: ComponentChildren;
  /** `id` of the control: the label becomes `<label for>` (clicking it focuses the field). */
  readonly for?: string;
  readonly required?: boolean;
  /**
   * Explanation of the field: a `HelpTip` next to the label (named "About {label}") and, with
   * `for`, the control's accessible description (`aria-describedby`). Needs a text `label`.
   */
  readonly hint?: string;
  /** The subject of the `HelpTip` when the label is not plain text ("About {hintName}"). */
  readonly hintName?: string;
  /** Error of a refused edit, below the control (announced). */
  readonly error?: string | null;
  /** Pending issue of the stored value (e.g. empty required), below the control. */
  readonly issue?: string | null;
  /** State warning below the control (e.g. list without options): always visible. */
  readonly status?: ComponentChildren;
  /** Target of the link of a pending issue (`data-focus`). */
  readonly focusKey?: string;
  /**
   * The key of an annotation's typed field (`data-field`): it is how Ctrl+C finds the
   * focused property and copies the `…/f/<field>` reference.
   */
  readonly fieldKey?: string;
  /** The ⋯ menu of the field, at the end of the label column (Copy reference, Cite, Comment). */
  readonly menu?: ComponentChildren;
  /**
   * Piece at the end of the label column (the review marker, via the Details extension
   * point). With it the label sits in its own cell: a button cannot go inside the
   * `<label>`.
   */
  readonly mark?: ComponentChildren;
  /** Row below the control (the change note, in the review), via the extension point. */
  readonly below?: ComponentChildren;
  /** Warnings from the field's specialization: the icon on the label and a row below the control. */
  readonly notices?: readonly SpecNotice[];
  readonly children: ComponentChildren;
}

/** Adds (or removes) an `id` in the control's `aria-describedby`, keeping what is already there. */
function describeControl(
  root: HTMLElement | null,
  controlId: string,
  descriptionId: string,
): () => void {
  const control = [...(root?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(
    (el) => el.id === controlId,
  );
  if (!control) return () => undefined;
  const ids = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.includes(descriptionId)) {
    control.setAttribute('aria-describedby', [...ids, descriptionId].join(' '));
  }
  return () => {
    const rest = (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== descriptionId);
    if (rest.length > 0) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
  };
}

/** Label text (as plain text, for the `HelpTip` name). */
function plainLabel(label: ComponentChildren): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : '';
}

interface LabelProps {
  readonly label: ComponentChildren;
  readonly htmlFor?: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly hintName?: string;
  readonly descriptionId: string;
  readonly mark?: ComponentChildren;
  readonly menu?: ComponentChildren;
  readonly fieldKey?: string;
  readonly notices?: readonly SpecNotice[];
}

/** Is there something next to the label (explanation, review marker or field warning)? */
function hasLabelExtras(
  hint: string | undefined,
  extras: readonly ComponentChildren[],
  notices: readonly SpecNotice[] | undefined,
): boolean {
  const present = extras.some((x) => x !== undefined && x !== null && x !== false);
  return Boolean(hint) || present || (notices?.length ?? 0) > 0;
}

/** The label cell: the text, the explanation `HelpTip` and the review marker. */
function LabelCell({
  label,
  htmlFor,
  required,
  hint,
  hintName,
  descriptionId,
  mark,
  menu,
  fieldKey,
  notices,
}: LabelProps) {
  const text = (
    <>
      {label}
      {required && (
        <span
          class="required"
          title={t('typed.required')}
          aria-label={t('typed.required')}
        >
          {' *'}
        </span>
      )}
    </>
  );
  const labelCell = htmlFor ? (
    <label class="props-label" for={htmlFor}>
      {text}
    </label>
  ) : (
    <span class="props-label">{text}</span>
  );
  if (!hasLabelExtras(hint, [mark, menu], notices)) return labelCell;
  return (
    <div class="props-label-cell" data-field={fieldKey}>
      {labelCell}
      {hint && (
        <HelpTip
          name={hintName ?? plainLabel(label)}
          text={hint}
          descriptionId={descriptionId}
        />
      )}
      <NoticeLabelIcon notices={notices} />
      {mark}
      {menu}
    </div>
  );
}

/** A grid row: label and control (with error and warning below). */
export function Property({
  label,
  for: htmlFor,
  required,
  hint,
  hintName,
  error,
  issue,
  status,
  focusKey,
  fieldKey,
  menu,
  mark,
  below,
  notices,
  children,
}: PropertyProps) {
  const descriptionId = useId();
  const valueRef = useRef<HTMLDivElement>(null);
  const described = htmlFor !== undefined && hint !== undefined && hint !== '';
  // The control (of any type) gets the explanation as its accessible description, so that
  // each caller does not repeat the `aria-describedby`.
  useLayoutEffect(() => {
    if (!described) return undefined;
    return describeControl(valueRef.current, htmlFor, descriptionId);
  });
  return (
    <>
      <LabelCell
        label={label}
        htmlFor={htmlFor}
        required={required}
        hint={hint || undefined}
        hintName={hintName}
        descriptionId={descriptionId}
        mark={mark}
        menu={menu}
        fieldKey={fieldKey}
        notices={notices}
      />
      <div class="props-value" data-focus={focusKey} data-field={fieldKey} ref={valueRef}>
        {children}
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
        {issue && !error && <p class="field-error">{issue}</p>}
        {status && <small class="props-status">{status}</small>}
        <NoticeLines notices={notices} />
        {below}
      </div>
    </>
  );
}
