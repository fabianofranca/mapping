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
  /** `id` do `Select` (o rótulo de quem usa aponta para ele). */
  readonly id?: string;
  /** A densidade atual (1 quando o container não a declara). */
  readonly value: number;
  readonly disabled?: boolean;
  readonly size?: 'md' | 'sm';
  /** Marca o campo "Personalizada" como inválido. */
  readonly invalid?: boolean;
  /**
   * `confirm`: o número digitado só vale ao confirmar (Enter ou sair do campo), para não gerar uma
   * entrada de desfazer por tecla (Detalhes). `live`: vale a cada tecla (o diálogo, que só grava
   * ao criar).
   */
  readonly mode: 'confirm' | 'live';
  /** Uma densidade válida foi escolhida (da lista ou digitada). */
  readonly onChange: (density: number) => void;
  /** O número digitado em "Personalizada" não é de 0,5 a 8. */
  readonly onInvalid: () => void;
  /** A pessoa voltou a digitar no campo "Personalizada" (o aviso anterior deixa de valer). */
  readonly onEdit?: () => void;
}

/**
 * Densidade do container: 1x, 1,5x, 2x, 3x, 4x ou "Personalizada", que abre um campo de número de
 * 0,5 a 8 (aceita 2,625). Um valor fora da lista abre direto em "Personalizada".
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
  // Ao abrir pela lista, o foco vai para o campo com o número selecionado (digitar substitui).
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
