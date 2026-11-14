// MC2 (decisions 9 and 10 of #898): the evaluated `sizing` (`resolveSizing`) and the measure function of the
// fit to content (`fitComponentSize`), which MC3 uses in `fitMarking`.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import {
  fitComponentSize,
  followedAxes,
  resolveSizing,
} from '../../../src/model/components/sizing';

const LINE = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd';

function component(
  sizing: unknown,
  template: Record<string, unknown> = {},
): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 50 },
    ...(sizing === undefined ? {} : { sizing }),
    template: {
      type: 'frame',
      layout: { type: 'column' },
      children: [
        {
          type: 'text',
          name: 'msg',
          text: { $field: 'msg' },
          width: 'fill',
          height: 'hug',
          font: { size: 10, lineHeight: 30 },
        },
      ],
      ...template,
    } as unknown as FrameTemplate,
  } as unknown as ComponentFile;
}

const fit = (
  c: ComponentFile,
  values = {},
  auto?: { width?: boolean; height?: boolean },
) => fitComponentSize(c, values, { measure: approximateMeasurer }, auto ? { auto } : {});

describe('resolveSizing', () => {
  it('without sizing each axis is the size, and the literal is as written', () => {
    const r = resolveSizing(component(undefined), {});
    expect([r.width, r.height]).toEqual([
      { spec: 200, source: 'size' },
      { spec: 50, source: 'size' },
    ]);
    const lit = resolveSizing(component({ width: 'fill', height: 20 }), {});
    expect([lit.width, lit.height]).toEqual([
      { spec: 'fill', source: 'literal' },
      { spec: 20, source: 'literal' },
    ]);
  });

  it('the expression is evaluated with the values; numeric text is a number; hug and fill apply', () => {
    const c = component({
      width: { $field: 'w' },
      height: { $switch: 'style', cases: { a: 64, b: 'hug', c: 'fill' } },
    });
    const r = (values: Record<string, unknown>) =>
      resolveSizing(c, values as never).height.spec;
    expect(r({ style: 'a' })).toBe(64);
    expect(r({ style: 'b' })).toBe('hug');
    expect(r({ style: 'c' })).toBe('fill');
    expect(resolveSizing(c, { w: '120' }).width).toEqual({
      spec: 120,
      source: 'expression',
    });
  });

  it('an invalid value (negative, text, percentage, without a value) falls back to the size with the warning', () => {
    const c = component({ height: { $field: 'h' } });
    for (const h of [-4, 'banana', '50%']) {
      const r = resolveSizing(c, { h });
      expect(r.height).toEqual({ spec: 50, source: 'size' });
      expect(r.messages.map((m) => m.text)).toEqual([
        `invalid value in sizing.height: ${h}`,
      ]);
    }
    expect(resolveSizing(c, {}).messages).toHaveLength(1);
  });
});

describe('followedAxes', () => {
  it('hug and the px of an expression follow; the literal in px and the fill do not', () => {
    const c = component({ width: 'hug', height: { $field: 'h' } });
    expect(followedAxes(resolveSizing(c, { h: 30 }))).toEqual({
      width: true,
      height: true,
    });
    expect(
      followedAxes(resolveSizing(component({ width: 10, height: 'fill' }), {})),
    ).toEqual({
      width: false,
      height: false,
    });
  });
});

describe('fitComponentSize', () => {
  const snackbar = (extra: Record<string, unknown> = {}) =>
    component(
      { height: 'hug' },
      {
        width: 'fill',
        minHeight: { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 68, else: 48 },
        ...extra,
      },
    );

  it('the hug axis is measured (48, 68 and the height of the lines) and the other stays at the size', () => {
    expect(fit(snackbar(), { msg: 'Ok' })).toMatchObject({ width: 200, height: 48 });
    expect(fit(snackbar(), { msg: LINE })).toMatchObject({ width: 200, height: 68 });
    expect(fit(snackbar(), { msg: `${LINE} ${LINE}` })).toMatchObject({
      width: 200,
      height: 90,
    });
  });

  it('the root maximum limits the measured axis', () => {
    expect(
      fit(snackbar({ minHeight: 10, maxHeight: 60 }), { msg: `${LINE} ${LINE}` })?.height,
    ).toBe(60);
  });

  it('the px of an expression applies as a size, and hug measures the other axis', () => {
    const c = component({
      width: { $if: { $has: 'msg' }, then: 120, else: 200 },
      height: 'hug',
    });
    expect(fit(c, { msg: 'Ok' })).toMatchObject({ width: 120, height: 30 });
  });

  it('the next integer: 12.5 of line height gives 13', () => {
    const c = component({ height: 'hug' }, { width: 'fill' });
    (c.template.children?.[0] as { font: { lineHeight: number } }).font.lineHeight = 12.5;
    expect(fit(c, { msg: 'Ok' })?.height).toBe(13);
  });

  it('without an axis that depends on content it returns undefined; auto turns an axis on or off', () => {
    expect(fit(component(undefined), { msg: 'Ok' })).toBeUndefined();
    expect(fit(component({ width: 10, height: 'fill' }), { msg: 'Ok' })).toBeUndefined();
    const c = snackbar();
    expect(fit(c, { msg: LINE }, { height: false })).toBeUndefined();
    expect(fit(component({}), { msg: LINE }, { height: true })).toMatchObject({
      width: 200,
    });
  });

  it('an invalid value of the sizing leaves the axis at the size: nothing to adjust (the warning belongs to resolveSizing)', () => {
    const c = component({ height: { $field: 'h' } });
    expect(fit(c, { h: 'banana' })).toBeUndefined();
    expect(fit(c, { h: 30 })).toMatchObject({ width: 200, height: 30 });
  });

  it('the minSize and the 1 px floor apply to the axes measured or given by expression (as in Arrange)', () => {
    const c = {
      ...component({ height: { $field: 'h' } }),
      minSize: { width: 20, height: 48 },
    } as ComponentFile;
    expect(fit(c, { h: 32 })?.height).toBe(48);
    expect(fit(c, { h: 120 })?.height).toBe(120);
    const hug = { ...component({ height: 'hug' }), minSize: { width: 20, height: 48 } };
    expect(fit(hug as ComponentFile, { msg: 'Ok' })?.height).toBe(48);
    expect(fit(component({ height: { $field: 'h' } }), { h: 0 })?.height).toBe(1);
  });
});
