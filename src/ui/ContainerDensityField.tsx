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
  /** Marcador e nota da mudança, na revisão (pelo ponto de extensão dos Detalhes). */
  readonly mark?: ComponentChildren;
  readonly below?: ComponentChildren;
}

/**
 * Densidade do container (v19): quantos pixels da imagem vale uma unidade do componente. Lista
 * pronta (1x a 4x) e "Personalizada"; a sugestão pelos tamanhos prontos das especializações
 * ("Sugestão: 3x (Celular 360 × 800)") aparece quando difere do valor, com o botão Aplicar. Nunca
 * se aplica sozinha.
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
