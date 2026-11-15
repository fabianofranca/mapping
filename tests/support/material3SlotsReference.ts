// SL7 of #1080: the six Material 3 (Compose) types that gain named slots (`bottom-app-bar`, `top-app-bar`, `scaffold`,
// `switch`, `swipe-to-dismiss` and `bottom-sheet`) draw, without child markings, exactly as before. The reference
// (`tests/fixtures/material3-slots-before.json`) was recorded **before** the library moved to the slots, from the MCP
// raster (embedded Roboto, zoom 1): one hash per case and mode. It is never regenerated after the move: a hash that
// changes is a defect of the `fallback`, not a reference to update.
import { createHash } from 'node:crypto';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { instantiate } from '../../src/model/components/instantiate';
import { fitComponentSize } from '../../src/model/components/sizing';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files } from './material3Library';

export const SLOT_TYPES = [
  'bottom-app-bar',
  'top-app-bar',
  'scaffold',
  'switch',
  'swipe-to-dismiss',
  'bottom-sheet',
] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
export type Mode = 'light' | 'dark';

const FOUR = {
  actionIcon1: 'Home',
  actionIcon2: 'Search',
  actionIcon3: 'Person',
  actionIcon4: 'Menu',
};
const ITEMS = [
  { label: 'Favorites', icon: 'Favorite' },
  { label: 'Edit', icon: 'Edit' },
  { label: 'Settings', icon: 'Settings' },
];

/** The cases of each type: the values (over the fields' defaults) that the reference hashes. */
export const CASES: Record<SlotType, Record<string, Record<string, unknown>>> = {
  'bottom-app-bar': {
    empty: {},
    preview: {
      actionIcon1: 'Check',
      actionIcon2: 'Edit',
      actionIcon3: 'Favorite',
      floatingActionButton: 'Add',
    },
    four: FOUR,
    'four-fab': { ...FOUR, floatingActionButton: 'Add' },
    fab: { floatingActionButton: 'Add' },
    one: { actionIcon1: 'Check' },
  },
  'top-app-bar': {
    'small-empty': { style: 'small' },
    'small-full': {
      style: 'small',
      title: 'Home',
      navigationIcon: 'Menu',
      actionIcon1: 'Search',
      actionIcon2: 'MoreVert',
    },
    'center-full': {
      style: 'center',
      title: 'Home',
      navigationIcon: 'ArrowBack',
      actionIcon1: 'Search',
      actionIcon2: 'MoreVert',
    },
    'center-one': { style: 'center', title: 'Home', actionIcon1: 'Search' },
    'medium-full': {
      style: 'medium',
      title: 'Home',
      navigationIcon: 'Menu',
      actionIcon1: 'Search',
      actionIcon2: 'MoreVert',
    },
    'large-full': {
      style: 'large',
      title: 'Home',
      navigationIcon: 'Menu',
      actionIcon1: 'Search',
      actionIcon2: 'MoreVert',
    },
    subtitle: {
      style: 'small',
      title: 'Home',
      subtitle: 'Inbox',
      navigationIcon: 'Menu',
    },
  },
  scaffold: {
    end: { floatingActionButtonPosition: 'End' },
    center: { floatingActionButtonPosition: 'Center' },
    start: { floatingActionButtonPosition: 'Start' },
    'end-overlay': { floatingActionButtonPosition: 'EndOverlay' },
    primary: { containerColor: 'primary' },
  },
  switch: {
    off: { checked: 'false', label: 'Notifications' },
    on: { checked: 'true', label: 'Notifications' },
    'on-icon': { checked: 'true', thumbIcon: 'true', label: 'Notifications' },
    'off-icon': { checked: 'false', thumbIcon: 'true' },
    'on-disabled': { checked: 'true', enabled: 'false' },
    'off-disabled-icon': { checked: 'false', enabled: 'false', thumbIcon: 'true' },
    pressed: { checked: 'true', interaction: 'pressed' },
    focused: { checked: 'false', interaction: 'focused', thumbIcon: 'true' },
  },
  'swipe-to-dismiss': {
    settled: { title: 'Team meeting', supportingText: 'Today, 2 pm', icon: 'Delete' },
    'start-to-end': {
      title: 'Team meeting',
      supportingText: 'Today, 2 pm',
      direction: 'StartToEnd',
      icon: 'Check',
    },
    'end-to-start': {
      title: 'Team meeting',
      supportingText: 'Today, 2 pm',
      direction: 'EndToStart',
      icon: 'Delete',
    },
    'end-to-start-no-icon': { title: 'Team meeting', direction: 'EndToStart' },
    'end-to-start-disabled': {
      title: 'Team meeting',
      direction: 'EndToStart',
      enableDismissFromEndToStart: 'false',
      icon: 'Delete',
    },
  },
  'bottom-sheet': {
    modal: { title: 'Share', style: 'modal', items: ITEMS },
    standard: { title: 'Share', style: 'standard', items: ITEMS },
    'no-handle': { title: 'Share', dragHandle: 'false', items: ITEMS },
    'no-title': { style: 'modal', items: ITEMS.slice(0, 1) },
    empty: { style: 'modal' },
  },
};

const book = createFontBook();
const measure = measurerFor(book);
const catalog = buildCatalog(files);

/** The raster of one case, drawn at the fitted size, with the MCP font, over white at zoom 1. */
export function renderCase(id: SlotType, values: Record<string, unknown>, mode: Mode) {
  const entry = findEntry(catalog, id);
  const library = catalog.library;
  if (entry?.component == null || library === null) throw new Error(`no ${id}`);
  const options = {
    measure,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
  const all = { ...defaultValues(entry.type), ...values } as never;
  const fit = fitComponentSize(entry.component, all, options);
  const size = {
    width: fit?.width ?? entry.component.size.width,
    height: fit?.height ?? entry.component.size.height,
  };
  const drawing = instantiate(entry.component, all, { x: 0, y: 0, ...size }, options);
  const raster = createRaster(size.width, size.height);
  raster.data.fill(255);
  paintScene(raster, [{ root: drawing.root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, ...size },
    fonts: book,
  });
  return { raster, size, warnings: drawing.warnings };
}

/** `<width>x<height>:<sha1 of the pixels>`: what the reference stores per case and mode. */
export function rasterKey(
  id: SlotType,
  values: Record<string, unknown>,
  mode: Mode,
): string {
  const { raster, size } = renderCase(id, values, mode);
  const hash = createHash('sha1').update(raster.data).digest('hex');
  return `${size.width}x${size.height}:${hash}`;
}

/** Every `<type>/<case>/<mode>` key of the reference. */
export function referenceKeys(): string[] {
  return SLOT_TYPES.flatMap((id) =>
    Object.keys(CASES[id]).flatMap((name) =>
      (['light', 'dark'] as const).map((mode) => `${id}/${name}/${mode}`),
    ),
  );
}

export function rasterOfKey(key: string): string {
  const [id, name, mode] = key.split('/') as [SlotType, string, Mode];
  const values = CASES[id][name];
  if (values === undefined) throw new Error(`no case ${key}`);
  return rasterKey(id, values, mode);
}
