import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { MAX_BLANK_SIZE } from '../model';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import {
  BLANK_PRESETS,
  CUSTOM_PRESET,
  DEFAULT_BLANK_BACKGROUND,
  presetFor,
  readBlankForm,
} from './blankScreen';
import { Button, Select, TextField } from './controls';
import { blankErrorMessage } from './labels';

/**
 * Nova tela em branco: nome, tamanho (com predefinições) e cor de fundo. A tela nasce no
 * centro da vista, fica selecionada e enquadrada.
 */
export function BlankScreenDialog({ onClose }: { readonly onClose: () => void }) {
  const { actions, canvas, ui } = useEditor();
  const [name, setName] = useState('');
  const [width, setWidth] = useState(String(BLANK_PRESETS[0]?.width ?? 360));
  const [height, setHeight] = useState(String(BLANK_PRESETS[0]?.height ?? 800));
  const [background, setBackground] = useState(DEFAULT_BLANK_BACKGROUND);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<'name' | 'size' | 'color' | null>(null);

  const submit = (e: Event) => {
    e.preventDefault();
    const form = readBlankForm({ name, width, height, background });
    if (!form.ok) {
      setInvalid(form.error);
      setError(
        t(
          form.error === 'name'
            ? 'blank.error.name'
            : form.error === 'size'
              ? 'blank.error.size'
              : 'blank.error.color',
          { max: MAX_BLANK_SIZE },
        ),
      );
      return;
    }
    const center = canvas.current?.viewportCenter();
    const result = actions.addBlankImage({
      ...form.value,
      ...(center ? { center } : {}),
    });
    if (!result.ok) {
      setInvalid(null);
      setError(blankErrorMessage(result.error));
      return;
    }
    onClose();
    ui.selection.value = { kind: 'image', id: result.value };
    canvas.current?.centerSelection();
  };

  return (
    <Dialog
      title={t('blank.new')}
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="blank-screen-form" variant="primary">
            {t('blank.create')}
          </Button>
        </>
      }
    >
      <form id="blank-screen-form" class="blank-form" noValidate onSubmit={submit}>
        <p class="muted">{t('blank.intro')}</p>
        <TextField
          label={t('blank.name')}
          value={name}
          invalid={invalid === 'name'}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Select
          label={t('blank.preset')}
          value={presetFor(width, height)}
          onChange={(e) => {
            const preset = BLANK_PRESETS.find((p) => p.id === e.currentTarget.value);
            if (!preset) return;
            setWidth(String(preset.width));
            setHeight(String(preset.height));
          }}
        >
          {BLANK_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {`${t(p.label)} · ${t('library.typeSize', { width: p.width, height: p.height })}`}
            </option>
          ))}
          <option value={CUSTOM_PRESET}>{t('blank.preset.custom')}</option>
        </Select>
        <div class="blank-size">
          <TextField
            label={t('blank.width')}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={width}
            invalid={invalid === 'size'}
            onInput={(e) => setWidth(e.currentTarget.value)}
          />
          <TextField
            label={t('blank.height')}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={height}
            invalid={invalid === 'size'}
            onInput={(e) => setHeight(e.currentTarget.value)}
          />
        </div>
        <TextField
          label={t('blank.background')}
          value={background}
          placeholder={DEFAULT_BLANK_BACKGROUND}
          invalid={invalid === 'color'}
          onInput={(e) => setBackground(e.currentTarget.value)}
        />
        <span class="muted">{t('blank.backgroundHint')}</span>
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
