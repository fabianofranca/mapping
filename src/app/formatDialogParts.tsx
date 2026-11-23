import { t } from '../i18n';
import { imageLabel } from '../ui/labels';
import { Select } from '../ui/controls';
import type { FormatChoice } from '../store/formatActions';
import type { Project, ProjectContainer } from '../model';
import { resolveSelection, type Selection } from '../store/ui';

// The pieces the Export and Import dialogs share (stage #2035, decisions 11 and 12): the container the
// selection is in, the format picker and the container picker.

/** The container the selection is in (the selected container, or the one of the selected marking). */
export function selectedContainer(
  project: Project | null,
  selection: Selection,
): string | null {
  const selected = resolveSelection(project, selection);
  if (selected?.kind === 'image') return selected.image.id;
  if (selected?.kind === 'marking') return selected.image?.id ?? null;
  return null;
}

/** The container `id` if the project has it. */
export function hasContainer(
  containers: readonly ProjectContainer[],
  id: string | null,
): id is string {
  return id !== null && containers.some((c) => c.id === id);
}

export function FormatSelect({
  choices,
  value,
  disabled,
  label,
  onChange,
}: {
  readonly choices: readonly FormatChoice[];
  readonly value: number;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (index: number) => void;
}) {
  if (choices.length === 0) return null;
  return (
    <Select
      label={label}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    >
      {choices.map((c, i) => (
        <option key={c.ref} value={String(i)}>
          {t('format.export.option', {
            spec: c.specName,
            format: c.name,
            extension: c.extension,
          })}
        </option>
      ))}
    </Select>
  );
}

export function ContainerSelect({
  show,
  containers,
  value,
  disabled,
  label,
  noneLabel,
  onChange,
}: {
  readonly show: boolean;
  readonly containers: readonly ProjectContainer[];
  readonly value: string | null;
  readonly disabled: boolean;
  readonly label: string;
  /** An extra first option that means "no container" (`''`): the import's "None (the plugin creates it)". */
  readonly noneLabel?: string;
  readonly onChange: (id: string) => void;
}) {
  if (!show) return null;
  return (
    <Select
      label={label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {containers.map((c) => (
        <option key={c.id} value={c.id}>
          {imageLabel(c)}
        </option>
      ))}
    </Select>
  );
}
