// ME2 (#913, stage #869): the sizes of the five types are the Compose ones (decision 9) and the tallest example of each
// ends inside the `size`; the limit examples (decision 11) draw without warnings in both modes.
// Reference (pinned commit 5113b82a…, androidx/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3):
//  - top-app-bar: tokens/AppBarLargeTokens.kt `ContainerHeight` 152 (medium 112, small 64);
//  - date-picker: DatePicker.kt `RecommendedSizeForAccessibility` 48 × `MaxCalendarRows` 6 (lines 2293 and 2303) → 512;
//  - time-picker: TimePicker.kt `ClockFaceBottomMargin` 24 (2069) + TimePickerDialog.kt (actions 48, `portActionsBottomPadding` 24) → 456 + 24 + 48;
//  - alert-dialog: 48 buttons (`minimumInteractiveComponentSize`, Surface.kt 219) → 240 + 8;
//  - slider: Slider.kt `minimumInteractiveComponentSize` 48 (the `SliderTokens` HandleHeight is 44).
// pt-BR kept: the example names ('Rótulo longo', '24 horas, campos', 'Intervalo até o fim do mês') and the doc heading
// '## Fidelidade' are the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { multiply, IDENTITY } from '../../src/model/components/scene';
import { resolveSizing } from '../../src/model/components/sizing';
import type { Matrix, SceneNode } from '../../src/model/components/scene';
import { COMPOSE_SIZES, drawIn, files, text } from '../support/material3Library';

/** The largest `y` (px, in the root space) that any visible node occupies, by each node's box. */
function bottomOf(node: SceneNode, parent: Matrix = IDENTITY, isRoot = true): number {
  if (!isRoot && !node.visible) return 0;
  const m = isRoot ? IDENTITY : multiply(parent, node.transform);
  let bottom = !isRoot ? m[5] + m[3] * node.height : 0;
  if ('children' in node) {
    for (const child of node.children)
      bottom = Math.max(bottom, bottomOf(child, m, false));
  }
  return bottom;
}

/**
 * The `sizing` height of each type (the `size` comes from `COMPOSE_SIZES`, the single source of the library tests).
 * `by style`: expression by the `style` (MC5, decision 20: top-app-bar 64, 112 and 152), checked in px below.
 */
const SIZING_HEIGHT: Record<string, number | 'hug' | 'by style'> = {
  'top-app-bar': 'by style',
  'date-picker': 'hug',
  'time-picker': 'hug',
  'alert-dialog': 'hug',
  slider: 48,
};

const catalog = buildCatalog(files);

describe.each(Object.keys(SIZING_HEIGHT))('%s: Compose size', (id) => {
  const entry = findEntry(catalog, id)!;
  const size = COMPOSE_SIZES[id]!;

  it('the size and the sizing are the Compose ones', () => {
    expect(entry.component!.size).toEqual(size);
    const expected = SIZING_HEIGHT[id];
    if (expected === 'by style') {
      // MC5: the px comes from the expression evaluated by `style` (AppBar{Small,Medium,Large}Tokens `ContainerHeight`)
      const heights = Object.fromEntries(
        ['small', 'center', 'medium', 'large'].map((style) => [
          style,
          resolveSizing(entry.component!, { style }).height.spec,
        ]),
      );
      expect(heights).toEqual({ small: 64, center: 64, medium: 112, large: 152 });
    } else expect(entry.component!.sizing?.height).toBe(expected);
  });

  it.each(['light', 'dark'] as const)(
    'all examples end inside the height (%s)',
    (mode) => {
      expect(entry.examples.length).toBeGreaterThan(0);
      for (const example of entry.examples) {
        const drawing = drawIn(catalog, entry, example.values ?? {}, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        expect(
          bottomOf(drawing.root),
          `${example.name}: content bottom (size ${size.height})`,
        ).toBeLessThanOrEqual(size.height);
      }
    },
  );
});

describe('limit examples (decision 11)', () => {
  const LIMITS: { id: string; name: string; issue: string }[] = [
    { id: 'button', name: 'Rótulo longo', issue: '#898' },
    { id: 'time-picker', name: '24 horas, campos', issue: '#898' },
    { id: 'date-picker', name: 'Intervalo até o fim do mês', issue: '#897' },
  ];

  it.each(LIMITS)(
    '$id: "$name" exists, draws without warnings and the Fidelity section cites $issue',
    ({ id, name, issue }) => {
      const entry = findEntry(catalog, id)!;
      const example = entry.examples.find((e) => e.name === name);
      expect(example, `example ${name}`).toBeDefined();
      for (const mode of ['light', 'dark'] as const) {
        const drawing = drawIn(catalog, entry, example!.values ?? {}, mode);
        expect(drawing.warnings, `${name} (${mode})`).toEqual([]);
      }
      const doc = text(`docs/${id}.md`);
      const fidelity = doc.slice(doc.indexOf('## Fidelidade'));
      expect(fidelity).toContain(issue);
      expect(doc.slice(0, doc.indexOf('## Fidelidade'))).toContain(name);
    },
  );
});
