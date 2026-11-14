// MC6 (#1034, stage #898): the Material 3 (Compose) library breaks into lines where Compose breaks and measures by the
// content where Compose measures (decisions 21 and 22): the `flow-row` with `wrap`, `lineGap` (`verticalSpacing`),
// `maxPerLine` (`maxItemsInEachRow`) and `maxLines`; the `alert-dialog` buttons with `wrap-reverse` (the
// `AlertDialogFlowRow`: the confirm button goes above when it does not fit) and the `dropdown-menu` width by the widest
// item (`IntrinsicSize.Max`), between 112 and 280. The tests were seen failing before the library changed.
// pt-BR kept: node names ('dispensar', 'confirmar', 'botões', 'área de toque (…)'), the example names 'Botões em duas linhas' and
// 'Itens de larguras diferentes' and the doc phrase 'sem quebra de linha' are the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  loadSpecComponents,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { emptyProject } from './fixtures';
import { SPEC_FILE, files, spec, text } from '../support/material3Library';
import { drawFitted, fittedSize, templateNodes } from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

const MODES: Mode[] = ['light', 'dark'];
/** How the fit rounds: up, without letting floating-point noise add a px. */
const ceilFit = (value: number): number => Math.ceil(value - 1e-6);
type Drawing = ReturnType<typeof drawFitted>['drawing'];

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const boxOf = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return absoluteBoxes(d.root).get(node.id)!;
};

describe('MC6 flow-row — Arrange breaks the children into lines (FlowLayout.kt)', () => {
  const catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(spec, SPEC_FILE, spec.version, (path) => {
        const body = text(path);
        return body === '' ? undefined : body;
      }),
    ],
  ]);
  const rect = (x: number, y: number, width: number, height: number): Rect => ({
    x,
    y,
    width,
    height,
  });

  /** The container with a flow-row `F` (360 wide) and five misaligned 100 × 40 `image`s inside it. */
  function crowd(values: Record<string, number | string> = {}): Project {
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `LM${++n}`;
      })(),
      packageSpecName: 'material3-compose.spec.json',
    });
    p = addContainer(p, {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    });
    const args = { containerId: 'I1', specId: spec.id } as const;
    p = addComponentMarking(
      p,
      catalog,
      {
        ...args,
        markingId: 'F',
        annotationId: 'A_F',
        parentId: null,
        typeId: 'flow-row',
        rect: rect(100, 100, 360, 300),
        values: { spacing: 8, verticalSpacing: 12, ...values },
      },
      approximateMeasurer,
    );
    for (let i = 1; i <= 5; i++) {
      p = addComponentMarking(
        p,
        catalog,
        {
          ...args,
          markingId: `K${i}`,
          annotationId: `A_K${i}`,
          parentId: 'F',
          typeId: 'image',
          rect: rect(100 + (i - 1) * 10, 100 + (i - 1) * 10, 100, 40),
        },
        approximateMeasurer,
      );
    }
    return p;
  }
  const arranged = (values?: Record<string, number | string>) =>
    arrangeMarking(crowd(values), catalog, 'F', approximateMeasurer);
  const at = (p: Project, id: string): Rect => p.markings.find((m) => m.id === id)!.rect;

  it('five 100-wide children in a width of 360 give 3 + 2 lines, with the spacing and the verticalSpacing', () => {
    const { project, warnings } = arranged();
    expect([1, 2, 3].map((i) => at(project, `K${i}`))).toEqual([
      rect(100, 100, 100, 40),
      rect(208, 100, 100, 40),
      rect(316, 100, 100, 40),
    ]);
    expect([4, 5].map((i) => at(project, `K${i}`))).toEqual([
      rect(100, 152, 100, 40),
      rect(208, 152, 100, 40),
    ]);
    expect(warnings).toEqual([]);
  });

  it('the verticalSpacing is the space between the lines', () => {
    const { project } = arranged({ verticalSpacing: 30 });
    expect(at(project, 'K4').y).toBe(100 + 40 + 30);
    expect(at(project, 'K1').y).toBe(100);
  });

  it('maxItemsInEachRow 2 gives 2 + 2 + 1', () => {
    const { project } = arranged({ maxItemsInEachRow: 2 });
    expect([1, 2, 3, 4, 5].map((i) => at(project, `K${i}`).y)).toEqual([
      100, 100, 152, 152, 204,
    ]);
    expect([1, 2, 3, 4, 5].map((i) => at(project, `K${i}`).x)).toEqual([
      100, 208, 100, 208, 100,
    ]);
  });

  it('maxLines 2 leaves the fifth child, beyond the last line, where it was', () => {
    const { project } = arranged({ maxItemsInEachRow: 2, maxLines: 2 });
    expect([1, 2, 3, 4].map((i) => at(project, `K${i}`).y)).toEqual([100, 100, 152, 152]);
    expect(at(project, 'K5')).toEqual(rect(140, 140, 100, 40));
  });

  it('the flow-row is hug in height and grows with the lines (40 + 12 + 40)', () => {
    const { project } = arranged();
    expect(at(project, 'F').height).toBe(92);
    expect(at(project, 'F').width).toBe(360);
  });

  it('step R17.34: five 56 fabs in a 200 × 100 flow-row give 3 + 2 and the height 124', () => {
    // the same piece as the script: the 200 × 100 fr with five misaligned fabs inside it
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `LF${++n}`;
      })(),
      packageSpecName: 'material3-compose.spec.json',
    });
    p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 400, height: 700 });
    const args = { containerId: 'I1', specId: spec.id, parentId: null } as const;
    p = addComponentMarking(
      p,
      catalog,
      {
        ...args,
        markingId: 'F',
        annotationId: 'A_F',
        typeId: 'flow-row',
        rect: rect(10, 540, 200, 100),
        values: { spacing: 8, verticalSpacing: 12 },
      },
      approximateMeasurer,
    );
    for (let n = 1; n <= 5; n++)
      p = addComponentMarking(
        p,
        catalog,
        {
          ...args,
          parentId: 'F',
          markingId: `K${n}`,
          annotationId: `A_K${n}`,
          typeId: 'fab',
          rect: rect(12 + 10 * (n - 1), 542 + 10 * (n - 1), 56, 56),
        },
        approximateMeasurer,
      );
    expect(p.markings.filter((m) => m.parentId === 'F')).toHaveLength(5);
    const { project } = arrangeMarking(p, catalog, 'F', approximateMeasurer);
    expect(
      [1, 2, 3, 4, 5].map((i) => [at(project, `K${i}`).x, at(project, `K${i}`).y]),
    ).toEqual([
      [10, 540],
      [74, 540],
      [138, 540],
      [10, 608],
      [74, 608],
    ]);
    expect(at(project, 'F')).toEqual(rect(10, 540, 200, 124));
  });

  it('the Fidelity section no longer says the slot is a row without wrapping', () => {
    const doc = text('docs/flow-row.md');
    expect(doc).not.toMatch(/sem quebra de linha/);
    expect(doc).toMatch(/`wrap`/);
  });
});

describe('MC6 alert-dialog — the buttons break like the AlertDialogFlowRow (AlertDialog.kt)', () => {
  const base = {
    style: 'standard',
    title: 'Discard draft?',
    text: 'The draft will be deleted and cannot be recovered.',
    icon: '',
  };
  const LONG = {
    ...base,
    confirmButton: 'Discard the draft now',
    dismissButton: 'Cancel',
  };

  it.each(MODES)(
    'with long labels the confirm button goes to the top line, on the right, without warnings (%s)',
    (mode) => {
      const { drawing } = drawFitted('alert-dialog', LONG, mode);
      expect(drawing.warnings).toEqual([]);
      const dismiss = boxOf(drawing, 'dispensar');
      const confirm = boxOf(drawing, 'confirmar');
      const row = boxOf(drawing, 'botões');
      // each button (40) is centered in its 48 `área de toque` frame; between the lines, 12
      expect(dismiss.y - confirm.y).toBe(48 + 12);
      expect(confirm.y).toBe(row.y + 4);
      expect(confirm.x + confirm.width).toBeCloseTo(row.x + row.width, 5);
      expect(dismiss.x + dismiss.width).toBeCloseTo(row.x + row.width, 5);
      expect(row.height).toBe(48 + 12 + 48);
    },
  );

  it('the dialog with long labels has the height of the two button lines', () => {
    const short = fittedSize('alert-dialog', {
      ...base,
      confirmButton: 'Discard',
      dismissButton: 'Cancel',
    });
    const long = fittedSize('alert-dialog', LONG);
    expect(long.height - short.height).toBe(48 + 12 + 48 - 48);
    expect(long.messages.map((m) => m.text)).toEqual([]);
  });

  it('each button has the "área de toque" frame with its own name, at least 48', () => {
    for (const name of ['dispensar', 'confirmar']) {
      const wrapper = templateNodes('alert-dialog', `área de toque (${name})`);
      expect(wrapper, name).toHaveLength(1);
      expect([wrapper[0]?.height, wrapper[0]?.minHeight]).toEqual(['hug', 48]);
    }
  });

  it('with short labels the buttons stay on the same line, cancel before confirm', () => {
    const { drawing } = drawFitted('alert-dialog', {
      ...base,
      confirmButton: 'Discard',
      dismissButton: 'Cancel',
    });
    const dismiss = boxOf(drawing, 'dispensar');
    const confirm = boxOf(drawing, 'confirmar');
    expect(confirm.y).toBe(dismiss.y);
    expect(dismiss.x + dismiss.width + 8).toBeCloseTo(confirm.x, 5);
  });

  it('the "Botões em duas linhas" example exists and draws without warnings', () => {
    const catalog = buildCatalog(files);
    const example = findEntry(catalog, 'alert-dialog')?.examples.find(
      (e) => e.name === 'Botões em duas linhas',
    );
    expect(example).toBeDefined();
    for (const mode of MODES) {
      const { drawing } = drawFitted('alert-dialog', example!.values ?? {}, mode);
      expect(drawing.warnings).toEqual([]);
      expect(boxOf(drawing, 'confirmar').y).toBeLessThan(boxOf(drawing, 'dispensar').y);
    }
  });
});

describe('MC6 dropdown-menu — the width by the widest item, between 112 and 280 (Menu.kt, IntrinsicSize.Max)', () => {
  const item = (label: string, extra: Record<string, string> = {}) => ({
    text: label,
    leadingIcon: '',
    trailingIcon: '',
    enabled: 'true',
    selected: 'false',
    ...extra,
  });
  const menu = (items: ReturnType<typeof item>[], extra: Values = {}): Values =>
    ({ style: 'menu', expanded: 'true', items, ...extra }) as unknown as Values;
  /** The width of an item text in the approximate measurer (label-large 14/20, weight 500, 0.1 tracking). */
  const textWidth = (label: string): number =>
    approximateMeasurer(
      label,
      {
        family: 'sans',
        size: 14,
        weight: 500,
        italic: false,
        lineHeight: 20,
        letterSpacing: 0.1,
      },
      undefined,
    ).width;

  it('sizing.width is hug in the menu and fill in the exposed field', () => {
    const entry = findEntry(buildCatalog(files), 'dropdown-menu')!;
    const sizing = entry.component!.sizing as { width: unknown };
    expect(sizing.width).toMatchObject({
      $if: { $eq: ['style', 'exposed'] },
      then: 'fill',
      else: 'hug',
    });
  });

  it('the width is that of the widest item plus the 12 on each side and the icon on the left', () => {
    const items = [
      item('Edit', { leadingIcon: 'Edit' }),
      item('Share with the team', { leadingIcon: 'Share' }),
    ];
    const fit = fittedSize('dropdown-menu', menu(items));
    expect(fit.width).toBe(ceilFit(textWidth('Share with the team') + 12 + 24 + 12 + 12));
    expect(fit.width).toBeGreaterThan(112);
    expect(fit.width).toBeLessThan(280);
  });

  it('the width of the icon on the right also counts (24 and 12 of spacing)', () => {
    const items = [item('Save', { trailingIcon: 'Check' })];
    const fit = fittedSize('dropdown-menu', menu(items));
    // 12 + text + 12 + 24 + 12 = 60 + the text, but never less than 112
    expect(fit.width).toBe(Math.max(112, ceilFit(textWidth('Save') + 12 + 12 + 24 + 12)));
  });

  it('never falls below 112 nor exceeds 280', () => {
    expect(fittedSize('dropdown-menu', menu([item('Ok')])).width).toBe(112);
    const long = fittedSize(
      'dropdown-menu',
      menu([
        item(
          'An item with a text much longer than what fits in two hundred and eighty pixels',
          { leadingIcon: 'Edit' },
        ),
        item('Delete'),
      ]),
    );
    expect(long.width).toBeLessThanOrEqual(280);
    expect(long.width).toBeGreaterThan(200);
  });

  it.each(MODES)(
    'at the fitted size all items have the menu width and the long text grows in height, without warnings (%s)',
    (mode) => {
      const values = menu([
        item('Edit', { leadingIcon: 'Edit' }),
        item(
          'An item with a text much longer than what fits in two hundred and eighty pixels',
          { trailingIcon: 'Check' },
        ),
      ]);
      const { drawing, box } = drawFitted('dropdown-menu', values, mode);
      expect(drawing.warnings).toEqual([]);
      const menuBox = boxOf(drawing, 'menu');
      expect(menuBox.width).toBe(box.width);
      const items = [...walk(drawing.root)].filter((n) => n.name === 'item' && n.visible);
      expect(items).toHaveLength(2);
      for (const node of items)
        expect(absoluteBoxes(drawing.root).get(node.id)!.width).toBe(box.width);
      expect(absoluteBoxes(drawing.root).get(items[1]!.id)!.height).toBeGreaterThan(48);
    },
  );

  it('the exposed field keeps the marking width (fill), without fitting the width', () => {
    const fit = fittedSize('dropdown-menu', {
      style: 'exposed',
      expanded: 'true',
      label: 'Country',
      value: 'Brazil',
      items: [
        item('An item text that, on its own, would exceed the 200 width of the field'),
      ],
    } as unknown as Values);
    expect(fit.width).toBe(200);
  });

  it('the "Itens de larguras diferentes" example exists and draws without warnings, at the size and fitted', () => {
    const catalog = buildCatalog(files);
    const example = findEntry(catalog, 'dropdown-menu')?.examples.find(
      (e) => e.name === 'Itens de larguras diferentes',
    );
    expect(example).toBeDefined();
    for (const mode of MODES) {
      expect(
        drawFitted('dropdown-menu', example!.values ?? {}, mode).drawing.warnings,
      ).toEqual([]);
    }
  });
});
