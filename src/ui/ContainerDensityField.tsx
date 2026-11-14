import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { ProjectContainer } from '../model';
import { Button } from './controls';
import { DensityControl } from './DensityControl';
import { formatDensity } from './density';
import { useEditor } from './EditorContext';
import { Property } from './PropertyGrid';

interface ContainerDensityFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
  /** Marker and note of the change, in review (through the Details extension point). */
  readonly mark?: ComponentChildren;
  readonly below?: ComponentChildren;
}

/**
 * Container density (v19): how many image pixels one unit of the component is worth. Ready list (1x
 * to 4x) and "Custom"; the suggestion from the specializations' ready sizes ("Suggestion: 3x (Phone
 * 360 × 800)") shows when it differs from the value, with the Apply button. It is never applied on
 * its own.
 */
export function ContainerDensityField({
  image,
  disabled,
  mark,
  below,
}: ContainerDensityFieldProps) {
  const { actions, derived } = useEditor();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const current = image.density ?? 1;
  const suggestion = derived.densitySuggestions.value.get(image.id) ?? null;
  const set = (density: number) => {
    setError(null);
    actions.setContainerDensity(image.id, density === 1 ? null : density);
  };
  return (
    <Property
      label={t('density.label')}
      for={id}
      hint={t('density.hint')}
      error={error}
      mark={mark}
      below={below}
    >
      <DensityControl
        id={id}
        size="sm"
        mode="confirm"
        value={current}
        disabled={disabled}
        invalid={error !== null}
        onChange={set}
        onInvalid={() => setError(t('density.error'))}
        onEdit={() => setError(null)}
      />
      {suggestion !== null && suggestion.density !== current && (
        <div class="density-suggestion">
          <span class="muted">
            {t('density.suggestion', {
              value: formatDensity(suggestion.density),
              name: `${suggestion.preset.name} ${t('library.typeSize', {
                width: suggestion.preset.width,
                height: suggestion.preset.height,
              })}`,
            })}
          </span>
          <Button size="sm" disabled={disabled} onClick={() => set(suggestion.density)}>
            {t('density.apply')}
          </Button>
        </div>
      )}
    </Property>
  );
}
