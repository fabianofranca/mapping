import { t } from '../i18n';
import type { ComponentType, Project } from '../model';
import { useEditor } from './EditorContext';
import { Button } from './controls';
import { useAddComponent } from './useAddComponent';

// Paleta (etapa Biblioteca, B3; aba Paleta da janela Catálogo, B5): os componentes das especializações
// aplicadas, por especialização e camada, cada um com o botão Adicionar. O componente
// novo vai para o container selecionado ou para a tela à vista (`componentTarget`).

interface LibraryGroup {
  readonly specId: string;
  readonly specName: string;
  readonly layers: readonly {
    readonly layerId: string;
    readonly layerName: string;
    readonly types: readonly ComponentType[];
  }[];
}

/** Os tipos agrupados por especialização e camada, na ordem em que a paleta os recebe. */
function groupTypes(
  project: Project,
  types: readonly ComponentType[],
): readonly LibraryGroup[] {
  const groups: {
    specId: string;
    specName: string;
    layers: { layerId: string; layerName: string; types: ComponentType[] }[];
  }[] = [];
  for (const type of types) {
    let group = groups.find((g) => g.specId === type.specId);
    if (!group) {
      const spec = project.specializations.find((s) => s.id === type.specId)?.spec;
      group = { specId: type.specId, specName: spec?.name ?? type.specId, layers: [] };
      groups.push(group);
    }
    let layer = group.layers.find((l) => l.layerId === type.layerId);
    if (!layer) {
      const name = project.specializations
        .find((s) => s.id === type.specId)
        ?.spec?.layers.find((l) => l.id === type.layerId)?.name;
      layer = { layerId: type.layerId, layerName: name ?? type.layerId, types: [] };
      group.layers.push(layer);
    }
    layer.types.push(type);
  }
  return groups;
}

interface LibraryPaletteProps {
  /** Abre o diálogo de Especializações (atalho do estado vazio). */
  readonly onOpenSpecs: () => void;
}

export function LibraryPalette({ onOpenSpecs }: LibraryPaletteProps) {
  const { derived, review } = useEditor();
  const { add, label, disabledReason, error } = useAddComponent();
  const project = review.derived.shownProject.value;
  const types = derived.componentTypes.value;
  if (!project) return null;

  return (
    <>
      {types.length === 0 ? (
        <div class="library-empty">
          <p class="muted">{t('library.empty')}</p>
          <Button onClick={onOpenSpecs}>{t('library.openSpecs')}</Button>
        </div>
      ) : (
        <div class="library-list">
          {error && (
            <p class="field-error" role="alert">
              {error}
            </p>
          )}
          {groupTypes(project, types).map((group) => (
            <section key={group.specId} class="library-group" aria-label={group.specName}>
              <h3 class="library-spec">{group.specName}</h3>
              {group.layers.map((layer) => (
                <div key={layer.layerId} class="library-layer">
                  <h4 class="library-layer-name">{layer.layerName}</h4>
                  <ul class="library-types">
                    {layer.types.map((type) => (
                      <li key={type.typeId} class="library-type">
                        <span class="library-type-main">
                          <span class="library-type-name">{type.name}</span>
                          {type.container && (
                            <span class="badge">{t('library.container')}</span>
                          )}
                          <span class="muted library-type-size">
                            {t('library.typeSize', type.component.size)}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          aria-label={t('library.addType', { name: type.name })}
                          disabled={disabledReason !== undefined}
                          title={disabledReason ?? label}
                          onClick={() => add(type.specId, type.typeId)}
                        >
                          {label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
