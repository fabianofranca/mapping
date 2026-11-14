import { MAX_CONTAINER_SIZE } from '../model';
import type { Project, Spec } from '../model';
import { resolveSelection, type Selection } from '../store/ui';

// Rules of the "New container" dialog (and of the container Details fields): size presets
// (those of the specializations, Custom and Selection size) and reading what the person typed. The model validates again (`addBackgroundContainer`).

export interface ContainerPreset {
  /** Unique in the dialog: `<specId>:<preset id>`. */
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
}

/** Presets of an applied specialization, shown under its name. */
export interface ContainerPresetGroup {
  readonly specId: string;
  readonly specName: string;
  readonly presets: readonly ContainerPreset[];
}

/** Id of "Custom" in the preset selector. */
export const CUSTOM_PRESET = 'custom';
/** Id of "Selection size": the rectangle of the selected marking. */
export const SELECTION_PRESET = 'selection';

/** Initial background color of a container. */
export const DEFAULT_CONTAINER_BACKGROUND = '#FFFFFF';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Presets of the applied specializations (those without `containers` or without a readable copy are left out). */
export function presetGroups(
  specs: readonly { readonly id: string; readonly spec: Spec | null }[],
): ContainerPresetGroup[] {
  const groups: ContainerPresetGroup[] = [];
  for (const { id, spec } of specs) {
    if (!spec?.containers?.length) continue;
    groups.push({
      specId: id,
      specName: spec.name,
      presets: spec.containers.map((c) => ({
        id: `${id}:${c.id}`,
        name: c.name,
        width: c.width,
        height: c.height,
        background: c.background ?? DEFAULT_CONTAINER_BACKGROUND,
      })),
    });
  }
  return groups;
}

/** Size of the selected marking's rectangle, or `null` with no marking selected. */
export function selectionSize(
  project: Project | null,
  selection: Selection,
): { readonly width: number; readonly height: number } | null {
  const resolved = resolveSelection(project, selection);
  if (resolved?.kind !== 'marking') return null;
  return { width: resolved.marking.rect.width, height: resolved.marking.rect.height };
}

/** Container side: integer from 1 to `MAX_CONTAINER_SIZE`, or `null`. */
export function parseContainerSide(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_CONTAINER_SIZE ? value : null;
}

/** `#RRGGBB` color (uppercase), or `null`. */
export function parseContainerColor(text: string): string | null {
  const trimmed = text.trim();
  return COLOR.test(trimmed) ? trimmed.toUpperCase() : null;
}

export interface ContainerForm {
  readonly name: string;
  readonly width: string;
  readonly height: string;
  readonly background: string;
}

export type ContainerResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly name: string;
        readonly width: number;
        readonly height: number;
        readonly background: string;
      };
    }
  | { readonly ok: false; readonly error: 'name' | 'size' | 'color' };

/** Reads the form: required name, integer sides from 1 to `MAX_CONTAINER_SIZE`, `#RRGGBB` color. */
export function readContainerForm(form: ContainerForm): ContainerResult {
  const name = form.name.trim();
  if (name === '') return { ok: false, error: 'name' };
  const width = parseContainerSide(form.width);
  const height = parseContainerSide(form.height);
  if (width === null || height === null) return { ok: false, error: 'size' };
  const background = parseContainerColor(form.background);
  if (background === null) return { ok: false, error: 'color' };
  return { ok: true, value: { name, width, height, background } };
}
