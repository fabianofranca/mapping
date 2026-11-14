// M3 of the "faithful Material 3" stage, group B: text-field, secure-text-field and search-bar against what
// `TextField.kt`, `TextFieldDefaults.kt`, `SearchBar.kt` and the tokens fix at commit 5113b82a.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { SPEC_FILE, files, solid, text } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];

/** Draws the component in a `width` × `height` box (the default is its own `size`). */
function draw(
  id: string,
  values: Values,
  mode: 'light' | 'dark' = 'light',
  box?: { width: number; height: number },
) {
  const entry = entryOf(id);
  const library = catalog.library!;
  const size = box ?? entry.component!.size;
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, ...size },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}
type Drawing = ReturnType<typeof draw>;
const both = (id: string, values: Values, box?: { width: number; height: number }) => ({
  light: draw(id, values, 'light', box),
  dark: draw(id, values, 'dark', box),
});

// pt-BR kept: the quoted node names ('rótulo', 'trilho', ...) are the names in the material3-compose library (libraries/*.json, outside this phase)
/** The first visible node with the name. */
const named = (root: SceneNode, name: string): SceneNode | undefined => {
  for (const node of walk(root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const texts = (d: Drawing, name: string): TextNode | undefined => {
  const node = named(d.root, name);
  return node?.type === 'text' ? node : undefined;
};
const iconOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const color = (node: SceneNode | undefined) => solid(node?.fills ?? []);
const strokeColor = (node: SceneNode | undefined) => solid(node?.stroke?.paints ?? []);
const textColor = (node: TextNode | undefined) => solid(node?.fills ?? []);
const boxOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  return node === undefined ? undefined : absoluteBoxes(d.root).get(node.id);
};
const fontOf = (node: TextNode | undefined) => {
  const s = node?.style;
  return [s?.fontSize, s?.lineHeight, s?.fontWeight, s?.letterSpacing];
};
const BODY_LARGE = [16, 24, 400, 0.5];
const BODY_SMALL = [12, 16, 400, 0.4];

describe('M3 group B — text-field', () => {
  it('filled: height 56, surface-container-highest background with top radius 4 and a 1 indicator only at the bottom', () => {
    const base = { label: 'Name', value: 'Maria', supportingText: 'Required' };
    const { light, dark } = both('text-field', base);
    // the container stays at 56 (fixed height); the drawing has the size's height (84) and the 8 left over stay empty at the bottom
    expect(boxOf(light, 'contêiner')?.height).toBe(56);
    expect(boxOf(light, 'contêiner')?.width).toBe(280);
    const fundo = named(light.root, 'fundo');
    expect(color(fundo)).toBe('#E6E0E9');
    expect(color(named(dark.root, 'fundo'))).toBe('#36343B');
    // top radius 4 by token (CornerExtraSmallTop): the list of 4 radii accepts `$token` per item
    expect(fundo?.type === 'rect' && fundo.cornerRadius).toEqual([4, 4, 0, 0]);
    expect(fundo?.height).toBe(56);
    expect(
      named(light.root, 'contêiner')?.type === 'frame' &&
        (named(light.root, 'contêiner') as { clip: boolean }).clip,
    ).toBe(true);
    // FilledTextFieldTokens.ActiveIndicatorHeight = 1, only the bottom border (stroke.sides)
    const indicador = named(light.root, 'indicador');
    expect(indicador?.stroke?.sides).toEqual(['bottom']);
    expect(indicador?.stroke?.width).toBe(1);
    expect(strokeColor(indicador)).toBe('#49454F');
    expect(strokeColor(named(dark.root, 'indicador'))).toBe('#CAC4D0');
    // no 1 px high rectangle plays the role of the indicator
    const thin = [...walk(light.root)].filter(
      (n) => n.type === 'rect' && n.visible && n.height === 1,
    );
    expect(thin).toEqual([]);
    // the outlined style's outline does not appear on the filled one
    expect(named(light.root, 'contorno')).toBeUndefined();
  });

  it('filled: the indicator is 1 px without focus, even in error (the thickness of 2 is for focus)', () => {
    const { light } = both('text-field', { label: 'Name', isError: 'true' });
    expect(named(light.root, 'indicador')?.stroke?.width).toBe(1);
  });

  it('colors of the label, value, hint, supporting text and icons by token, in light and dark', () => {
    const base = {
      label: 'Name',
      value: 'Maria',
      supportingText: 'Help',
      leadingIcon: 'Email',
      trailingIcon: 'Lock',
    };
    const normal = both('text-field', base);
    // LabelColor/SupportingColor = onSurfaceVariant; InputColor = onSurface; icons onSurfaceVariant
    expect(textColor(texts(normal.light, 'rótulo'))).toBe('#49454F');
    expect(textColor(texts(normal.dark, 'rótulo'))).toBe('#CAC4D0');
    expect(textColor(texts(normal.light, 'valor'))).toBe('#1D1B20');
    expect(textColor(texts(normal.dark, 'valor'))).toBe('#E6E0E9');
    expect(textColor(texts(normal.light, 'apoio'))).toBe('#49454F');
    expect(iconOf(normal.light, 'email').color).toBe('#49454F');
    expect(iconOf(normal.dark, 'lock').color).toBe('#CAC4D0');
    const hint = both('text-field', { label: 'Name', placeholder: 'Hint' });
    expect(textColor(texts(hint.light, 'dica'))).toBe('#49454F');
    expect(textColor(texts(hint.dark, 'dica'))).toBe('#CAC4D0');

    // error: indicator, label, supporting text and trailing icon in error; the value and the leading icon do not change
    const errored = both('text-field', { ...base, isError: 'true' });
    expect(strokeColor(named(errored.light.root, 'indicador'))).toBe('#B3261E');
    expect(strokeColor(named(errored.dark.root, 'indicador'))).toBe('#F2B8B5');
    expect(textColor(texts(errored.light, 'rótulo'))).toBe('#B3261E');
    expect(textColor(texts(errored.dark, 'apoio'))).toBe('#F2B8B5');
    expect(iconOf(errored.light, 'lock').color).toBe('#B3261E');
    expect(iconOf(errored.light, 'email').color).toBe('#49454F');
    expect(textColor(texts(errored.light, 'valor'))).toBe('#1D1B20');
    // the hint in error stays onSurfaceVariant (errorPlaceholderColor)
    const dicaErro = both('text-field', {
      label: 'Name',
      placeholder: 'Hint',
      isError: 'true',
    });
    expect(textColor(texts(dicaErro.light, 'dica'))).toBe('#49454F');
  });

  it('typography: label and value in body-large, minimized label and supporting text in body-small', () => {
    const empty = both('text-field', { label: 'Name', supportingText: 'Help' });
    expect(fontOf(texts(empty.light, 'rótulo'))).toEqual(BODY_LARGE);
    const filled = both('text-field', { label: 'Name', value: 'Maria' });
    expect(fontOf(texts(filled.light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(fontOf(texts(filled.light, 'valor'))).toEqual(BODY_LARGE);
    const hint = both('text-field', { label: 'Name', placeholder: 'Hint' });
    expect(fontOf(texts(hint.light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(fontOf(texts(hint.light, 'dica'))).toEqual(BODY_LARGE);
    const support = both('text-field', { label: 'Name', supportingText: 'Help' });
    expect(fontOf(texts(support.light, 'apoio'))).toEqual(BODY_SMALL);
    // no text node declares the family: all inherit font-sans
    for (const node of walk(filled.light.root))
      if (node.type === 'text') expect(node.style.fontFamily).toBe('Roboto, sans-serif');
  });

  it('positions: leading icon at 12, text at 52 (4 of padding + 48 of the icon), supporting text with 16 and 4', () => {
    const d = draw('text-field', {
      label: 'Name',
      value: 'Maria',
      supportingText: 'Help',
      leadingIcon: 'Email',
      trailingIcon: 'Lock',
    }).root;
    const boxes = absoluteBoxes(d);
    const at = (name: string) => boxes.get(named(d, name)!.id)!;
    expect(at('email').x).toBe(12);
    expect(at('email').width).toBe(24);
    expect(at('valor').x).toBe(52);
    expect(at('lock').x).toBe(280 - 12 - 24);
    // minimized label (16) above the value (24), both centered in the 56: starts at 8
    expect(at('rótulo').y).toBe(8);
    expect(at('valor').y).toBe(24);
    expect(at('apoio').x).toBe(16);
    expect(at('apoio').y).toBe(56 + 4);
    // without icons the text starts at 16
    const plain = draw('text-field', { label: 'Name', value: 'Maria' }).root;
    expect(absoluteBoxes(plain).get(named(plain, 'valor')!.id)!.x).toBe(16);
  });

  it('disabled: content at 0.38 over onSurface, indicator at 0.38 and container kept', () => {
    const base = {
      label: 'Name',
      value: 'Maria',
      supportingText: 'Help',
      leadingIcon: 'Email',
      enabled: 'false',
    };
    const { light, dark } = both('text-field', base);
    // TextFieldDefaults.colors: disabledContainerColor = ContainerColor (surfaceContainerHighest)
    expect(color(named(light.root, 'fundo'))).toBe('#E6E0E9');
    const indicador = named(dark.root, 'indicador');
    expect(strokeColor(indicador)).toBe('#E6E0E9');
    expect(indicador?.opacity).toBe(0.38);
    for (const name of ['rótulo', 'valor', 'apoio']) {
      expect(textColor(texts(dark, name))).toBe('#E6E0E9');
      expect(texts(dark, name)?.opacity).toBe(0.38);
    }
    expect(iconOf(light, 'email').color).toBe('#1D1B20');
    expect(iconOf(light, 'email').node?.opacity).toBe(0.38);
    // disabled wins over error
    const errored = draw('text-field', { ...base, isError: 'true' }).root;
    expect(strokeColor(named(errored, 'indicador'))).toBe('#1D1B20');
  });

  it('outlined: 1 outline with radius 4 by token, no fill, and 56 of field under the label on the border', () => {
    const { light, dark } = both(
      'text-field',
      { label: 'Name', style: 'outlined', supportingText: 'Help' },
      { width: 280, height: 84 },
    );
    // OutlinedTextField: padding(top = half the minimized label = 8) + MinHeight 56
    expect(boxOf(light, 'contêiner')?.height).toBe(64);
    const contorno = named(light.root, 'contorno');
    expect(contorno?.height).toBe(56);
    expect(contorno?.stroke?.width).toBe(1);
    expect(contorno?.stroke?.sides).toBeUndefined();
    expect(contorno?.type === 'rect' && contorno.cornerRadius).toBe(4);
    expect(contorno?.fills).toEqual([]);
    expect(strokeColor(contorno)).toBe('#79747E');
    expect(strokeColor(named(dark.root, 'contorno'))).toBe('#938F99');
    expect(named(light.root, 'fundo')).toBeUndefined();
    expect(named(light.root, 'indicador')).toBeUndefined();
    // error: OutlinedTextFieldTokens.ErrorOutlineColor = error
    const errored = both('text-field', {
      label: 'Name',
      style: 'outlined',
      isError: 'true',
    });
    expect(strokeColor(named(errored.light.root, 'contorno'))).toBe('#B3261E');
    expect(strokeColor(named(errored.dark.root, 'contorno'))).toBe('#F2B8B5');
    // disabled: DisabledOutlineColor = onSurface at 0.12 (state-disabled-container)
    const off = draw('text-field', {
      label: 'Name',
      style: 'outlined',
      enabled: 'false',
    });
    expect(strokeColor(named(off.root, 'contorno'))).toBe('#1D1B20');
    expect(named(off.root, 'contorno')?.opacity).toBe(0.12);
  });

  it('outlined with text: the minimized label opens a gap in the outline (no color patch), with no 1 px height', () => {
    const d = draw('text-field', { label: 'Name', value: 'Maria', style: 'outlined' });
    // a single outline (rect of radius 4, corner-extra-small) with the gap (stroke.gap) over the label; no `sides` or segments
    const contorno = named(d.root, 'contorno');
    expect(contorno).toMatchObject({ type: 'rect', cornerRadius: 4 });
    expect(contorno?.stroke?.sides).toBeUndefined();
    expect(strokeColor(contorno)).toBe('#79747E');
    expect(named(d.root, 'contorno (lados)')).toBeUndefined();
    expect(named(d.root, 'trecho inicial')).toBeUndefined();
    expect(named(d.root, 'trecho final')).toBeUndefined();
    const boxes = absoluteBoxes(d.root);
    const label = texts(d, 'rótulo minimizado')!;
    expect(label).toBeDefined();
    // the minimized label sits at x = 16 (TextFieldPadding), between the gap of 4 on each side
    expect(boxes.get(label.id)!.x).toBe(16);
    expect(contorno?.stroke?.gaps).toHaveLength(1);
    const gap = contorno!.stroke!.gaps![0]!;
    expect(gap.side).toBe('top');
    expect(gap.from).toBe(12);
    expect(gap.to).toBeCloseTo(16 + boxes.get(label.id)!.width + 4, 5);
    // the top line of the outline is at y = 8, at the center of the 16 label
    expect(boxes.get(contorno!.id)!.y).toBe(8);
    expect(fontOf(label)).toEqual(BODY_SMALL);
    // the gap is a real gap: no frame or rectangle covers the outline with a background color
    const patch = [...walk(d.root)].filter(
      (n) => (n.type === 'frame' || n.type === 'rect') && n.visible && n.fills.length > 0,
    );
    expect(patch).toEqual([]);
    // without text, the label stays inside the field (no gap) in body-large
    const empty = draw('text-field', { label: 'Name', style: 'outlined' });
    expect(named(empty.root, 'contorno')).toBeDefined();
    expect(named(empty.root, 'contorno')?.stroke?.gaps ?? []).toEqual([]);
    expect(named(empty.root, 'contorno (lados)')).toBeUndefined();
    expect(fontOf(texts(empty, 'rótulo'))).toEqual(BODY_LARGE);
  });

  it('value: a single line does not wrap or get an ellipsis; maxLines comes from the field and from singleLine', () => {
    const long = 'a very long text that does not fit on one line of the text field';
    const single = draw('text-field', { label: 'Name', value: long, singleLine: 'true' });
    expect(texts(single, 'valor')?.style.wrap).toBe('none');
    expect(texts(single, 'valor')?.style.maxLines).toBe(1);
    expect(texts(single, 'valor')?.style.ellipsis).toBeUndefined();
    const multi = draw('text-field', { label: 'Name', value: long }, 'light', {
      width: 280,
      height: 200,
    });
    expect(texts(multi, 'valor')?.style.wrap).toBeUndefined();
    expect(texts(multi, 'valor')?.style.maxLines).toBeUndefined();
    // word wrapping grows the text; maxLines cuts at the field's number of lines
    const two = draw('text-field', { label: 'Name', value: long, maxLines: 2 }, 'light', {
      width: 280,
      height: 200,
    });
    expect(texts(two, 'valor')?.style.maxLines).toBe(2);
    expect(texts(two, 'valor')?.height).toBe(48);
    expect(texts(multi, 'valor')!.height).toBeGreaterThan(48);
    // singleLine ignores maxLines, like BasicTextField
    const both1 = draw('text-field', {
      label: 'Name',
      value: long,
      singleLine: 'true',
      maxLines: 3,
    });
    expect(texts(both1, 'valor')?.style.maxLines).toBe(1);
  });

  it('label and supporting text wrap by word, with no line limit or ellipsis (like the Compose Text)', () => {
    const d = draw('text-field', {
      label: 'Very long field label',
      supportingText: 'Supporting text long enough to go over one line in the width',
    });
    for (const name of ['rótulo', 'apoio']) {
      const node = texts(d, name);
      expect(node?.style.wrap).toBeUndefined();
      expect(node?.style.maxLines).toBeUndefined();
      expect(node?.style.ellipsis).toBeUndefined();
    }
  });

  it('the floor of height 56 comes from minHeight, even in a shorter box', () => {
    const d = draw('text-field', { label: 'Name' }, 'light', { width: 280, height: 40 });
    expect(boxOf(d, 'contêiner')?.height).toBe(56);
  });
});

describe('M3 group B — secure-text-field', () => {
  it('filled: 1 indicator only at the bottom, background and colors by token in light and dark', () => {
    const { light, dark } = both('secure-text-field', {
      label: 'Password',
      hasText: 'true',
      supportingText: 'Help',
      leadingIcon: 'Lock',
      trailingIcon: 'Visibility',
    });
    expect(boxOf(light, 'contêiner')?.height).toBe(56);
    expect(color(named(light.root, 'fundo'))).toBe('#E6E0E9');
    expect(color(named(dark.root, 'fundo'))).toBe('#36343B');
    const indicador = named(light.root, 'indicador');
    expect(indicador?.stroke?.sides).toEqual(['bottom']);
    expect(indicador?.stroke?.width).toBe(1);
    expect(strokeColor(indicador)).toBe('#49454F');
    expect(strokeColor(named(dark.root, 'indicador'))).toBe('#CAC4D0');
    expect(textColor(texts(light, 'rótulo'))).toBe('#49454F');
    expect(fontOf(texts(light, 'rótulo'))).toEqual(BODY_SMALL);
    expect(texts(light, 'valor')?.text).toBe('••••••••');
    expect(textColor(texts(light, 'valor'))).toBe('#1D1B20');
    expect(textColor(texts(dark, 'valor'))).toBe('#E6E0E9');
    expect(fontOf(texts(light, 'valor'))).toEqual(BODY_LARGE);
    // single line: does not wrap and gets no ellipsis
    expect(texts(light, 'valor')?.style.wrap).toBe('none');
    expect(texts(light, 'valor')?.style.maxLines).toBe(1);
    expect(iconOf(light, 'lock').color).toBe('#49454F');
    expect(iconOf(dark, 'visibility').color).toBe('#CAC4D0');
    expect(iconOf(light, 'lock').node?.width).toBe(24);
    // with no typed text, the label stays expanded in body-large and there is no value
    const empty = draw('secure-text-field', { label: 'Password' });
    expect(fontOf(texts(empty, 'rótulo'))).toEqual(BODY_LARGE);
    expect(texts(empty, 'valor')).toBeUndefined();
  });

  it('error and disabled follow the text-field', () => {
    const base = {
      label: 'Password',
      hasText: 'true',
      supportingText: 'Incorrect',
      trailingIcon: 'Visibility',
    };
    const errored = both('secure-text-field', { ...base, isError: 'true' });
    expect(strokeColor(named(errored.light.root, 'indicador'))).toBe('#B3261E');
    expect(strokeColor(named(errored.dark.root, 'indicador'))).toBe('#F2B8B5');
    expect(textColor(texts(errored.light, 'apoio'))).toBe('#B3261E');
    expect(iconOf(errored.light, 'visibility').color).toBe('#B3261E');
    expect(textColor(texts(errored.light, 'valor'))).toBe('#1D1B20');
    const off = draw('secure-text-field', { ...base, enabled: 'false' }, 'dark');
    expect(named(off.root, 'indicador')?.opacity).toBe(0.38);
    expect(strokeColor(named(off.root, 'indicador'))).toBe('#E6E0E9');
    for (const name of ['rótulo', 'valor', 'apoio']) {
      expect(texts(off, name)?.opacity).toBe(0.38);
      expect(textColor(texts(off, name))).toBe('#E6E0E9');
    }
    expect(iconOf(off, 'visibility').node?.opacity).toBe(0.38);
  });

  it('outlined: 1 outline by token with radius 4, gap in the label and disabled at 0.12', () => {
    const d = draw('secure-text-field', {
      label: 'Password',
      hasText: 'true',
      style: 'outlined',
    });
    // a single outline, with the gap (stroke.gap) over the minimized label
    const outline = named(d.root, 'contorno');
    expect(outline?.stroke?.sides).toBeUndefined();
    expect(outline?.stroke?.gaps).toHaveLength(1);
    expect(outline?.stroke?.gaps?.[0]?.side).toBe('top');
    expect(strokeColor(outline)).toBe('#79747E');
    expect(named(d.root, 'contorno (lados)')).toBeUndefined();
    expect(named(d.root, 'trecho inicial')).toBeUndefined();
    expect(named(d.root, 'trecho final')).toBeUndefined();
    expect(texts(d, 'rótulo minimizado')).toBeDefined();
    const empty = both(
      'secure-text-field',
      { label: 'Password', style: 'outlined', supportingText: 'Help' },
      { width: 280, height: 84 },
    );
    const contorno = named(empty.light.root, 'contorno');
    expect(contorno?.height).toBe(56);
    expect(contorno?.type === 'rect' && contorno.cornerRadius).toBe(4);
    expect(strokeColor(contorno)).toBe('#79747E');
    expect(strokeColor(named(empty.dark.root, 'contorno'))).toBe('#938F99');
    const off = draw('secure-text-field', {
      label: 'Password',
      style: 'outlined',
      enabled: 'false',
    });
    expect(named(off.root, 'contorno')?.opacity).toBe(0.12);
    const errored = draw('secure-text-field', {
      label: 'Password',
      style: 'outlined',
      isError: 'true',
    });
    expect(strokeColor(named(errored.root, 'contorno'))).toBe('#B3261E');
  });
});

describe('M3 group B — search-bar', () => {
  it('height 56, full shape, surface-container-high background and no shadow', () => {
    const { light, dark } = both('search-bar', {
      placeholder: 'Search',
      leadingIcon: 'Search',
    });
    expect(light.root.height).toBe(56);
    expect(light.root.width).toBe(360);
    // corner-full (9999) clamped to half the height by the engine
    expect(light.root.type === 'frame' && light.root.cornerRadius).toBeGreaterThanOrEqual(
      28,
    );
    expect(solid(light.root.fills)).toBe('#ECE6F0');
    expect(solid(dark.root.fills)).toBe('#2B2930');
    // SearchBarDefaults.ShadowElevation = Level0
    expect(light.root.effects).toEqual([]);
    expect(light.root.stroke).toBeUndefined();
  });

  it('icons by the icon node: leading onSurface, trailing onSurfaceVariant, 24, 16 from the edges', () => {
    const { light, dark } = both('search-bar', {
      query: 'jazz',
      leadingIcon: 'Search',
      trailingIcon: 'Close',
    });
    expect(iconOf(light, 'search').color).toBe('#1D1B20');
    expect(iconOf(dark, 'search').color).toBe('#E6E0E9');
    expect(iconOf(light, 'close').color).toBe('#49454F');
    expect(iconOf(dark, 'close').color).toBe('#CAC4D0');
    expect(iconOf(light, 'search').node?.width).toBe(24);
    const boxes = absoluteBoxes(light.root);
    const at = (name: string) => boxes.get(named(light.root, name)!.id)!;
    expect(at('search').x).toBe(16);
    expect(at('close').x).toBe(360 - 16 - 24);
    // text at 52 = 4 + 48 of the icon (SearchBarIconOffsetX 4 and area of 48)
    expect(at('consulta').x).toBe(52);
    expect(at('search').y).toBe(16);
  });

  it('query and hint in body-large: onSurface query on a single line, onSurfaceVariant hint', () => {
    const query = both('search-bar', { query: 'jazz', placeholder: 'Search' });
    expect(fontOf(texts(query.light, 'consulta'))).toEqual(BODY_LARGE);
    expect(textColor(texts(query.light, 'consulta'))).toBe('#1D1B20');
    expect(textColor(texts(query.dark, 'consulta'))).toBe('#E6E0E9');
    expect(texts(query.light, 'consulta')?.style.wrap).toBe('none');
    expect(texts(query.light, 'consulta')?.style.maxLines).toBe(1);
    expect(texts(query.light, 'dica')).toBeUndefined();
    const hint = both('search-bar', { placeholder: 'Search' });
    expect(fontOf(texts(hint.light, 'dica'))).toEqual(BODY_LARGE);
    expect(textColor(texts(hint.light, 'dica'))).toBe('#49454F');
    expect(textColor(texts(hint.dark, 'dica'))).toBe('#CAC4D0');
    expect(texts(hint.light, 'consulta')).toBeUndefined();
    for (const node of walk(hint.light.root))
      if (node.type === 'text') expect(node.style.fontFamily).toBe('Roboto, sans-serif');
  });

  it('expanded: docked gets radius 28 and the divider right below the 56; bar becomes full screen with 8 of breathing room', () => {
    const docked = draw(
      'search-bar',
      { query: 'jaz', expanded: 'true', style: 'docked' },
      'light',
      { width: 360, height: 240 },
    );
    expect(docked.root.type === 'frame' && docked.root.cornerRadius).toBe(28);
    const divisor = named(docked.root, 'divisor');
    expect(named(docked.root, 'divisor (bar)')).toBeUndefined();
    expect(divisor?.height).toBe(1);
    expect(color(divisor)).toBe('#79747E');
    expect(absoluteBoxes(docked.root).get(divisor!.id)!.y).toBe(56);
    expect(
      color(
        named(
          draw('search-bar', { expanded: 'true', style: 'docked' }, 'dark', {
            width: 360,
            height: 240,
          }).root,
          'divisor',
        ),
      ),
    ).toBe('#938F99');
    // expanded bar: CornerNone, field 8 from the top (SearchBarVerticalPadding), divider at 8 + 56 + 8
    const bar = draw(
      'search-bar',
      { query: 'jaz', expanded: 'true', style: 'bar' },
      'light',
      {
        width: 360,
        height: 240,
      },
    );
    expect(bar.root.type === 'frame' && bar.root.cornerRadius).toBe(0);
    const boxes = absoluteBoxes(bar.root);
    expect(boxes.get(named(bar.root, 'linha')!.id)!.y).toBe(8);
    expect(boxes.get(named(bar.root, 'divisor (bar)')!.id)!.y).toBe(72);
    expect(named(bar.root, 'divisor')).toBeUndefined();
    // collapsed has no divider
    const closed = draw('search-bar', { placeholder: 'Search' });
    expect(named(closed.root, 'divisor')).toBeUndefined();
  });

  it('the field has a minimum height of 56 (InputFieldHeight), even in a shorter box', () => {
    const d = draw('search-bar', { placeholder: 'Search' }, 'light', {
      width: 360,
      height: 40,
    });
    expect(boxOf(d, 'linha')?.height).toBe(56);
  });
});

describe('M3 group B — icons and combinations', () => {
  const rawNodes = (id: string) => {
    const raw = JSON.parse(text(`components/${id}.json`)) as { template: unknown };
    const out: { name: { $switch?: string; cases?: Record<string, string> } | string }[] =
      [];
    const visit = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const rec = node as { type?: string; children?: unknown[] };
      if (rec.type === 'icon') out.push(rec as (typeof out)[number]);
      rec.children?.forEach(visit);
    };
    visit(raw.template);
    return out;
  };
  const snake = (name: string): string =>
    name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();

  it.each(['text-field', 'secure-text-field', 'search-bar'])(
    '%s: the $switch of the icon node covers every suggestion, with no SVG path',
    (id) => {
      const nodes = rawNodes(id);
      expect(nodes.length).toBe(2);
      const spec = JSON.parse(text(SPEC_FILE)) as {
        layers: {
          annotationTypes: {
            id: string;
            fields: { key: string; suggestions?: string[] }[];
          }[];
        }[];
      };
      const type = spec.layers
        .flatMap((l) => l.annotationTypes)
        .find((t) => t.id === id)!;
      for (const field of type.fields.filter((f) => f.suggestions !== undefined)) {
        const node = nodes.find(
          (n) => typeof n.name !== 'string' && n.name.$switch === field.key,
        );
        expect(node, field.key).toBeDefined();
        const cases = typeof node!.name === 'string' ? {} : (node!.name.cases ?? {});
        for (const name of field.suggestions ?? [])
          expect(cases[name], name).toBe(snake(name));
      }
    },
  );

  it('all combinations of style, state and icons draw without warnings in light and dark', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const style of ['filled', 'outlined']) {
        for (const enabled of ['true', 'false']) {
          for (const isError of ['true', 'false']) {
            for (const icons of [
              {},
              { leadingIcon: 'Email' },
              { trailingIcon: 'Lock' },
              { leadingIcon: 'Email', trailingIcon: 'Lock' },
            ]) {
              for (const extra of [
                { value: 'Maria', hasText: 'true' },
                { placeholder: 'Hint', supportingText: 'Help' },
                {},
              ]) {
                const values = {
                  label: 'Field',
                  style,
                  enabled,
                  isError,
                  ...icons,
                  ...extra,
                };
                for (const id of ['text-field', 'secure-text-field']) {
                  const d = draw(id, values, mode, { width: 280, height: 100 });
                  expect(d.warnings, `${id} ${JSON.stringify(values)}`).toEqual([]);
                }
              }
            }
          }
        }
      }
      for (const style of ['bar', 'docked']) {
        for (const expanded of ['true', 'false']) {
          const values = {
            query: 'jazz',
            placeholder: 'Search',
            leadingIcon: 'Search',
            trailingIcon: 'Close',
            style,
            expanded,
          };
          const d = draw('search-bar', values, mode, { width: 360, height: 200 });
          expect(d.warnings, JSON.stringify(values)).toEqual([]);
        }
      }
    }
  });
});
