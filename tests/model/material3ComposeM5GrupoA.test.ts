// M5 of the "faithful Material 3" stage, group A: alert-dialog, bottom-sheet and snackbar against what
// `AlertDialog.kt`, `ModalBottomSheet.kt`, `BottomSheetScaffold.kt`, `SheetDefaults.kt`, `Snackbar.kt` and the
// token files (`DialogTokens`, `SheetBottomTokens`, `SnackbarTokens`, `ElevationTokens`) fix at
// commit 5113b82a. The expected colors come from the specialization tokens (light and dark); the geometry, from the
// Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type {
  PathNode,
  SceneNode,
  Shadow,
  TextNode,
} from '../../src/model/components/scene';
import { files, solid, spec } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  dialog: 'diálogo',
  icon: 'ícone',
  title: 'título',
  text: 'texto',
  confirm: 'confirmar',
  dismiss: 'dispensar',
  buttons: 'botões',
  handleArea: 'área da alça',
  handle: 'alça',
  header: 'cabeçalho',
  message: 'mensagem',
  action: 'ação',
  close: 'fechar',
  multilineMessage: 'mensagem em várias linhas',
  messageActionNewLine: 'mensagem com ação em nova linha',
} as const;

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Record<string, unknown>;
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof instantiate>;
const MODES: Mode[] = ['light', 'dark'];

const optionsOf = (mode: Mode) => {
  const library = catalog.library!;
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
};
const valuesOf = (id: string, values: Values) =>
  ({ ...defaultValues(entryOf(id).type), ...values }) as Parameters<
    typeof instantiate
  >[1];

/** Draws in a box that is not the `size` one (the marking has the rectangle the person drew). */
function drawBox(
  id: string,
  values: Values,
  width: number,
  height: number,
  mode: Mode = 'light',
): Drawing {
  return instantiate(
    entryOf(id).component!,
    valuesOf(id, values),
    { x: 0, y: 0, width, height },
    optionsOf(mode),
  );
}
/** Height the component hugs (`hug`) at the given width. */
const hugHeight = (id: string, values: Values, width: number): number =>
  measureComponent(
    entryOf(id).component!,
    valuesOf(id, values),
    { width, height: null },
    optionsOf('light'),
  ).height;
/** Width the component hugs with a free height (no rectangle). */
const hugWidth = (id: string, values: Values): number =>
  measureComponent(
    entryOf(id).component!,
    valuesOf(id, values),
    { width: null, height: null },
    optionsOf('light'),
  ).width;
/** Draws at the height the component hugs. */
const drawHug = (id: string, values: Values, width: number, mode: Mode = 'light') =>
  drawBox(id, values, width, hugHeight(id, values, width), mode);

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;
/** Checks the two shadows of the elevation level (point and ambient): y, blur, spread and color of the tokens. */
const expectElevation = (
  effects: readonly Shadow[],
  level: number,
  mode: Mode,
  where = '',
): void => {
  expect(effects, where).toHaveLength(2);
  for (const [i, kind] of (['point', 'ambient'] as const).entries()) {
    const shadow = effects[i];
    expect(shadow?.offset.y, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-y`),
    );
    expect(shadow?.blur, `${where} ${kind}`).toBe(num(`elevation-${level}-${kind}-blur`));
    expect(shadow?.spread ?? 0, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-spread`),
    );
    expect(shadow?.color, `${where} ${kind}`).toBe(tok(`elevation-${kind}-shadow`, mode));
  }
};

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...absoluteBoxes(d.root).get(node.id)! };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
/** The icon drawn inside the `name` node: the `PathNode`, its box and its color. */
const iconIn = (d: Drawing, name: string) => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  const path = [...walk(holder)].find((n): n is PathNode => n.type === 'path');
  if (path === undefined) return undefined;
  return { path, color: solid(path.fills), box: absoluteBoxes(d.root).get(path.id)! };
};
const textIn = (d: Drawing, name: string): TextNode | undefined => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  return [...walk(holder)].find((n): n is TextNode => n.type === 'text' && n.visible);
};
const fontOf = (node: TextNode | undefined) =>
  node === undefined
    ? undefined
    : [
        node.style.fontSize,
        node.style.lineHeight,
        node.style.fontWeight,
        node.style.letterSpacing,
      ];
const scale = (name: string): number[] => [
  num(`${name}-size`),
  num(`${name}-line-height`),
  num(`${name}-weight`),
  num(`${name}-tracking`),
];
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const radiusOf = (node: SceneNode) =>
  'cornerRadius' in node ? node.cornerRadius : undefined;
// pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
const BAD_WARNING = /unknown icon|não cabe|text larger than the box|stretched icon/;

describe('M5 group A — alert-dialog', () => {
  const WIDTH = 312;
  const full: Values = {
    icon: 'Delete',
    title: 'Discard draft?',
    text: 'Your data is saved.',
    confirmButton: 'Discard',
    dismissButton: 'Cancel',
  };
  const dialog = (extra: Values = {}, mode: Mode = 'light') =>
    drawHug('alert-dialog', { ...full, ...extra }, WIDTH, mode);

  it('container in surface-container-high with the extra-large shape (28), no shadow and with 24 margin', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      expect(fillOf(d, NAMES.dialog)).toBe(tok('surface-container-high', mode));
      expect(radiusOf(d.root)).toBe(num('corner-extra-large'));
      expect(num('corner-extra-large')).toBe(28);
      // AlertDialogDefaults.TonalElevation is 0 and the Surface has no shadowElevation
      expect(d.root.effects).toEqual([]);
      expect(d.root.width).toBe(WIDTH);
      const icon = box(d, NAMES.icon);
      expect([icon.x, icon.y]).toEqual([24, 24]);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('height hugs the content: 24 + icon 24 + 16 + title 32 + 16 + text 20 + 24 + buttons 48 + 24', () => {
    expect(hugHeight('alert-dialog', full, WIDTH)).toBe(
      24 + (24 + 16) + (32 + 16) + (20 + 24) + 48 + 24,
    );
    // without icon, title and text only the margin and the buttons row remain
    expect(hugHeight('alert-dialog', { confirmButton: 'OK' }, WIDTH)).toBe(24 + 48 + 24);
  });

  it('24 icon centered, in secondary (DialogTokens.IconColor), with 16 to the title', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const icon = iconIn(d, NAMES.icon)!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect(icon.box.x).toBe((WIDTH - 24) / 2);
      expect(icon.color).toBe(tok('secondary', mode));
      expect(box(d, NAMES.title).y).toBe(24 + 24 + 16);
    }
  });

  it('title in headline-small (24/32/400/0) on-surface, centered with an icon and left-aligned without it', () => {
    for (const mode of MODES) {
      const withIcon = dialog({}, mode);
      const title = textIn(withIcon, NAMES.title)!;
      expect(fontOf(title)).toEqual(scale('headline-small'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(title.style.align).toBe('center');
      const bare = dialog({ icon: '' }, mode);
      expect(textIn(bare, NAMES.title)!.style.align).toBe('left');
      expect(named(bare, NAMES.icon)).toBeUndefined();
      expect(box(bare, NAMES.title).y).toBe(24);
      expect(absOf(bare, textIn(bare, NAMES.title)!).x).toBe(24);
    }
  });

  it('text in body-medium (14/20) on-surface-variant, 16 from the title', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const text = textIn(d, NAMES.text)!;
      expect(fontOf(text)).toEqual(scale('body-medium'));
      expect(solid(text.fills)).toBe(tok('on-surface-variant', mode));
      expect(box(d, NAMES.text).y).toBe(box(d, NAMES.title).y + 32 + 16);
      expect(text.style.align).not.toBe('center');
    }
  });

  it('text buttons on the right, label-large in primary, 8 between them and 24 from the bottom', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const confirm = box(d, NAMES.confirm);
      const dismiss = box(d, NAMES.dismiss);
      for (const [name, label] of [
        [NAMES.confirm, 'Discard'],
        [NAMES.dismiss, 'Cancel'],
      ] as const) {
        const text = textIn(d, name)!;
        expect(text.text).toBe(label);
        expect(fontOf(text)).toEqual(scale('label-large'));
        expect(solid(text.fills)).toBe(tok('primary', mode));
      }
      // the confirm touches the 24 margin; the dismiss comes before it, with 8 of gap
      expect(confirm.x + confirm.width).toBe(WIDTH - 24);
      expect(dismiss.x + dismiss.width + 8).toBe(confirm.x);
      // TextButton: 12 on each side and 40 high (ButtonDefaults.MinHeight)
      expect(absOf(d, textIn(d, NAMES.confirm)!).x - confirm.x).toBe(12);
      expect(confirm.height).toBe(40);
      // the row measures 48 (minimumInteractiveComponentSize, ME2 of the Material 3 with states stage); the button stays 40, centered
      expect(box(d, NAMES.buttons).height).toBe(48);
      expect(box(d, NAMES.buttons).y + 48 + 24).toBe(d.root.height);
    }
  });

  it('a short button measures at least 58 (ButtonDefaults.MinWidth) and without a dismiss there is only the confirm', () => {
    const d = dialog({ confirmButton: 'OK', dismissButton: '' });
    expect(box(d, NAMES.confirm).width).toBe(58);
    expect(named(d, NAMES.dismiss)).toBeUndefined();
    expect(box(d, NAMES.confirm).x + 58).toBe(WIDTH - 24);
  });

  it('width without a rectangle goes from 280 to 560 (DialogMinWidth and DialogMaxWidth)', () => {
    expect(hugWidth('alert-dialog', { confirmButton: 'OK' })).toBe(280);
    expect(
      hugWidth('alert-dialog', {
        title: 'x'.repeat(200),
        confirmButton: 'OK',
      }),
    ).toBe(560);
  });

  it('an icon outside the set falls back to the placeholder and warns; the examples draw clean', () => {
    const bad = dialog({ icon: 'Does-not-exist' });
    expect(bad.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
    const home = dialog({ icon: 'Home' });
    expect(home.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    expect(iconIn(home, NAMES.icon)!.path.d).not.toBe(
      iconIn(dialog({ icon: 'Delete' }), NAMES.icon)!.path.d,
    );
  });
});

describe('M5 group A — bottom-sheet', () => {
  const WIDTH = 412;
  const items = [
    { label: 'Favorites', icon: 'Favorite' },
    { label: 'Edit', icon: 'Edit' },
    { label: 'Settings', icon: 'Settings' },
  ];
  const sheet = (extra: Values = {}, mode: Mode = 'light') =>
    drawHug(
      'bottom-sheet',
      { title: 'Share', style: 'modal', dragHandle: 'true', items, ...extra },
      WIDTH,
      mode,
    );

  it('sheet in surface-container-low with 28 top corners (ExpandedShape) and square bottom ones', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      expect(fillOf(d, 'bottom sheet')).toBe(tok('surface-container-low', mode));
      const r = num('corner-extra-large');
      expect(radiusOf(d.root)).toEqual([r, r, 0, 0]);
      expect(num('corner-extra-large')).toBe(28);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('modal without a shadow (the tonalElevation of Level1 casts none); standard with the level 1 shadow', () => {
    for (const mode of MODES) {
      expect(sheet({ style: 'modal' }, mode).root.effects).toEqual([]);
      const standard = sheet({ style: 'standard' }, mode).root.effects;
      expectElevation(standard, 1, mode);
    }
  });

  it('32 × 4 handle (DockedDragHandleWidth/Height) in on-surface-variant, centered in a 48 area (22 + 4 + 22)', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const area = box(d, NAMES.handleArea);
      expect([area.x, area.y, area.width, area.height]).toEqual([0, 0, WIDTH, 48]);
      const handle = box(d, NAMES.handle);
      expect([handle.width, handle.height]).toEqual([32, 4]);
      expect([handle.x, handle.y]).toEqual([(WIDTH - 32) / 2, 22]);
      // solid color, without the earlier 0.4 opacity
      expect(fillOf(d, NAMES.handle)).toBe(tok('on-surface-variant', mode));
      expect(named(d, NAMES.handle)?.opacity).toBe(1);
      expect(radiusOf(handle.node)).toBe(num('corner-extra-large'));
    }
  });

  it('without a handle (dragHandle=false) the area disappears and the content moves up 48', () => {
    const withHandle = sheet({});
    const without = sheet({ dragHandle: 'false' });
    expect(named(without, NAMES.handleArea)).toBeUndefined();
    expect(box(withHandle, NAMES.header).y - box(without, NAMES.header).y).toBe(48);
  });

  it('title in title-large (22/28/400/0) on-surface, 16 from the edges', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const title = textIn(d, NAMES.header)!;
      expect(title.text).toBe('Share');
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(absOf(d, title).x).toBe(16);
    }
  });

  it('ListItem item: 56 high, surface container, 24 icon in on-surface-variant at 16 and text at 56 in body-large', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const item = box(d, 'item');
      expect(item.height).toBe(56);
      expect(item.width).toBe(WIDTH);
      expect(fillOf(d, 'item')).toBe(tok('surface', mode));
      const icon = iconIn(d, 'item')!;
      expect([icon.box.width, icon.box.height, icon.box.x - item.x]).toEqual([
        24, 24, 16,
      ]);
      expect(icon.box.y - item.y).toBe((56 - 24) / 2);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Favorites');
      expect(fontOf(label)).toEqual(scale('body-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      // ListItemStartPadding 16 + icon 24 + LeadingContentEndPadding 16
      expect(absOf(d, label).x - item.x).toBe(16 + 24 + 16);
    }
  });

  it('a long label stays on one line and ends in … (the item stays 56)', () => {
    const d = sheet({
      items: [{ label: 'A very long action label '.repeat(6), icon: 'Share' }],
    });
    const label = textIn(d, 'item')!;
    expect(label.style).toMatchObject({ maxLines: 1, ellipsis: true });
    expect(box(d, 'item').height).toBe(56);
  });

  it('height hugs: handle 48 + header (8 + 28 + 16) + 3 items of 56 + 16', () => {
    expect(
      hugHeight(
        'bottom-sheet',
        { title: 'Share', dragHandle: 'true', style: 'modal', items },
        WIDTH,
      ),
    ).toBe(48 + (8 + 28 + 16) + 3 * 56 + 16);
  });

  it('standard hugs at least the collapsed height (requiredHeightIn(min = peekHeight)) and the width reaches 640', () => {
    const size = { width: WIDTH, height: null };
    const high = (peek: number) =>
      measureComponent(
        entryOf('bottom-sheet').component!,
        valuesOf('bottom-sheet', {
          style: 'standard',
          sheetPeekHeight: peek,
          dragHandle: 'true',
        }),
        size,
        optionsOf('light'),
      ).height;
    expect(high(300)).toBe(300);
    expect(high(56)).toBeGreaterThanOrEqual(56);
    const modal = measureComponent(
      entryOf('bottom-sheet').component!,
      valuesOf('bottom-sheet', {
        style: 'modal',
        sheetPeekHeight: 300,
        dragHandle: 'true',
      }),
      size,
      optionsOf('light'),
    );
    expect(modal.height).toBeLessThan(300);
    expect(hugWidth('bottom-sheet', { title: 'x'.repeat(300) })).toBe(640);
  });

  it('an item icon outside the set warns; an item without an icon starts at 16', () => {
    const bad = sheet({ items: [{ label: 'X', icon: 'Does-not-exist' }] });
    expect(bad.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
    const none = sheet({ items: [{ label: 'X', icon: '' }] });
    expect(iconIn(none, 'item')).toBeUndefined();
    expect(absOf(none, textIn(none, 'item')!).x).toBe(16);
  });
});

describe('M5 group A — snackbar', () => {
  const WIDTH = 344;
  const ACTION = { message: 'Message archived', actionLabel: 'Undo' };
  const snack = (values: Values, mode: Mode = 'light') =>
    drawHug('snackbar', values, WIDTH, mode);

  it('inverse-surface container with the extra-small shape (4) and the level 3 shadow, in light and dark', () => {
    for (const mode of MODES) {
      const d = snack({ message: 'File saved' }, mode);
      expect(fillOf(d, 'snackbar')).toBe(tok('inverse-surface', mode));
      expect(radiusOf(d.root)).toBe(num('corner-extra-small'));
      expect(num('corner-extra-small')).toBe(4);
      expectElevation(d.root.effects, 3, mode);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
    // the dark background is light (inverse-surface dark↔light)
    expect(tok('inverse-surface', 'dark')).not.toBe(tok('inverse-surface', 'light'));
  });

  it('one line measures 48 (SingleLineContainerHeight), message in body-medium inverse-on-surface at 16 and centered', () => {
    for (const mode of MODES) {
      const d = snack({ message: 'File saved' }, mode);
      expect(d.root.height).toBe(48);
      const message = textIn(d, NAMES.message)!;
      expect(fontOf(message)).toEqual(scale('body-medium'));
      expect(solid(message.fills)).toBe(tok('inverse-on-surface', mode));
      const abs = absOf(d, message);
      expect([abs.x, abs.y]).toEqual([16, (48 - 20) / 2]);
    }
  });

  it('message only: 16 of room on both sides (8 padding + 8 TextEndExtraSpacing)', () => {
    const d = snack({ message: 'File saved' });
    const message = absOf(d, textIn(d, NAMES.message)!);
    expect(WIDTH - (message.x + message.width)).toBe(16);
  });

  it('action: label-large in inverse-primary, 48 high, at least 58, 8 from the right and the message ends 8 from it', () => {
    for (const mode of MODES) {
      const d = snack(ACTION, mode);
      const action = box(d, NAMES.action);
      expect(action.height).toBe(48);
      expect(action.width).toBeGreaterThanOrEqual(58);
      expect(action.x + action.width).toBe(WIDTH - 8);
      const label = textIn(d, NAMES.action)!;
      expect(label.text).toBe('Undo');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('inverse-primary', mode));
      expect(absOf(d, label).x - action.x).toBeCloseTo(12, 6);
      const message = absOf(d, textIn(d, NAMES.message)!);
      expect(action.x - (message.x + message.width)).toBe(8);
    }
  });

  it('close: 24 icon in inverse-on-surface in a 48 area flush right, and the action comes right before it', () => {
    for (const mode of MODES) {
      const d = snack({ ...ACTION, dismissAction: 'true' }, mode);
      const close = box(d, NAMES.close);
      expect([close.width, close.height, close.x + close.width]).toEqual([48, 48, WIDTH]);
      const icon = iconIn(d, NAMES.close)!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect(WIDTH - (icon.box.x + icon.box.width)).toBe(12);
      expect(icon.color).toBe(tok('inverse-on-surface', mode));
      const action = box(d, NAMES.action);
      expect(action.x + action.width).toBe(close.x);
      // no gap between the message and the action when there is a close (extraSpacing only without dismiss)
      const message = absOf(d, textIn(d, NAMES.message)!);
      expect(message.x + message.width).toBe(action.x);
    }
  });

  it('a long message wraps and the height grows by 20 from 68 (two lines)', () => {
    const long = 'Message that needs to wrap onto two lines';
    const d = snack({ message: long, actionLabel: 'Undo' });
    // MC5 (#1033): with two lines the `mensagem em várias linhas` frame appears, with the baseline at 30
    // and 11 to the bottom of the text box (30 + 20 + 11 = 61), and the text is no longer the one-line `mensagem`
    expect(textIn(d, NAMES.multilineMessage)!.style.maxLines).toBeUndefined();
    expect(textIn(d, NAMES.message)).toBeUndefined();
    expect(d.root.height).toBe(68);
    const message = absOf(d, textIn(d, NAMES.multilineMessage)!);
    expect(message.height).toBe(30 + 20 + 11);
    // the action stays centered on the height
    const action = box(d, NAMES.action);
    expect(action.y + action.height / 2).toBe(34);
  });

  it('action on a new line: baseline at 30 and 12 to the end (30 + 12), actions on the right (8) and height 30 + 12 + 48 + 2', () => {
    for (const mode of MODES) {
      const d = snack({ ...ACTION, actionOnNewLine: 'true' }, mode);
      expect(d.root.height).toBe(30 + 12 + 48 + 2);
      // MC5 (#1033): the text box carries the `baselinePadding` (30 and 12), no longer the estimated padding 15 and 7
      const text = textIn(d, NAMES.messageActionNewLine)!;
      const message = absOf(d, text);
      expect([message.x, message.y, text.style.baselineTop]).toEqual([16, 0, 30]);
      expect(solid(text.fills)).toBe(tok('inverse-on-surface', mode));
      const action = box(d, NAMES.action);
      expect(action.y).toBe(30 + 12);
      expect(action.x + action.width).toBe(WIDTH - 8);
      expect(solid(textIn(d, NAMES.action)!.fills)).toBe(tok('inverse-primary', mode));
      // with the close, both areas stay on the bottom row and the 8 margin disappears
      const both = snack(
        { ...ACTION, actionOnNewLine: 'true', dismissAction: 'true' },
        mode,
      );
      expect(box(both, NAMES.close).x + box(both, NAMES.close).width).toBe(WIDTH);
      expect(iconIn(both, NAMES.close)!.color).toBe(tok('inverse-on-surface', mode));
    }
  });

  it('actionOnNewLine without an action falls back to the single line, like Compose (actionOnNewLine && action != null)', () => {
    const d = snack({ message: 'No action', actionOnNewLine: 'true' });
    expect(d.root.height).toBe(48);
    expect(named(d, NAMES.action)).toBeUndefined();
  });

  it('declares the 600 limit (ContainerMaxWidth) at the root; the snackbar uses fill sizing, so it only applies without a rectangle', () => {
    const template = entryOf('snackbar').component!.template as { maxWidth?: number };
    expect(template.maxWidth).toBe(600);
  });

  it('close only, without an action: the text goes up to the close area and there is no warning', () => {
    const d = snack({ message: 'File saved', dismissAction: 'true' });
    const message = absOf(d, textIn(d, NAMES.message)!);
    expect(message.x + message.width).toBe(WIDTH - 48);
    expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
  });
});
