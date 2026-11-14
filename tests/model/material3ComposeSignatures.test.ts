// Material 3 (Compose) imported through the signature (stage #1079, S5, decisions 14 and 17): each type and each
// `variants` case cites the signature sheet derived from androidx at the pinned commit (`signatures/`), re-importing the
// sheet does not change the specialization (the proof of "no hand modeling"), the parameters of the
// acceptance proof became fields and the drawing follows the new fields.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { parseSignatureText } from '../../src/model/signatures/parseSignature';
import { planSignatureImport } from '../../src/model/signatures/importPlan';
import { validateLibrary } from '../../src/model/library';
import type { Spec, SpecAnnotationType, SpecField } from '../../src/model/spec';
import type { SceneNode } from '../../src/model/components/scene';
import {
  SPEC_FILE,
  drawIn,
  files,
  solid,
  spec,
  text,
  typeOf,
  types,
} from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  label: 'rótulo',
  content: 'conteúdo',
  line: 'linha',
  shadowLevel3: 'sombra nível 3',
  shadowLevel1: 'sombra nível 1',
  title: 'título',
  dot: 'ponto',
  ring: 'anel',
  track: 'trilho',
  thumb: 'alça',
} as const;

const COMMIT = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

/** Every signature sheet path the specialization cites: the type's and that of each `variants` case. */
const cited = types.flatMap((type) => {
  const code = type.code?.compose;
  const base = [
    { id: type.id, variant: undefined as string | undefined, path: code?.signature },
  ];
  const cases = Object.entries(code?.variants?.cases ?? {}).map(([variant, kase]) => ({
    id: type.id,
    variant: variant as string | undefined,
    path: kase.signature,
  }));
  return [...base, ...cases];
});

const fieldOf = (type: SpecAnnotationType, key: string): SpecField | undefined =>
  type.fields.find((f) => f.key === key);

const SIGNATURE_SHEETS = files.filter((f) => f.path.startsWith('signatures/'));

function readSignature(path: string) {
  const parsed = parseSignatureText(text(path));
  if (!parsed.ok)
    throw new Error(`${path}: ${parsed.issues[0]?.message ?? 'invalid signature sheet'}`);
  return parsed.signature;
}

describe('Material 3 (Compose): the signature sheets (decision 14 of #1079)', () => {
  it('is formatVersion 16 and version 14 (the version went up once in the #1079 epic, over the 12 of main; the 14 is R5 of #1096)', () => {
    expect(spec.formatVersion).toBe(16);
    expect(spec.version).toBe(14);
  });

  it('every type, and every variants case, cites its sheet in signatures/', () => {
    expect(cited.length).toBeGreaterThan(90);
    for (const { id, variant, path } of cited) {
      const expected =
        variant === undefined
          ? `signatures/${id}.compose.json`
          : `signatures/${id}.${variant}.compose.json`;
      expect(path, `${id}${variant === undefined ? '' : `/${variant}`}`).toBe(expected);
    }
  });

  it('every cited sheet exists, is valid and matches the symbol, the file and the commit of the code', () => {
    for (const { id, variant, path } of cited) {
      const name = `${id}${variant === undefined ? '' : `/${variant}`}`;
      expect(text(path ?? ''), name).not.toBe('');
      const sig = readSignature(path as string);
      const code = typeOf(id).code?.compose;
      const kase = variant === undefined ? undefined : code?.variants?.cases[variant];
      expect(sig.source.kind, name).toBe('code');
      if (sig.source.kind !== 'code') continue;
      expect(sig.source.symbol, name).toBe(kase?.symbol ?? code?.symbol);
      expect(sig.source.path, name).toBe(kase?.path ?? code?.path);
      expect(sig.source.ref, name).toBe(COMMIT);
      expect(sig.source.extractor, name).toMatch(/^mapping-signature\/kotlin@1$/);
    }
  });

  it('every sheet of the package is cited (none is left over in signatures/)', () => {
    const citedPaths = new Set(cited.map((c) => c.path));
    expect(SIGNATURE_SHEETS.length).toBe(citedPaths.size);
    for (const file of SIGNATURE_SHEETS)
      expect(citedPaths.has(file.path), file.path).toBe(true);
  });

  it('the package validates without an error at the three levels', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
  }, 30_000);

  // One `it` per sheet: the single loop took ~1.4 s and blew the 5 s of the test in the shard under CI load (CL2, E-1).
  it.each(
    cited.map(({ id, variant, path }) => ({
      name: `${id}${variant === undefined ? '' : `/${variant}`}`,
      id,
      variant,
      path,
    })),
  )(
    're-importing the sheet $name does not change the specialization (idempotence)',
    (entry) => {
      const { name, id, variant, path } = entry;
      const signature = readSignature(path as string);
      const result = planSignatureImport(spec, {
        type: id,
        target: { platform: 'compose' },
        ...(variant === undefined ? {} : { variant }),
        signature,
        previous: signature,
      });
      expect(result.ok, name).toBe(true);
      if (!result.ok) return;
      expect(result.plan.spec, name).toEqual(spec);
      expect(result.plan.changes, name).toEqual([]);
      expect(result.plan.versionBump, name).toBe(false);
    },
  );

  it('fieldModels.compose carries the models of the proof (decision 14)', () => {
    const models = (
      spec as Spec & { fieldModels?: Record<string, Record<string, unknown>> }
    ).fieldModels?.compose;
    expect(models).toMatchObject({
      Color: { like: 'surface.color' },
      Shape: { like: 'surface.shape' },
      Dp: { type: 'number', format: '{value}.dp' },
      TextUnit: { type: 'number', format: '{value}.sp' },
      PaddingValues: { expand: { params: { horizontal: 'Dp', vertical: 'Dp' } } },
      BorderStroke: { expand: { params: { width: 'Dp', color: 'Color' } } },
      'BorderStroke?': { expand: { params: { width: 'Dp', color: 'Color' } } },
      '@Composable () -> Unit': { type: 'string', format: '{ Text("{value}") }' },
      '(@Composable () -> Unit)?': { type: 'string', format: '{ Text("{value}") }' },
      '@Composable (() -> Unit)?': { type: 'string', format: '{ Text("{value}") }' },
    });
    expect((models as Record<string, { options?: string[] }>).boolean?.options).toEqual([
      'true',
      'false',
    ]);
  });

  it('the parameters the acceptance proof lists became fields, with no hand modeling', () => {
    // `PaddingValues` expands into `horizontal`/`vertical` and `BorderStroke` into `borderWidth`/`borderColor`
    // (or `width`/`color`, when there is no collision); the field is born with the parameter name.
    const wanted: Record<string, string[]> = {
      button: [
        'shape',
        'horizontal',
        'vertical',
        'containerColor',
        'contentColor',
        'disabledContainerColor',
        'disabledContentColor',
        'borderWidth',
      ],
      'radio-button': ['selectedColor', 'unselectedColor', 'disabledSelectedColor'],
      switch: ['checkedThumbColor', 'checkedTrackColor', 'uncheckedThumbColor'],
      divider: ['color'],
      surface: ['shadowElevation', 'borderWidth', 'borderColor'],
      'top-app-bar': ['subtitle', 'containerColor', 'titleContentColor'],
      'text-field': ['prefix', 'suffix'],
      'secure-text-field': ['prefix', 'suffix'],
    };
    for (const [id, keys] of Object.entries(wanted)) {
      const type = typeOf(id);
      for (const key of keys) expect(fieldOf(type, key), `${id}.${key}`).toBeDefined();
    }
  });

  it('the button expands the shape, the contentPadding and the colors into the code arguments', () => {
    const code = typeOf('button').code?.compose;
    expect(code?.calls).toMatchObject({
      colors: 'androidx.compose.material3.ButtonDefaults.buttonColors',
    });
    expect(code?.variants?.cases.outlined?.calls).toMatchObject({
      colors: 'androidx.compose.material3.ButtonDefaults.outlinedButtonColors',
    });
    expect(code?.params).toMatchObject({
      shape: 'shape',
      containerColor: 'colors.containerColor',
      horizontal: 'contentPadding.horizontal',
      vertical: 'contentPadding.vertical',
    });
    expect(code?.formats).toMatchObject({
      horizontal: '{value}.dp',
      vertical: '{value}.dp',
    });
  });

  it('parameters without a field leave a trace: pending notices with the sheet ref', () => {
    let pending = 0;
    for (const type of types) {
      for (const notice of type.notices ?? []) {
        if (notice.kind !== 'pending' || !notice.ref?.startsWith('signatures/')) continue;
        pending++;
        expect(notice.message, `${type.id}`).toMatch(/^compose: /);
      }
    }
    expect(pending).toBeGreaterThan(20);
  });
});

function allText(node: SceneNode, acc: string[] = []): string[] {
  if (node.type === 'text') acc.push(node.text ?? '');
  if ('children' in node) for (const c of node.children) allText(c, acc);
  return acc;
}
function named(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node) {
    for (const c of node.children) {
      const found = named(c, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
const fillOf = (node: SceneNode, name: string): string | undefined => {
  const found = named(node, name);
  return found === undefined ? undefined : solid(found.fills);
};
const radiusOf = (node: SceneNode, name: string): unknown =>
  (named(node, name) as { cornerRadius?: unknown } | undefined)?.cornerRadius;
const widthOf = (node: SceneNode, name: string): number | undefined =>
  named(node, name)?.width;
const textColor = (node: SceneNode, name: string): string | undefined => {
  const found = named(node, name);
  return found?.type === 'text' ? solid(found.fills) : undefined;
};

describe('Material 3 (Compose): the drawing follows the imported fields (decision 14)', () => {
  const catalog = buildCatalog(files);
  const draw = (id: string, values: Record<string, unknown>, mode: 'light' | 'dark') =>
    drawIn(catalog, findEntry(catalog, id)!, values as never, mode);

  it('button: containerColor and contentColor change the colors, and the disabled one wins', () => {
    for (const mode of ['light', 'dark'] as const) {
      const base = draw('button', { label: 'Ok' }, mode);
      const tertiary = draw('button', { label: 'Ok', containerColor: 'tertiary' }, mode);
      expect(fillOf(tertiary.root, 'container'), mode).toBeDefined();
      expect(fillOf(tertiary.root, 'container'), mode).not.toBe(
        fillOf(base.root, 'container'),
      );
      const content = draw('button', { label: 'Ok', contentColor: 'error' }, mode);
      expect(textColor(content.root, NAMES.label), mode).not.toBe(
        textColor(base.root, NAMES.label),
      );
      expect(tertiary.warnings).toEqual([]);
      expect(content.warnings).toEqual([]);
    }
    const light = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'light');
    const dark = draw('button', { label: 'Ok', containerColor: 'tertiary' }, 'dark');
    expect(fillOf(light.root, 'container')).not.toBe(fillOf(dark.root, 'container'));
    const off = draw(
      'button',
      { label: 'Ok', containerColor: 'tertiary', enabled: 'false' },
      'light',
    );
    expect(fillOf(off.root, 'container')).not.toBe(fillOf(light.root, 'container'));
    const offOwn = draw(
      'button',
      {
        label: 'Ok',
        enabled: 'false',
        disabledContainerColor: 'error',
        disabledContentColor: 'primary',
      },
      'light',
    );
    const offBase = draw('button', { label: 'Ok', enabled: 'false' }, 'light');
    expect(fillOf(offOwn.root, 'container')).not.toBe(fillOf(offBase.root, 'container'));
    expect(textColor(offOwn.root, NAMES.label)).not.toBe(
      textColor(offBase.root, NAMES.label),
    );
  });

  it('button: a small shape changes the radius and contentPadding changes the content box', () => {
    const base = draw('button', { label: 'Ok' }, 'light');
    const small = draw('button', { label: 'Ok', shape: 'small' }, 'light');
    expect(radiusOf(small.root, 'container')).not.toEqual(
      radiusOf(base.root, 'container'),
    );
    const wide = draw('button', { label: 'Ok', horizontal: 40 }, 'light');
    const narrow = draw('button', { label: 'Ok', horizontal: 4 }, 'light');
    expect(widthOf(wide.root, NAMES.content)).toBeGreaterThan(
      widthOf(narrow.root, NAMES.content) ?? 0,
    );
    const tall = draw('button', { label: 'Ok', vertical: 20 }, 'light');
    const flat = draw('button', { label: 'Ok', vertical: 2 }, 'light');
    const h = (r: SceneNode) => named(r, NAMES.content)?.height ?? 0;
    expect(h(tall.root)).toBeGreaterThan(h(flat.root));
  });

  it('divider: color changes the line color', () => {
    const base = draw('divider', {}, 'light');
    const primary = draw('divider', { color: 'primary' }, 'light');
    expect(fillOf(primary.root, NAMES.line)).not.toBe(fillOf(base.root, NAMES.line));
    expect(fillOf(primary.root, NAMES.line)).toBe('#6750A4');
  });

  it('surface: borderWidth, borderColor and shadowElevation show up in the drawing', () => {
    const base = draw('surface', {}, 'light');
    const border = draw('surface', { borderWidth: 2, borderColor: 'primary' }, 'light');
    const shadow = draw('surface', { shadowElevation: 6 }, 'light');
    expect(base.root.stroke?.width ?? 0).toBe(0);
    expect(border.root.stroke?.width).toBe(2);
    expect(solid(border.root.stroke?.paints ?? [])).toBe('#6750A4');
    // the shadow is drawn by the node of the level the elevation reaches (6 dp: level 3)
    expect(named(base.root, NAMES.shadowLevel3)).toBeUndefined();
    expect(named(shadow.root, NAMES.shadowLevel3)?.effects.length).toBeGreaterThan(0);
    expect(
      named(draw('surface', { shadowElevation: 1 }, 'light').root, NAMES.shadowLevel1),
    ).toBeDefined();
  });

  it('top-app-bar: subtitle draws one more text, and the colors change the background and the title', () => {
    const base = draw('top-app-bar', { title: 'Title', style: 'small' }, 'light');
    const sub = draw(
      'top-app-bar',
      { title: 'Title', style: 'small', subtitle: 'Sub' },
      'light',
    );
    expect(allText(sub.root)).toContain('Sub');
    expect(allText(base.root)).not.toContain('Sub');
    const colored = draw(
      'top-app-bar',
      { title: 'Title', containerColor: 'primary', titleContentColor: 'onPrimary' },
      'light',
    );
    expect(solid(colored.root.fills)).toBe('#6750A4');
    expect(textColor(colored.root, NAMES.title)).not.toBe(
      textColor(base.root, NAMES.title),
    );
    for (const mode of ['light', 'dark'] as const) {
      expect(
        draw('top-app-bar', { title: 'T', subtitle: 'S' }, mode).warnings,
        mode,
      ).toEqual([]);
    }
  });

  it('radio-button and switch: the colors change the drawing', () => {
    const radio = draw('radio-button', { selected: 'true' }, 'light');
    const radioColored = draw(
      'radio-button',
      { selected: 'true', selectedColor: 'error' },
      'light',
    );
    expect(fillOf(radioColored.root, NAMES.dot)).not.toBe(fillOf(radio.root, NAMES.dot));
    const ring = (r: SceneNode): string | undefined => {
      const paints = named(r, NAMES.ring)?.stroke?.paints;
      return paints === undefined ? undefined : solid(paints);
    };
    const radioOff = draw(
      'radio-button',
      { selected: 'false', unselectedColor: 'error' },
      'light',
    );
    expect(ring(radioOff.root)).toBeDefined();
    expect(ring(radioOff.root)).not.toBe(
      ring(draw('radio-button', { selected: 'false' }, 'light').root),
    );
    const sw = draw('switch', { checked: 'true' }, 'light');
    const swColored = draw(
      'switch',
      { checked: 'true', checkedTrackColor: 'tertiary', checkedThumbColor: 'error' },
      'light',
    );
    expect(fillOf(swColored.root, NAMES.track)).not.toBe(fillOf(sw.root, NAMES.track));
    expect(fillOf(swColored.root, NAMES.thumb)).not.toBe(fillOf(sw.root, NAMES.thumb));
    const swOff = draw(
      'switch',
      { checked: 'false', uncheckedTrackColor: 'error' },
      'light',
    );
    expect(fillOf(swOff.root, NAMES.track)).not.toBe(
      fillOf(draw('switch', { checked: 'false' }, 'light').root, NAMES.track),
    );
  });

  it('text-field: prefix and suffix draw the texts (and the secure-text-field too)', () => {
    for (const id of ['text-field', 'secure-text-field']) {
      // the `text-field` shows the typed text (`value`); the `secure-text-field`, the dots (`hasText`)
      const typed = id === 'text-field' ? { value: 'abc' } : { hasText: 'true' };
      const base = draw(id, typed, 'light');
      const both = draw(id, { ...typed, prefix: 'R$', suffix: 'kg' }, 'light');
      expect(allText(both.root), id).toEqual(expect.arrayContaining(['R$', 'kg']));
      expect(allText(base.root), id).not.toContain('R$');
      expect(both.warnings, id).toEqual([]);
    }
  });

  it('every example of the touched types draws without a warning in light and dark', () => {
    for (const id of [
      'button',
      'surface',
      'top-app-bar',
      'radio-button',
      'switch',
      'divider',
      'text-field',
      'secure-text-field',
    ]) {
      const entry = findEntry(catalog, id)!;
      for (const mode of ['light', 'dark'] as const) {
        for (const ex of entry.type.examples ?? []) {
          const drawing = drawIn(catalog, entry, ex.values as never, mode);
          expect(drawing.warnings, `${id} ${mode} ${ex.name}`).toEqual([]);
        }
      }
    }
  });
});
