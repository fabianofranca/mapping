// Material Design 3 written in the lab format: a whole public design system
// (ten components) passes validation and instantiates without warnings, at the default sizes and values.
import { describe, expect, it } from 'vitest';
import { findSlot, resolveSlotLayout } from '../../../src/model/components/arrange';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { initialValues, loadLibrary } from '../../../src/model/components/library';
import { parseComponent } from '../../../src/model/components/parseComponent';
import {
  ICONS,
  M3_COMPONENTS,
  M3_FILES,
  M3_SCREEN,
  M3_SPEC,
} from '../../../viewer/samples/samplesMaterial3';
import { walk } from '../../../src/model/components/scene';
import { parseSpec } from '../../../src/model';
import { SAMPLE_SPEC } from '../../../viewer/samples/samples';

// pt-BR kept: boolean enum value and slot name of the pt-BR Material 3 sample (viewer/samples/samplesMaterial3.ts)
const NO = 'não';
const ACTIONS_SLOT = 'ações';

describe('Material 3 in the component format', () => {
  it('the library loads the fifteen types, all with a valid component and no problems', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.specId).toBe('material3');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(15);
    for (const type of lib.types) expect(type.component?.id, type.id).toBe(type.id);
  });

  it('each component instantiates at the default size with the preview values, without warnings', () => {
    const lib = loadLibrary(M3_FILES);
    for (const component of M3_COMPONENTS) {
      expect(parseComponent(component).ok, component.id).toBe(true);
      const type = lib.types.find((t) => t.id === component.id);
      expect(type, component.id).toBeDefined();
      const values = initialValues(type!);
      const box = { x: 0, y: 0, ...component.size };
      const made = instantiate(component, values, box, { measure: approximateMeasurer });
      expect(made.warnings, component.id).toEqual([]);
      expect(made.root.width).toBe(component.size.width);
    }
  });

  it('the settings screen instantiates all 21 instances; only the card warns (long text)', () => {
    const lib = loadLibrary(M3_FILES);
    const warnings: string[] = [];
    for (const instance of M3_SCREEN.instances) {
      const type = lib.types.find((t) => t.id === instance.typeId);
      expect(type?.component, instance.typeId).toBeDefined();
      const made = instantiate(type!.component!, instance.values, instance.box, {
        measure: approximateMeasurer,
      });
      warnings.push(...made.warnings.map((w) => `${instance.id}: ${w}`));
    }
    expect(warnings).toEqual([]);
  });

  it('the button variants and the field state change color and visibility', () => {
    const button = M3_COMPONENTS.find((c) => c.id === 'm3-button')!;
    const box = { x: 0, y: 0, width: 120, height: 40 };
    const filled = instantiate(
      button,
      { label: 'OK', variant: 'filled', disabled: NO },
      box,
      { measure: approximateMeasurer },
    );
    const outlined = instantiate(
      button,
      { label: 'OK', variant: 'outlined', disabled: NO },
      box,
      { measure: approximateMeasurer },
    );
    const withIcon = instantiate(
      button,
      { label: 'OK', variant: 'filled', icon: 'check', disabled: NO },
      box,
      { measure: approximateMeasurer },
    );
    expect(filled.root.fills).toEqual([{ type: 'solid', color: '#6750A4' }]);
    // Transparent on purpose: the outlined variant keeps the clickable area without color.
    expect(outlined.root.fills).toEqual([{ type: 'solid', color: 'rgba(0, 0, 0, 0)' }]);
    expect(outlined.root.stroke?.paints).toEqual([{ type: 'solid', color: '#79747E' }]);
    const paths = (root: typeof filled.root) =>
      [...walk(root)].filter((n) => n.type === 'path');
    expect(paths(filled.root)).toHaveLength(0);
    expect(paths(withIcon.root)).toHaveLength(1);
    expect(paths(withIcon.root)[0]).toMatchObject({ d: ICONS.check });

    const field = M3_COMPONENTS.find((c) => c.id === 'm3-text-field')!;
    const error = instantiate(
      field,
      {
        label: 'E-mail',
        value: '',
        placeholder: '',
        supporting: 'Required',
        state: 'error',
        trailing: '',
      },
      { x: 0, y: 0, width: 280, height: 80 },
      { measure: approximateMeasurer },
    );
    const outline = [...walk(error.root)].find((n) => n.name === 'outline');
    expect(outline?.stroke?.paints).toEqual([{ type: 'solid', color: '#B3261E' }]);
  });

  it('each component declares the sizing without a rectangle (sizing)', () => {
    const sizing = Object.fromEntries(M3_COMPONENTS.map((c) => [c.id, c.sizing]));
    expect(sizing).toEqual({
      'm3-top-app-bar': { width: 'fill', height: 64 },
      'm3-button': { width: 'hug', height: 40 },
      'm3-fab': { width: 56, height: 56 },
      'm3-text-field': { width: 'fill', height: 56 },
      'm3-switch': { width: 'fill', height: 32 },
      'm3-checkbox': { width: 'fill', height: 40 },
      'm3-chip': { width: 'hug', height: 32 },
      'm3-card': { width: 'fill', height: 'hug' },
      'm3-list-item': { width: 'fill', height: 72 },
      'm3-navigation-bar': { width: 'fill', height: 80 },
      'm3-bottom-sheet': { width: 'fill', height: 'hug' },
      'm3-scrim': { width: 'fill', height: 'fill' },
      'm3-box': { width: 'fill', height: 'hug' },
      'm3-row': { width: 'fill', height: 'hug' },
      'm3-column': { width: 'fill', height: 'hug' },
    });
  });

  it('the actions slot of the card lines up the buttons on the right, with 8 of gap', () => {
    const card = M3_COMPONENTS.find((c) => c.id === 'm3-card')!;
    const slot = findSlot(card)!;
    expect(slot.name).toBe(ACTIONS_SLOT);
    expect(resolveSlotLayout(slot, {})).toMatchObject({
      type: 'row',
      gap: 8,
      justify: 'end',
    });
  });

  it('the specialization declares the sdui origin and the external types of each component', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.origins).toHaveLength(1);
    const card = lib.types.find((t) => t.id === 'm3-card')!;
    expect(card.sources).toEqual([{ system: 'sdui', name: 'Card', slot: ACTIONS_SLOT }]);
    // Only the modal scrim does not correspond to an SDUI node.
    expect(lib.types.filter((t) => t.sources.length === 0).map((t) => t.id)).toEqual([
      'm3-scrim',
    ]);
  });
});

describe('lab specializations in formatVersion 4', () => {
  it('M3_SPEC passes parseSpec v4 without any error', () => {
    expect(M3_SPEC.formatVersion).toBe(4);
    const result = parseSpec(M3_SPEC);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('SAMPLE_SPEC passes parseSpec in the version it declares', () => {
    const result = parseSpec(SAMPLE_SPEC);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
