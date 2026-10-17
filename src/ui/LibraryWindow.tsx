import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import type { ComponentType, Project } from '../model';
import { useEditor } from './EditorContext';
import { componentTarget } from './componentTarget';
import { Button } from './controls';
import { libraryErrorMessage } from './labels';
import { ToolWindow } from './ToolWindow';

// Janela Biblioteca (etapa Biblioteca, B3), à esquerda: os componentes das especializações
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

interface LibraryWindowProps {
  /** Abre o diálogo de Especializações (atalho do estado vazio). */
  readonly onOpenSpecs: () => void;
}

export function LibraryWindow({ onOpenSpecs }: LibraryWindowProps) {
  const editor = useEditor();
  const { actions, derived, review, store, ui } = editor;
  const [error, setError] = useState<string | null>(null);
  const project = review.derived.shownProject.value;
  const types = derived.componentTypes.value;
  const readOnly = store.locked.value;
  // Só o "há uma tela possível" importa para a janela: ela não renderiza a cada pan.
  const hasTarget = useComputed(() => componentTarget(editor) !== null).value;
  if (!project) return null;

  const add = (type: ComponentType) => {
    const target = componentTarget(editor);
    if (!target) return;
    const result = actions.addComponent({
      imageId: target.imageId,
      parentId: target.parentId,
      specId: type.specId,
      typeId: type.typeId,
      ...(target.center ? { center: target.center } : {}),
    });
    if (!result.ok) {
      setError(libraryErrorMessage(result.error));
      return;
    }
    setError(null);
    ui.selection.value = { kind: 'marking', id: result.value };
  };

  const disabledHint = readOnly
    ? t('library.readOnly')
    : hasTarget
      ? undefined
      : t('library.noScreen');

  return (
    <ToolWindow id="library">
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
                          disabled={readOnly || !hasTarget}
                          title={disabledHint}
                          onClick={() => add(type)}
                        >
                          {t('library.add')}
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
    </ToolWindow>
  );
}
