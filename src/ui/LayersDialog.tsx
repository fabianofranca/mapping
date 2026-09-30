import { useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  LAYER_PALETTE,
  MARKING_DISPLAY_MODES,
  layerDeletionImpact,
  nextLayerColor,
  type Layer,
  type Project,
} from '../model';
import type { ProjectActions } from '../store/project';
import {
  isMarkingDisplayMode,
  markingDisplay,
  setMarkingDisplay,
} from '../store/settings';
import {
  resolveActiveLayerId,
  setActiveLayer,
  showAllLayers,
  toggleLayerVisible,
  type EditorUi,
} from '../store/ui';
import { CommitInput } from './CommitInput';
import { Dialog } from './Dialog';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './icons';

interface LayersDialogProps {
  readonly project: Project;
  readonly ui: EditorUi;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}

/** Folha de camadas: visibilidade, camada ativa, nome, cor, ordem e exclusão. */
export function LayersDialog({
  project,
  ui,
  actions,
  readOnly,
  onClose,
}: LayersDialogProps) {
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Layer | null>(null);

  const activeId = resolveActiveLayerId(project, ui.activeLayer.value);
  const hidden = ui.hiddenLayers.value;
  const last = project.layers.length - 1;

  const onAdd = () => {
    actions.addLayer(
      t('layer.newName', { n: project.layers.length + 1 }),
      nextLayerColor(project),
    );
  };

  const onDeleteConfirmed = (layer: Layer) => {
    setDeleting(null);
    if (colorFor === layer.id) setColorFor(null);
    actions.removeLayer(layer.id);
  };

  return (
    <>
      <Dialog
        title={t('layer.title')}
        onCancel={onClose}
        actions={
          <button type="button" class="button" onClick={onClose}>
            {t('common.close')}
          </button>
        }
      >
        <p class="muted">{t('layer.hint')}</p>
        <div class="row">
          <button type="button" class="button" disabled={readOnly} onClick={onAdd}>
            + {t('layer.add')}
          </button>
          <button type="button" class="button" onClick={() => showAllLayers(ui)}>
            {t('layer.showAll')}
          </button>
        </div>

        <fieldset class="display-mode">
          <legend>{t('layer.displayMode')}</legend>
          {MARKING_DISPLAY_MODES.map((mode) => (
            <label key={mode} class="field field-check">
              <input
                type="radio"
                name="marking-display"
                value={mode}
                checked={markingDisplay.value === mode}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (isMarkingDisplayMode(v)) setMarkingDisplay(v);
                }}
              />
              <span>{t(`layer.display.${mode}` satisfies TranslationKey)}</span>
            </label>
          ))}
          <small class="muted">{t('layer.displayHint')}</small>
        </fieldset>

        <ul class="layer-list">
          {project.layers.map((layer, index) => {
            const active = layer.id === activeId;
            return (
              <li key={layer.id} class="layer-item">
                <div class="layer-main">
                  <label
                    class="layer-visible"
                    title={t('layer.visible', { name: layer.name })}
                  >
                    <input
                      type="checkbox"
                      checked={active || !hidden.has(layer.id)}
                      disabled={active}
                      aria-label={t('layer.visible', { name: layer.name })}
                      onChange={() => toggleLayerVisible(ui, project, layer.id)}
                    />
                  </label>
                  <button
                    type="button"
                    class="layer-swatch"
                    style={{ background: layer.color }}
                    aria-label={t('layer.color', { name: layer.name })}
                    aria-expanded={colorFor === layer.id}
                    disabled={readOnly}
                    onClick={() => setColorFor(colorFor === layer.id ? null : layer.id)}
                  />
                  <CommitInput
                    class="input layer-name"
                    aria-label={t('layer.name')}
                    value={layer.name}
                    disabled={readOnly}
                    onCommit={(text) => actions.renameLayer(layer.id, text).ok}
                  />
                </div>

                {colorFor === layer.id && (
                  <div
                    class="palette"
                    role="group"
                    aria-label={t('layer.color', { name: layer.name })}
                  >
                    {LAYER_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        class="palette-color"
                        style={{ background: color }}
                        aria-label={color}
                        aria-pressed={layer.color.toUpperCase() === color}
                        onClick={() => actions.setLayerColor(layer.id, color)}
                      />
                    ))}
                    <label class="palette-custom">
                      <span>{t('layer.customColor')}</span>
                      <input
                        type="color"
                        value={layer.color.toLowerCase()}
                        onChange={(e) =>
                          actions.setLayerColor(layer.id, e.currentTarget.value)
                        }
                      />
                    </label>
                  </div>
                )}

                <div class="layer-actions">
                  <button
                    type="button"
                    class={active ? 'button button-primary' : 'button'}
                    aria-pressed={active}
                    onClick={() => setActiveLayer(ui, layer.id)}
                  >
                    {t(active ? 'layer.isActive' : 'layer.makeActive')}
                  </button>
                  <span class="layer-order">
                    <button
                      type="button"
                      class="button"
                      aria-label={t('layer.moveUp')}
                      title={t('layer.moveUp')}
                      disabled={readOnly || index === 0}
                      onClick={() => actions.moveLayer(layer.id, index - 1)}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      class="button"
                      aria-label={t('layer.moveDown')}
                      title={t('layer.moveDown')}
                      disabled={readOnly || index === last}
                      onClick={() => actions.moveLayer(layer.id, index + 1)}
                    >
                      <ArrowDownIcon />
                    </button>
                    <button
                      type="button"
                      class="button button-danger"
                      aria-label={t('layer.delete')}
                      title={
                        project.layers.length === 1
                          ? t('layer.lastLayer')
                          : t('layer.delete')
                      }
                      disabled={readOnly || project.layers.length === 1}
                      onClick={() => setDeleting(layer)}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Dialog>

      {deleting && (
        <Dialog
          title={t('layer.deleteTitle')}
          onCancel={() => setDeleting(null)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => onDeleteConfirmed(deleting)}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <DeleteImpact project={project} layer={deleting} />
        </Dialog>
      )}
    </>
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
