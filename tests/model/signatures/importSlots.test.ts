// `planSignatureImport` and the component slots (stage #1080, SL3, decision 9): the importer links the
// `role: slot` parameters to the component's slots by the normalized name (decision 7 of #1079), writes
// the `code.slots` entry only when the name differs from the slot `id`, takes the linked slot out of
// `unmapped`, and stays idempotent. Only in a `formatVersion` 17 specialization.
import { describe, expect, it } from 'vitest';
import {
  planSignatureImport,
  type PlanSignatureImportOptions,
  type SignatureImportPlan,
} from '../../../src/model/signatures';
import type { Spec } from '../../../src/model/spec';
import { callback, composeSignature, librarySpec, text } from './importFixtures';

const SLOTS = ['navigationIcon', 'actions'];
const SLOT_TYPE = '@Composable RowScope.() -> Unit';

const slotParam = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  role: 'slot',
  type: SLOT_TYPE,
  ...extra,
});

function plan(
  spec: Spec,
  params: Record<string, unknown>[],
  options: Partial<PlanSignatureImportOptions> = {},
): SignatureImportPlan {
  const result = planSignatureImport(spec, {
    type: 'button',
    target: { platform: 'compose' },
    signature: composeSignature(params),
    slots: SLOTS,
    ...options,
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.plan;
}

const v17 = (): Spec => librarySpec((s) => (s.formatVersion = 17));

describe('slot parameters and the component slots', () => {
  it('links by the normalized name and writes the entry only when the name differs from the id', () => {
    const result = plan(v17(), [slotParam('navigation_icon'), slotParam('actions')]);
    expect(result.code?.slots).toEqual({ navigationIcon: 'navigation_icon' });
    expect(result.slotLinks).toEqual([
      { slot: 'navigationIcon', param: 'navigation_icon', via: 'name' },
      { slot: 'actions', param: 'actions', via: 'name' },
    ]);
  });

  it('the linked slot parameters leave unmapped; a slot parameter without a slot stays', () => {
    const result = plan(v17(), [
      slotParam('navigation_icon'),
      slotParam('actions'),
      slotParam('content', { required: true }),
      callback('onClick'),
    ]);
    expect(result.unmapped.map((u) => u.name)).toEqual(['content', 'onClick']);
  });

  it('a parameter that is not a slot is not linked, even with the same name', () => {
    const result = plan(v17(), [text('actions')]);
    expect(result.code?.slots).toBeUndefined();
    expect(result.slotLinks).toEqual([]);
  });

  it('an entry already in code.slots is kept: its parameter leaves unmapped and no second link is made', () => {
    const spec = librarySpec((s) => {
      s.formatVersion = 17;
      s.layers[0].annotationTypes[1].code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          slots: { actions: 'trailing' },
        },
      };
    });
    const result = plan(spec, [slotParam('trailing'), slotParam('actions')]);
    expect(result.code?.slots).toEqual({ actions: 'trailing' });
    expect(result.slotLinks).toContainEqual({
      slot: 'actions',
      param: 'trailing',
      via: 'slots',
    });
    // `actions` the parameter is not taken by name: the slot already has its parameter.
    expect(result.unmapped.map((u) => u.name)).toEqual(['actions']);
  });

  it('is idempotent: importing the result again changes nothing', () => {
    const params = [slotParam('navigation_icon'), slotParam('actions')];
    const first = plan(v17(), params);
    const second = plan(first.spec, params);
    expect(second.spec).toEqual(first.spec);
    expect(second.code?.slots).toEqual({ navigationIcon: 'navigation_icon' });
    expect(second.unmapped).toEqual(first.unmapped);
    expect(second.versionBump).toBe(false);
  });

  it('without the component slots (no `slots` option), nothing changes', () => {
    const result = plan(v17(), [slotParam('actions')], { slots: undefined });
    expect(result.code?.slots).toBeUndefined();
    expect(result.slotLinks).toEqual([]);
    expect(result.unmapped.map((u) => u.name)).toEqual(['actions']);
  });

  it('in a formatVersion 16 specialization the slots are not linked (code.slots does not exist there)', () => {
    const result = plan(librarySpec(), [slotParam('navigation_icon')]);
    expect(result.code?.slots).toBeUndefined();
    expect(result.slotLinks).toEqual([]);
    expect(result.unmapped.map((u) => u.name)).toEqual(['navigation_icon']);
  });

  it('a parameter with a field model is both a field (default content) and the slot parameter', () => {
    const modeled = slotParam('navigation_icon', { type: '@Composable () -> Unit' });
    const result = plan(v17(), [modeled]);
    expect(result.type.fields.map((f) => f.key)).toContain('navigation_icon');
    expect(result.code?.slots).toEqual({ navigationIcon: 'navigation_icon' });
    expect(result.unmapped).toEqual([]);
  });

  it('one signature per case: the case writes its own entry and the base is not touched', () => {
    const spec = librarySpec((s) => {
      s.formatVersion = 17;
      const type = s.layers[0].annotationTypes[1];
      type.fields = [{ key: 'kind', type: 'enum', options: ['filled', 'outlined'] }];
      type.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          variants: {
            field: 'kind',
            cases: { outlined: { notes: 'outlined' } },
          },
        },
      };
    });
    const result = plan(spec, [slotParam('navigation_icon')], { variant: 'outlined' });
    const code = result.code;
    expect(code?.slots).toBeUndefined();
    expect(code?.variants?.cases.outlined?.slots).toEqual({
      navigationIcon: 'navigation_icon',
    });
  });

  // Found by the /code-review of the phase.
  it('a slot id that is a member of Object.prototype (constructor) is linked by name like any other', () => {
    const result = plan(v17(), [slotParam('constructor')], { slots: ['constructor'] });
    expect(result.slotLinks).toEqual([
      { slot: 'constructor', param: 'constructor', via: 'name' },
    ]);
    expect(result.unmapped).toEqual([]);
  });

  it('a stale code.slots entry (its parameter left the sheet) is not reported as linked', () => {
    const spec = librarySpec((s) => {
      s.formatVersion = 17;
      s.layers[0].annotationTypes[1].code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          slots: { actions: 'gone' },
        },
      };
    });
    const result = plan(spec, [slotParam('trailing')]);
    expect(result.slotLinks).toEqual([]);
    expect(result.code?.slots).toEqual({ actions: 'gone' });
    expect(result.unmapped.map((u) => u.name)).toEqual(['trailing']);
  });

  it('without the component slot ids, the entries already in code.slots still take their parameter out of unmapped', () => {
    const spec = librarySpec((s) => {
      s.formatVersion = 17;
      s.layers[0].annotationTypes[1].code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          slots: { actions: 'trailing' },
        },
      };
    });
    const result = plan(spec, [slotParam('trailing'), slotParam('content')], {
      slots: undefined,
    });
    expect(result.slotLinks).toEqual([]);
    expect(result.unmapped.map((u) => u.name)).toEqual(['content']);
  });
});
