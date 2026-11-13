import { useId, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  canAnchorTo,
  canEditMarkingGeometry,
  effectiveDensity,
  markingAnchorDefaults,
  markingComponent,
  markingTypeName,
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

// Seção Âncora dos Detalhes (etapa "direção e âncora", R4, decisão 13): a marcação encostada em
// outra do mesmo espaço (Âncora, Lado, Alinhamento, Deslocamento) e o botão "Encostar na âncora".
// Escolher a âncora só grava a relação; quem move é o Encostar (e o Arrumar).

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

/** "Nome (Tipo)" quando a marcação tem os dois; senão o rótulo de sempre. */
function optionLabel(project: Project, marking: Marking): string {
  const type = markingTypeName(project, marking.id);
  return marking.name !== null && type !== null
    ? `${marking.name} (${type})`
    : markingLabel(project, marking);
}

/** O que os campos da seção compartilham: a âncora, o que ela vale de fato e como gravar. */
interface AnchorForm {
  readonly anchor: MarkingAnchor | null;
  /** Lado, alinhamento e deslocamento efetivos (o padrão do componente onde a âncora não diz). */
  readonly resolved: ResolvedMarkingAnchor | null;
  /** As marcações do mesmo espaço a que esta pode se ancorar (mais a atual, se for outra). */
  readonly candidates: readonly Marking[];
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
  /** Mostra o erro de uma action recusada; `true` se foi aceita. */
  readonly report: (result: ActionResult) => boolean;
  /** Grava a âncora com `patch` por cima da atual (só vale com âncora). */
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
  const candidates = (
    derived.markingsBySpace.value.get(marking.containerId) ?? []
  ).filter((m) => canAnchorTo(project, marking.id, m.id) || m.id === anchor?.to);
  return {
    anchor,
    resolved,
    candidates,
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

function TargetField({
  form,
  project,
  readOnly,
}: {
  readonly form: AnchorForm;
  readonly project: Project;
  readonly readOnly: boolean;
}) {
  const id = useId();
  return (
    <Property label={t('anchor.target')} for={id} hint={t('anchor.targetHint')}>
      <Select
        id={id}
        size="sm"
        value={form.anchor?.to ?? ''}
        disabled={readOnly}
        onChange={(e) => form.setTarget(e.currentTarget.value)}
      >
        <option value="">{t('anchor.none')}</option>
        {form.candidates.map((m) => (
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

/** Um dos dois números do deslocamento (pixels do container): grava ao confirmar. */
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
      <div class="props-pair">
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

/** O botão: com âncora, sem trava de geometria e na Principal (como o Arrumar). */
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
 * A seção vale para a marcação que desenha um componente (a âncora serve ao `$anchor.*` e ao
 * encosto do tipo) e para a que já traz uma âncora (vinda do MCP), para dar a ver e tirar.
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
  const target = form.candidates.find((m) => m.id === form.anchor?.to);
  return (
    <Section
      section={{ kind: 'anchor' }}
      title={t('anchor.section')}
      summary={target ? optionLabel(project, target) : t('anchor.none')}
    >
      <PropertyGrid>
        <TargetField form={form} project={project} readOnly={readOnly} />
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
