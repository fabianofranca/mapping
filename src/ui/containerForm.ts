import { MAX_CONTAINER_SIZE } from '../model';
import type { Project, Spec } from '../model';
import { resolveSelection, type Selection } from '../store/ui';

// Regras do diálogo "Novo container" (e dos campos de Detalhes do container): predefinições
// de tamanho (as das especializações, Personalizado e Tamanho da seleção) e a leitura do que a pessoa digitou. O modelo valida de novo (`addBackgroundContainer`).

export interface ContainerPreset {
  /** Único no diálogo: `<specId>:<id do preset>`. */
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
}

/** Presets de uma especialização aplicada, mostrados sob o nome dela. */
export interface ContainerPresetGroup {
  readonly specId: string;
  readonly specName: string;
  readonly presets: readonly ContainerPreset[];
}

/** Id do "Personalizado" no seletor de predefinições. */
export const CUSTOM_PRESET = 'custom';
/** Id do "Tamanho da seleção": o retângulo da marcação selecionada. */
export const SELECTION_PRESET = 'selection';

/** Cor de fundo inicial de um container. */
export const DEFAULT_CONTAINER_BACKGROUND = '#FFFFFF';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Presets das especializações aplicadas (as sem `containers` ou sem cópia legível ficam de fora). */
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

/** Tamanho do retângulo da marcação selecionada, ou `null` sem marcação selecionada. */
export function selectionSize(
  project: Project | null,
  selection: Selection,
): { readonly width: number; readonly height: number } | null {
  const resolved = resolveSelection(project, selection);
  if (resolved?.kind !== 'marking') return null;
  return { width: resolved.marking.rect.width, height: resolved.marking.rect.height };
}

/** Lado do container: inteiro de 1 a `MAX_CONTAINER_SIZE`, ou `null`. */
export function parseContainerSide(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_CONTAINER_SIZE ? value : null;
}

/** Cor `#RRGGBB` (maiúsculas), ou `null`. */
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

/** Lê o formulário: nome obrigatório, lados inteiros de 1 a `MAX_CONTAINER_SIZE`, cor `#RRGGBB`. */
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
