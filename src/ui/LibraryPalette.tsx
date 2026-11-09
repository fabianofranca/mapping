import { COMPONENT_DRAG_MIME, setDraggedComponent } from '../app/componentDrag';
import { t } from '../i18n';
import {
  findSpecType,
  projectIndex,
  typeKey,
  type ComponentType,
  type Project,
} from '../model';
import { ContainerMark } from './ContainerMark';
import { useEditor } from './EditorContext';
import { Button } from './controls';
import { useAddComponent } from './useAddComponent';
import { TypeNoticeBadge } from './NoticeBadge';

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
  const specs = projectIndex(project).specializations;
  const groups: {
    specId: string;
    specName: string;
    layers: { layerId: string; layerName: string; types: ComponentType[] }[];
  }[] = [];
  // Um mapa por especialização e por camada, em vez de `find` a cada tipo.
  const groupById = new Map<string, (typeof groups)[number]>();
  const layerByKey = new Map<string, (typeof groups)[number]['layers'][number]>();
  for (const type of types) {
    const spec = specs.get(type.specId)?.spec;
    let group = groupById.get(type.specId);
    if (!group) {
      group = { specId: type.specId, specName: spec?.name ?? type.specId, layers: [] };
      groupById.set(type.specId, group);
      groups.push(group);
    }
    const layerKey = typeKey(type.specId, type.layerId);
    let layer = layerByKey.get(layerKey);
    if (!layer) {
      const name = spec?.layers.find((l) => l.id === type.layerId)?.name;
      layer = { layerId: type.layerId, layerName: name ?? type.layerId, types: [] };
      layerByKey.set(layerKey, layer);
      group.layers.push(layer);
    }
    layer.types.push(type);
  }
  return groups;
}

/** O selo de aviso do tipo do componente (resolvido na especialização do projeto). */
function ComponentNotice({
  project,
  type,
}: {
  readonly project: Project;
  readonly type: ComponentType;
}) {
  const resolved = findSpecType(project, { specId: type.specId, typeId: type.typeId });
  return resolved ? <TypeNoticeBadge type={resolved.type} /> : null;
}

interface LibraryPaletteProps {
  /** Abre o diálogo de Especializações (atalho do estado vazio). */
  readonly onOpenSpecs: () => void;
}

export function LibraryPalette({ onOpenSpecs }: LibraryPaletteProps) {
  const { derived, review, store, canvas } = useEditor();
  const draggable = !store.locked.value && review.proposalId.value === null;
  const { add, labelFor, disabledReason, error } = useAddComponent();
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
                      <li
                        key={type.typeId}
                        class="library-type"
                        draggable={draggable}
                        title={draggable ? t('library.dragHint') : undefined}
                        onDragStart={(e) => {
                          if (!e.dataTransfer) return;
                          const dragged = { specId: type.specId, typeId: type.typeId };
                          e.dataTransfer.setData(
                            COMPONENT_DRAG_MIME,
                            JSON.stringify(dragged),
                          );
                          e.dataTransfer.effectAllowed = 'copy';
                          setDraggedComponent(dragged);
                        }}
                        onDragEnd={() => {
                          setDraggedComponent(null);
                          canvas.current?.setDropTarget(null);
                        }}
                      >
                        <span class="library-type-main">
                          <span class="library-type-name">{type.name}</span>
                          {type.container && <ContainerMark />}
                          <ComponentNotice project={project} type={type} />
                        </span>
                        <Button
                          size="sm"
                          aria-label={t('library.addType', {
                            label: labelFor(type),
                            name: type.name,
                          })}
                          disabled={disabledReason !== undefined}
                          title={disabledReason ?? labelFor(type)}
                          onClick={() => add(type.specId, type.typeId)}
                        >
                          <span class="library-type-add-label">{labelFor(type)}</span>
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
