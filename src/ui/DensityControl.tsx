import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Select, TextField } from './controls';
import {
  CUSTOM_DENSITY,
  DENSITY_CHOICES,
  formatDensity,
  isDensityChoice,
  parseDensity,
} from './density';

interface DensityControlProps {
  /** `id` of the `Select` (the label of whoever uses it points to it). */
  readonly id?: string;
  /** The current density (1 when the container does not declare one). */
  readonly value: number;
  readonly disabled?: boolean;
  readonly size?: 'md' | 'sm';
  /** Marks the "Custom" field as invalid. */
  readonly invalid?: boolean;
  /**
   * `confirm`: the typed number only counts on confirm (Enter or leaving the field), so as not to
   * generate an undo entry per key (Details). `live`: counts on every key (the dialog, which only
   * saves on create).
   */
  readonly mode: 'confirm' | 'live';
  /** A valid density was chosen (from the list or typed). */
  readonly onChange: (density: number) => void;
  /** The number typed in "Custom" is not from 0.5 to 8. */
  readonly onInvalid: () => void;
  /** The person went back to typing in the "Custom" field (the previous warning no longer holds). */
  readonly onEdit?: () => void;
}

/**
 * Container density: 1x, 1.5x, 2x, 3x, 4x or "Custom", which opens a number field from
 * 0.5 to 8 (accepts 2.625). A value outside the list opens straight on "Custom".
 */
export function DensityControl({
  id,
  value,
  disabled,
  size,
  invalid,
  mode,
  onChange,
  onInvalid,
  onEdit,
}: DensityControlProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(formatDensity(value));
  const custom = customOpen || !isDensityChoice(value);
  const box = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  // When opened from the list, focus goes to the field with the number selected (typing replaces it).
  useEffect(() => {
    if (!customOpen || !opened.current) return;
    const field = box.current?.querySelector('input');
    field?.focus();
    field?.select();
  }, [customOpen]);
  const choose = (text: string) => {
    if (text === CUSTOM_DENSITY) {
      opened.current = true;
      setDraft(formatDensity(value));
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(Number(text));
  };
  return (
    <div class="density-control" ref={box} onInput={onEdit}>
      <Select
        id={id}
        size={size}
        value={custom ? CUSTOM_DENSITY : String(value)}
        disabled={disabled}
        onChange={(e) => choose(e.currentTarget.value)}
      >
        {DENSITY_CHOICES.map((choice) => (
          <option key={choice} value={String(choice)}>
            {t('density.value', { value: formatDensity(choice) })}
          </option>
        ))}
        <option value={CUSTOM_DENSITY}>{t('density.custom')}</option>
      </Select>
      {custom &&
        (mode === 'confirm' ? (
          <TextField
            size={size}
            aria-label={t('density.customLabel')}
            inputMode="decimal"
            value={formatDensity(value)}
            disabled={disabled}
            invalid={invalid}
            onCommit={(text) => {
              const parsed = parseDensity(text);
              if (parsed === null) {
                onInvalid();
                return false;
              }
              if (parsed === value) return false;
              onChange(parsed);
              return true;
            }}
          />
        ) : (
          <TextField
            size={size}
            aria-label={t('density.customLabel')}
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            invalid={invalid}
            onInput={(e) => {
              const text = e.currentTarget.value;
              setDraft(text);
              const parsed = parseDensity(text);
              if (parsed === null) onInvalid();
              else onChange(parsed);
            }}
          />
        ))}
    </div>
  );
}
