import { useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  LAYER_PALETTE,
  MARKING_DISPLAY_MODES,
  layerDeletionImpact,
  nextLayerColor,
  projectIndex,
  type Layer,
  type Project,
} from '../model';
import {
  isMarkingDisplayMode,
  markingDisplay,
  setMarkingDisplay,
} from '../store/settings';
import { CiteItem, CopyReferenceItem } from './CiteMenuItems';
import { CommitInput } from './CommitInput';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { Popover } from './Popover';
import { openToolWindow } from './toolWindowLayout';
import { startComposing } from '../store/threadUi';
import { Button, IconButton, Select, Tooltip } from './controls';

// Conteúdo das camadas: a lista (visibilidade, camada ativa, nome, cor, ordem e
// exclusão) e o modo de exibição das marcações sem anotação. É o miolo da janela
// Camadas (o conteúdo da janela `LayersWindow`).

interface LayersProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/**
 * Visibilidade das camadas: com uma perspectiva aberta (etapa #659, decisão 11), as escondidas
 * são as dela e mudam no projeto (com desfazer); na Principal, as da interface (`ui.hiddenLayers`).
 */
function useLayerVisibility(readOnly: boolean) {
  const { layers, session } = useEditor();
  return {
    hidden: layers.hidden(),
    toggle: layers.toggle,
    showAll: layers.showAll,
    // Com perspectiva aberta a escrita vai ao projeto e é recusada somente leitura (ou na
    // revisão); na Principal é só da interface e segue valendo.
    disabled: readOnly && session.perspective.id.value !== null,
  };
}

/** Nova camada e Mostrar todas: ícones no cabeçalho da janela. */
export function LayerActions({ project, readOnly }: LayersProps) {
  const { actions } = useEditor();
  const visibility = useLayerVisibility(readOnly);
  const onAdd = () => {
    actions.addLayer(
      t('layer.newName', { n: project.layers.length + 1 }),
      nextLayerColor(project),
    );
  };
  return (
    <>
      <IconButton
        icon="plus"
        label={t('layer.add')}
        disabled={readOnly}
        onClick={onAdd}
      />
      <IconButton
        icon="eye"
        label={t('layer.showAll')}
        disabled={visibility.disabled}
        onClick={visibility.showAll}
      />
    </>
  );
}

/** Nome da especialização dona da camada (ou o id, se a cópia não estiver disponível). */
function specName(project: Project, layer: Layer): string {
  const id = layer.spec?.specId ?? '';
  return projectIndex(project).specializations.get(id)?.spec?.name ?? id;
}

/** Paleta padrão mais uma cor livre, dentro do popover do botão de cor. */
function Palette({
  layer,
  close,
}: {
  readonly layer: Layer;
  readonly close: () => void;
}) {
  const { actions } = useEditor();
  return (
    <div class="palette" role="group" aria-label={t('layer.color', { name: layer.name })}>
      {LAYER_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          class="palette-color"
          style={{ background: color }}
          aria-label={color}
          aria-pressed={layer.color.toUpperCase() === color}
          onClick={() => {
            actions.setLayerColor(layer.id, color);
            close();
          }}
        />
      ))}
      <label class="palette-custom">
        <span>{t('layer.customColor')}</span>
        <input
          type="color"
          value={layer.color.toLowerCase()}
          onChange={(e) => actions.setLayerColor(layer.id, e.currentTarget.value)}
        />
      </label>
    </div>
  );
}

interface LayerRowProps extends LayersProps {
  readonly layer: Layer;
  readonly index: number;
  readonly hidden: boolean;
  readonly visibilityDisabled: boolean;
  readonly onToggle: (layerId: string) => void;
  readonly onDelete: (layer: Layer) => void;
}

function LayerRow({
  project,
  readOnly,
  layer,
  index,
  hidden,
  visibilityDisabled,
  onToggle,
  onDelete,
}: LayerRowProps) {
  const { ui, actions, store } = useEditor();
  const canComment = !readOnly && !store.reviewing.value;
  const last = project.layers.length - 1;
  const lockedBySpec = layer.spec !== null;
  const onlyLayer = project.layers.length === 1;
  const deleteTip = lockedBySpec
    ? t('layer.specLocked')
    : onlyLayer
      ? t('layer.lastLayer')
      : undefined;
  return (
    <li class="layer-row" style={{ '--layer-color': layer.color }}>
      <label class="layer-visible" title={t('layer.visible', { name: layer.name })}>
        <input
          type="checkbox"
          checked={!hidden}
          disabled={visibilityDisabled}
          aria-label={t('layer.visible', { name: layer.name })}
          onChange={() => onToggle(layer.id)}
        />
      </label>

      <Popover
        class="layer-color"
        label={t('layer.color', { name: layer.name })}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            class="layer-swatch"
            aria-label={t('layer.color', { name: layer.name })}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={readOnly}
            onClick={toggle}
          >
            <span class="layer-dot" aria-hidden="true" />
          </button>
        )}
      >
        {(close) => <Palette layer={layer} close={close} />}
      </Popover>

      <CommitInput
        class="input input-sm layer-name"
        aria-label={t('layer.name')}
        value={layer.name}
        disabled={readOnly || lockedBySpec}
        title={lockedBySpec ? t('layer.specLocked') : undefined}
        onCommit={(text) => actions.renameLayer(layer.id, text).ok}
      />

      <Popover
        class="layer-more"
        role="menu"
        align="end"
        label={t('layer.more', { name: layer.name })}
        trigger={({ open, toggle }) => (
          <IconButton
            icon="moreVertical"
            label={t('layer.more', { name: layer.name })}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
          />
        )}
      >
        {(close) => (
          <div class="menu-items">
            <Button
              role="menuitem"
              disabled={readOnly || index === 0}
              onClick={() => {
                actions.moveLayer(layer.id, index - 1);
                close();
              }}
            >
              {t('layer.moveUp')}
            </Button>
            <Button
              role="menuitem"
              disabled={readOnly || index === last}
              onClick={() => {
                actions.moveLayer(layer.id, index + 1);
                close();
              }}
            >
              {t('layer.moveDown')}
            </Button>
            <Button
              role="menuitem"
              disabled={!canComment}
              onClick={() => {
                close();
                startComposing(ui, project, { kind: 'layer', id: layer.id });
                openToolWindow('details');
              }}
            >
              {t('comments.layer')}
            </Button>
            <CiteItem target={{ kind: 'layer', id: layer.id }} close={close} />
            <CopyReferenceItem target={{ kind: 'layer', id: layer.id }} close={close} />
            <Button
              role="menuitem"
              variant="danger"
              title={deleteTip}
              disabled={readOnly || lockedBySpec || onlyLayer}
              onClick={() => {
                close();
                onDelete(layer);
              }}
            >
              {t('layer.delete')}
            </Button>
          </div>
        )}
      </Popover>

      {layer.spec && <SpecBadge name={specName(project, layer)} />}
    </li>
  );
}

function SpecBadge({ name }: { readonly name: string }) {
  return (
    <Tooltip label={t('layer.specBadge', { name })}>
      <span class="layer-badge">{name}</span>
    </Tooltip>
  );
}

/** Lista de camadas, modo de exibição e a confirmação de exclusão. */
export function LayersPanel({ project, readOnly }: LayersProps) {
  const [deleting, setDeleting] = useState<Layer | null>(null);
  const { hidden, toggle, disabled: visibilityDisabled } = useLayerVisibility(readOnly);

  return (
    <div class="layers-panel">
      <ul class="layer-list" aria-label={t('layer.title')}>
        {project.layers.map((layer, index) => (
          <LayerRow
            key={layer.id}
            project={project}
            readOnly={readOnly}
            layer={layer}
            index={index}
            hidden={hidden.has(layer.id)}
            visibilityDisabled={visibilityDisabled}
            onToggle={toggle}
            onDelete={setDeleting}
          />
        ))}
      </ul>

      <div class="layers-footer" title={t('layer.displayHint')}>
        <Select
          label={t('layer.displayMode')}
          size="sm"
          value={markingDisplay.value}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (isMarkingDisplayMode(v)) setMarkingDisplay(v);
          }}
        >
          {MARKING_DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`layer.display.${mode}` satisfies TranslationKey)}
            </option>
          ))}
        </Select>
      </div>

      {deleting && (
        <DeleteLayerDialog
          project={project}
          layer={deleting}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function DeleteLayerDialog({
  project,
  layer,
  onCancel,
}: {
  readonly project: Project;
  readonly layer: Layer;
  readonly onCancel: () => void;
}) {
  const { actions } = useEditor();
  return (
    <Dialog
      title={t('layer.deleteTitle')}
      alert
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              onCancel();
              actions.removeLayer(layer.id);
            }}
          >
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <DeleteImpact project={project} layer={layer} />
    </Dialog>
  );
}

/** Contagens da exclusão: total e, por camada, incluindo as vinculadas em outras camadas. */
function DeleteImpact({
  project,
  layer,
}: {
  readonly project: Project;
  readonly layer: Layer;
}) {
  const impact = layerDeletionImpact(project, layer.id);
  const others = project.layers
    .filter((l) => l.id !== layer.id && (impact.byLayer.get(l.id) ?? 0) > 0)
    .map((l) => ({ layer: l, count: impact.byLayer.get(l.id) ?? 0 }));
  return (
    <>
      <p>
        {t('layer.deleteMessage', {
          name: layer.name,
          annotations: impact.annotations,
        })}
      </p>
      {others.length > 0 && (
        <>
          <p>{t('layer.deleteCounts')}</p>
          <ul>
            {others.map(({ layer: other, count }) => (
              <li key={other.id}>
                {t('layer.deleteCount', { name: other.name, count })}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
