import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import { MAX_CONTAINER_SIZE } from '../model';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import {
  CUSTOM_PRESET,
  DEFAULT_CONTAINER_BACKGROUND,
  SELECTION_PRESET,
  presetGroups,
  readContainerForm,
  selectionSize,
} from './containerForm';
import { Button, Select, TextField } from './controls';
import { DensityControl } from './DensityControl';
import { containerErrorMessage } from './labels';

/**
 * Novo container: nome, tamanho (Personalizado, Tamanho da seleção e os presets das
 * especializações aplicadas) e cor de fundo. O container nasce no centro da vista, fica
 * selecionado e enquadrado.
 */
export function ContainerDialog({ onClose }: { readonly onClose: () => void }) {
  const { actions, canvas, ui, store } = useEditor();
  const project = store.project.value;
  const groups = project ? presetGroups(project.specializations) : [];
  const fromSelection = selectionSize(project, ui.selection.value);
  const first = groups[0]?.presets[0];
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(first?.id ?? CUSTOM_PRESET);
  const [width, setWidth] = useState(String(first?.width ?? 360));
  const [height, setHeight] = useState(String(first?.height ?? 800));
  const [background, setBackground] = useState(
    first?.background ?? DEFAULT_CONTAINER_BACKGROUND,
  );
  // `null`: o número digitado em "Personalizada" não vale.
  const [density, setDensity] = useState<number | null>(1);
  const densityId = useId();
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<'name' | 'size' | 'color' | 'density' | null>(
    null,
  );

  const submit = (e: Event) => {
    e.preventDefault();
    const form = readContainerForm({ name, width, height, background });
    if (!form.ok) {
      setInvalid(form.error);
      setError(
        t(
          form.error === 'name'
            ? 'container.error.name'
            : form.error === 'size'
              ? 'container.error.size'
              : 'container.error.color',
          { max: MAX_CONTAINER_SIZE },
        ),
      );
      return;
    }
    if (density === null) {
      setInvalid('density');
      setError(t('density.error'));
      return;
    }
    const center = canvas.current?.viewportCenter();
    const result = actions.addBackgroundContainer({
      ...form.value,
      ...(density !== 1 ? { density } : {}),
      ...(center ? { center } : {}),
    });
    if (!result.ok) {
      setInvalid(null);
      setError(containerErrorMessage(result.error));
      return;
    }
    onClose();
    ui.selection.value = { kind: 'image', id: result.value };
    canvas.current?.centerSelection();
  };

  return (
    <Dialog
      title={t('container.new')}
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="container-form" variant="primary">
            {t('container.create')}
          </Button>
        </>
      }
    >
      <form id="container-form" class="container-form" noValidate onSubmit={submit}>
        <p class="muted">{t('container.intro')}</p>
        <TextField
          label={t('container.name')}
          value={name}
          invalid={invalid === 'name'}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label={t('container.preset')}
          value={preset}
          onChange={(e) => {
            const id = e.currentTarget.value;
            setPreset(id);
            if (id === SELECTION_PRESET) {
              if (!fromSelection) return;
              setWidth(String(fromSelection.width));
              setHeight(String(fromSelection.height));
              return;
            }
            const chosen = groups.flatMap((g) => g.presets).find((p) => p.id === id);
            if (!chosen) return;
            setWidth(String(chosen.width));
            setHeight(String(chosen.height));
            setBackground(chosen.background);
          }}
        >
          <option value={CUSTOM_PRESET}>{t('container.preset.custom')}</option>
          <option value={SELECTION_PRESET} disabled={fromSelection === null}>
            {t('container.preset.selection')}
          </option>
          {groups.map((g) => (
            <optgroup key={g.specId} label={g.specName}>
              {g.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.name} · ${t('library.typeSize', { width: p.width, height: p.height })}`}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <div class="container-size">
          <TextField
            label={t('container.width')}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={width}
            invalid={invalid === 'size'}
            onInput={(e) => {
              setPreset(CUSTOM_PRESET);
              setWidth(e.currentTarget.value);
            }}
          />
          <TextField
            label={t('container.height')}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={height}
            invalid={invalid === 'size'}
            onInput={(e) => {
              setPreset(CUSTOM_PRESET);
              setHeight(e.currentTarget.value);
            }}
          />
        </div>
        <TextField
          label={t('container.background')}
          value={background}
          placeholder={DEFAULT_CONTAINER_BACKGROUND}
          invalid={invalid === 'color'}
          onInput={(e) => setBackground(e.currentTarget.value)}
        />
        <span class="muted">{t('container.backgroundHint')}</span>
        <div class="field">
          <label for={densityId}>{t('density.label')}</label>
          <DensityControl
            id={densityId}
            mode="live"
            value={density ?? 1}
            invalid={invalid === 'density'}
            onChange={(value) => {
              setDensity(value);
              if (invalid === 'density') {
                setInvalid(null);
                setError(null);
              }
            }}
            onInvalid={() => setDensity(null)}
          />
          <span class="muted">{t('density.hint')}</span>
        </div>
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
