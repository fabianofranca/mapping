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
} from '../store/ui';
import { CommitInput } from './CommitInput';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { Popover } from './Popover';
import { Button, IconButton, Select } from './controls';

// Conteúdo das camadas: a lista (visibilidade, camada ativa, nome, cor, ordem e
// exclusão) e o modo de exibição das marcações sem anotação. É o miolo da janela
// Camadas (desktop, `LayersWindow`) e do diálogo do celular (`LayersDialog`, até a R8).

interface LayersProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/** Nova camada e Mostrar todas: ícones no cabeçalho da janela, botões no diálogo. */
export function LayerActions({
  project,
  readOnly,
  variant,
}: LayersProps & { readonly variant: 'icons' | 'buttons' }) {
  const { ui, actions } = useEditor();
  const onAdd = () => {
    actions.addLayer(
      t('layer.newName', { n: project.layers.length + 1 }),
      nextLayerColor(project),
    );
  };
  if (variant === 'buttons') {
    return (
      <div class="row">
        <Button disabled={readOnly} onClick={onAdd}>
          + {t('layer.add')}
        </Button>
        <Button onClick={() => showAllLayers(ui)}>{t('layer.showAll')}</Button>
      </div>
    );
  }
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
        onClick={() => showAllLayers(ui)}
      />
    </>
  );
}

/** Nome da especialização dona da camada (ou o id, se a cópia não estiver disponível). */
function specName(project: Project, layer: Layer): string {
  const id = layer.spec?.specId ?? '';
  return project.specializations.find((s) => s.id === id)?.spec?.name ?? id;
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
  readonly active: boolean;
  readonly hidden: boolean;
  readonly onDelete: (layer: Layer) => void;
}

function LayerRow({
  project,
  readOnly,
  layer,
  index,
  active,
  hidden,
  onDelete,
}: LayerRowProps) {
  const { ui, actions } = useEditor();
  const last = project.layers.length - 1;
  const lockedBySpec = layer.spec !== null;
  const onlyLayer = project.layers.length === 1;
  const deleteTip = lockedBySpec
    ? t('layer.specLocked')
    : onlyLayer
      ? t('layer.lastLayer')
      : undefined;
  return (
    <li
      class={active ? 'layer-row layer-row-active' : 'layer-row'}
      style={{ '--layer-color': layer.color }}
      aria-current={active || undefined}
    >
      <label class="layer-visible" title={t('layer.visible', { name: layer.name })}>
        <input
          type="checkbox"
          checked={active || !hidden}
          disabled={active}
          aria-label={t('layer.visible', { name: layer.name })}
          onChange={() => toggleLayerVisible(ui, project, layer.id)}
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

      <IconButton
        icon="check"
        label={t(active ? 'layer.isActive' : 'layer.makeActive')}
        pressed={active}
        onClick={() => setActiveLayer(ui, layer.id)}
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
              disabled={readOnly || index === 0}
              onClick={() => {
                actions.moveLayer(layer.id, index - 1);
                close();
              }}
            >
              {t('layer.moveUp')}
            </Button>
            <Button
              disabled={readOnly || index === last}
              onClick={() => {
                actions.moveLayer(layer.id, index + 1);
                close();
              }}
            >
              {t('layer.moveDown')}
            </Button>
            <Button
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

      {layer.spec && (
        <span
          class="layer-badge"
          title={t('layer.specBadge', { name: specName(project, layer) })}
        >
          {specName(project, layer)}
        </span>
      )}
    </li>
  );
}

/** Lista de camadas, modo de exibição e a confirmação de exclusão. */
export function LayersPanel({ project, readOnly }: LayersProps) {
  const { ui } = useEditor();
  const [deleting, setDeleting] = useState<Layer | null>(null);
  const activeId = resolveActiveLayerId(project, ui.activeLayer.value);
  const hidden = ui.hiddenLayers.value;

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
            active={layer.id === activeId}
            hidden={hidden.has(layer.id)}
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
