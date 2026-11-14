import { useId, useMemo, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  anchorCandidates,
  canEditMarkingGeometry,
  effectiveDensity,
  markingAnchorDefaults,
  markingComponent,
  markingTypeName,
  projectIndex,
  resolveMarkingAnchor,
  type AnchorAlign,
  type AnchorSide,
  type Marking,
  type MarkingAnchor,
  type Project,
  type ResolvedMarkingAnchor,
} from '../model';
import type { ActionResult } from '../store/history';
import { Button, Segmented, Select, TextField } from './controls';
import { Section } from './DetailsSection';
import { snapMarking } from './arrange';
import { useEditor } from './EditorContext';
import { markingErrorMessage, markingLabel } from './labels';
import { usePrincipalOnly } from './PerspectivesSection';
import { Property, PropertyGrid } from './PropertyGrid';

// Anchor section of the Details (stage "direction and anchor", R4, decision 13): the marking snapped to
// another in the same space (Anchor, Side, Alignment, Offset) and the "Snap to anchor" button.
// Picking the anchor only saves the relation; what moves it is Snap (and Tidy).

const SIDE_LABELS: Readonly<Record<AnchorSide, TranslationKey>> = {
  top: 'anchor.sideTop',
  bottom: 'anchor.sideBottom',
  start: 'anchor.sideStart',
  end: 'anchor.sideEnd',
};

const ALIGN_LABELS: Readonly<Record<AnchorAlign, TranslationKey>> = {
  start: 'anchor.alignStart',
  center: 'anchor.alignCenter',
  end: 'anchor.alignEnd',
};

/** "Name (Type)" when the marking has both; otherwise the usual label. */
function optionLabel(project: Project, marking: Marking): string {
  const type = markingTypeName(project, marking.id);
  return marking.name !== null && type !== null
    ? `${marking.name} (${type})`
    : markingLabel(project, marking);
}

/** What the section's fields share: the anchor, what it actually is and how to save. */
interface AnchorForm {
  readonly anchor: MarkingAnchor | null;
  /** Effective side, alignment and offset (the component's default where the anchor does not say). */
  readonly resolved: ResolvedMarkingAnchor | null;
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
  /** Shows the error of a refused action; `true` if it was accepted. */
  readonly report: (result: ActionResult) => boolean;
  /** Saves the anchor with `patch` on top of the current one (only valid with an anchor). */
  readonly write: (patch: Partial<MarkingAnchor>) => boolean;
  readonly setTarget: (to: string) => void;
}

function useAnchorForm(project: Project, marking: Marking): AnchorForm {
  const { actions, derived } = useEditor();
  const [error, setError] = useState<string | null>(null);
  const anchor = marking.anchor ?? null;
  const report = (result: ActionResult): boolean => {
    setError(result.ok ? null : markingErrorMessage(result.error));
    return result.ok;
  };
  const resolved =
    anchor === null
      ? null
      : resolveMarkingAnchor(
          anchor,
          markingAnchorDefaults(project, derived.catalog.value)(marking),
          effectiveDensity(project, marking.containerId),
        );
  return {
    anchor,
    resolved,
    error,
    setError,
    report,
    write: (patch) =>
      anchor !== null &&
      report(actions.setMarkingAnchor(marking.id, { ...anchor, ...patch })),
    setTarget: (to) =>
      report(
        actions.setMarkingAnchor(
          marking.id,
          to === '' ? null : { ...(anchor ?? {}), to },
        ),
      ),
  };
}

interface FieldsProps {
  readonly form: AnchorForm;
  readonly disabled: boolean;
}

/** How many `<option>` candidates the list shows (the space may have thousands of markings). */
export const ANCHOR_CANDIDATE_LIMIT = 200;

/**
 * The markings of the same space this one can anchor to (`anchorCandidates`, one scan),
 * up to `ANCHOR_CANDIDATE_LIMIT`, plus the current one, if it is another; `more` says the list was cut.
 * Only the `Select` reads them: a marking that does not show the section does not pay for the space scan. The
 * computation is memoized by the project (the space's list is the same while it does not change).
 */
function useAnchorCandidates(
  project: Project,
  marking: Marking,
  anchor: MarkingAnchor | null,
): { readonly list: readonly Marking[]; readonly more: boolean } {
  const { derived } = useEditor();
  const space = derived.markingsBySpace.value.get(marking.containerId);
  const target = anchor?.to;
  return useMemo(() => {
    const all = anchorCandidates(project, marking.id, space ?? []);
    const list = all.slice(0, ANCHOR_CANDIDATE_LIMIT);
    const current = target === undefined ? undefined : all.find((m) => m.id === target);
    if (current !== undefined && !list.includes(current)) list.push(current);
    return { list, more: all.length > list.length };
  }, [project, marking.id, space, target]);
}

function TargetField({
  form,
  project,
  marking,
  readOnly,
}: {
  readonly form: AnchorForm;
  readonly project: Project;
  readonly marking: Marking;
  readonly readOnly: boolean;
}) {
  const id = useId();
  const { list, more } = useAnchorCandidates(project, marking, form.anchor);
  const hint = more
    ? `${t('anchor.targetHint')} ${t('anchor.targetLimited', { count: ANCHOR_CANDIDATE_LIMIT })}`
    : t('anchor.targetHint');
  return (
    <Property label={t('anchor.target')} for={id} hint={hint}>
      <Select
        id={id}
        size="sm"
        value={form.anchor?.to ?? ''}
        disabled={readOnly}
        onChange={(e) => form.setTarget(e.currentTarget.value)}
      >
        <option value="">{t('anchor.none')}</option>
        {list.map((m) => (
          <option key={m.id} value={m.id}>
            {optionLabel(project, m)}
          </option>
        ))}
      </Select>
    </Property>
  );
}

function SideAndAlignFields({ form, disabled }: FieldsProps) {
  return (
    <>
      <Property label={t('anchor.side')} hint={t('anchor.sideHint')}>
        <Segmented
          label={t('anchor.side')}
          disabled={disabled}
          value={form.resolved?.side ?? null}
          items={ANCHOR_SIDES.map((side) => ({ id: side, label: t(SIDE_LABELS[side]) }))}
          onSelect={(side) => form.write({ side })}
        />
      </Property>
      <Property label={t('anchor.align')} hint={t('anchor.alignHint')}>
        <Segmented
          label={t('anchor.align')}
          disabled={disabled}
          value={form.resolved?.align ?? null}
          items={ANCHOR_ALIGNS.map((align) => ({
            id: align,
            label: t(ALIGN_LABELS[align]),
          }))}
          onSelect={(align) => form.write({ align })}
        />
      </Property>
    </>
  );
}

/** One of the two offset numbers (container pixels): saves on confirm. */
function OffsetNumber({
  form,
  disabled,
  axis,
  short,
  label,
}: FieldsProps & {
  readonly axis: 'main' | 'cross';
  readonly short: string;
  readonly label: string;
}) {
  const commit = (text: string): boolean => {
    const value = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(value)) {
      form.setError(t('anchor.error.number'));
      return false;
    }
    if (form.resolved !== null) {
      form.write({ offset: { ...form.resolved.offset, [axis]: value } });
    }
    return false;
  };
  return (
    <label class="props-pair-item" title={label}>
      <span class="props-pair-label" aria-hidden="true">
        {short}
      </span>
      <TextField
        size="sm"
        type="number"
        inputMode="numeric"
        step={1}
        aria-label={label}
        disabled={disabled}
        value={String(form.resolved?.offset[axis] ?? 0)}
        onCommit={commit}
      />
    </label>
  );
}

function OffsetFields({ form, disabled }: FieldsProps) {
  return (
    <Property label={t('anchor.offset')} hint={t('anchor.offsetHint')}>
      <div class="props-pair props-pair-stack">
        <OffsetNumber
          form={form}
          disabled={disabled}
          axis="main"
          short={t('anchor.offsetMainShort')}
          label={t('anchor.offsetMain')}
        />
        <OffsetNumber
          form={form}
          disabled={disabled}
          axis="cross"
          short={t('anchor.offsetCrossShort')}
          label={t('anchor.offsetCross')}
        />
      </div>
    </Property>
  );
}

/** The button: with an anchor, without a geometry lock and on the Main one (like Tidy). */
function SnapButton({
  marking,
  project,
  disabled,
}: {
  readonly marking: Marking;
  readonly project: Project;
  readonly disabled: boolean;
}) {
  const editor = useEditor();
  const principalOnly = usePrincipalOnly('arrange');
  return (
    <div class="row">
      <Button
        title={t(principalOnly ? 'perspective.principalOnly' : 'anchor.snapHint')}
        disabled={
          disabled || principalOnly || !canEditMarkingGeometry(project, marking.id)
        }
        onClick={() => snapMarking(editor, marking.id)}
      >
        {t('anchor.snap')}
      </Button>
    </div>
  );
}

interface MarkingAnchorSectionProps {
  readonly project: Project;
  readonly marking: Marking;
  readonly readOnly: boolean;
}

/**
 * The section applies to a marking that draws a component (the anchor serves `$anchor.*` and the
 * type's snapping) and to one that already carries an anchor (from the MCP), to show and remove it.
 */
export function MarkingAnchorSection({
  project,
  marking,
  readOnly,
}: MarkingAnchorSectionProps) {
  const { derived } = useEditor();
  const form = useAnchorForm(project, marking);
  const drawsComponent = markingComponent(project, derived.catalog.value, marking.id);
  if (form.anchor === null && drawsComponent === null) return null;
  const disabled = readOnly || form.anchor === null;
  const target =
    form.anchor === null ? undefined : projectIndex(project).markings.get(form.anchor.to);
  return (
    <Section
      section={{ kind: 'anchor' }}
      title={t('anchor.section')}
      summary={target ? optionLabel(project, target) : t('anchor.none')}
    >
      <PropertyGrid>
        <TargetField
          form={form}
          project={project}
          marking={marking}
          readOnly={readOnly}
        />
        <SideAndAlignFields form={form} disabled={disabled} />
        <OffsetFields form={form} disabled={disabled} />
      </PropertyGrid>
      {form.error && (
        <p class="field-error" role="alert">
          {form.error}
        </p>
      )}
      <SnapButton marking={marking} project={project} disabled={disabled} />
    </Section>
  );
}
