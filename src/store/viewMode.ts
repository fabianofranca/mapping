import { z } from 'zod';
import { readSetting, writeSetting } from '../utils/safeStorage';
import type { EditorUi } from './ui';

// What view mode shows on the canvas (decisions 8, 9 and 13 of stage #656). The choice is
// UI state: it does not go to `mapping.json` nor into undo. It is kept per project copy,
// in this browser (`ProjectStorage.copyId`), following the model of the review resume (`review.ts`): a
// versioned blob in `localStorage`, validated with zod, the most recent copies. Without `copyId`,
// it only applies to the session. The mode itself (on or off) is never stored: it starts off.

export interface ViewShow {
  /** The name above the container and the outline of the container without a file (the background stays). */
  readonly containers: boolean;
  /** The photos' bitmap. */
  readonly images: boolean;
  /** The border and halo of the markings. */
  readonly outline: boolean;
  /** The header with the name inside the marking. */
  readonly names: boolean;
  /** As setas. */
  readonly arrows: boolean;
  /**
   * Layers with drawing that are unchecked. Storing the unchecked ones (and not the checked ones)
   * makes a new layer start checked; ids that no longer exist have no effect.
   */
  readonly hiddenDrawingLayers: ReadonlySet<string>;
}

type ViewFlag = 'containers' | 'images' | 'outline' | 'names' | 'arrows';

const NO_LAYERS: ReadonlySet<string> = new Set();

/** The start: everything checked, except the markings' outline. */
export const VIEW_SHOW_START: ViewShow = {
  containers: true,
  images: true,
  outline: false,
  names: true,
  arrows: true,
  hiddenDrawingLayers: NO_LAYERS,
};

/** Changes the given items; the rest stays. */
export function setViewShow(
  ui: EditorUi,
  patch: Partial<Pick<ViewShow, ViewFlag>>,
): void {
  ui.viewShow.value = { ...ui.viewShow.peek(), ...patch };
}

/** Desmarca a camada com desenho se estava marcada, e marca se estava desmarcada. */
export function toggleViewDrawingLayer(ui: EditorUi, layerId: string): void {
  const current = ui.viewShow.peek();
  const hidden = new Set(current.hiddenDrawingLayers);
  if (!hidden.delete(layerId)) hidden.add(layerId);
  ui.viewShow.value = { ...current, hiddenDrawingLayers: hidden };
}

/** Unchecks the layer with drawing (no effect if it already was). */
export function hideViewDrawingLayer(ui: EditorUi, layerId: string): void {
  const current = ui.viewShow.peek();
  if (current.hiddenDrawingLayers.has(layerId)) return;
  ui.viewShow.value = {
    ...current,
    hiddenDrawingLayers: new Set(current.hiddenDrawingLayers).add(layerId),
  };
}

/** Show everything: checks everything, including the outline and every layer with a drawing. */
export function showEverything(ui: EditorUi): void {
  ui.viewShow.value = {
    containers: true,
    images: true,
    outline: true,
    names: true,
    arrows: true,
    hiddenDrawingLayers: NO_LAYERS,
  };
}

/**
 * Only the screens: containers, images and all layers with drawing checked; outline, name and
 * arrows unchecked (the canvas of the former Clean view).
 */
export function onlyScreens(ui: EditorUi): void {
  ui.viewShow.value = {
    containers: true,
    images: true,
    outline: false,
    names: false,
    arrows: false,
    hiddenDrawingLayers: NO_LAYERS,
  };
}

// ---------------------------------------------------------------------------
// Persistence per project copy

const KEY = 'mapping.viewShow';
const VERSION = 1;
/** Project copies with a stored choice (the most recent ones). */
const MAX_COPIES = 20;

const copySchema = z.object({
  containers: z.boolean(),
  images: z.boolean(),
  outline: z.boolean(),
  names: z.boolean(),
  arrows: z.boolean(),
  hiddenLayers: z.array(z.string()),
});
type StoredCopy = z.infer<typeof copySchema>;

type Blob = Readonly<Record<string, StoredCopy>>;

/** Reads the copies from `localStorage`; corrupted text, another version or an invalid copy disappear. */
function readCopies(): Blob {
  const text = readSetting(KEY);
  if (text === null) return {};
  try {
    const parsed = z
      .object({ v: z.literal(VERSION), copies: z.record(z.string(), z.unknown()) })
      .safeParse(JSON.parse(text));
    if (!parsed.success) return {};
    const copies: Record<string, StoredCopy> = {};
    for (const [scope, value] of Object.entries(parsed.data.copies)) {
      const copy = copySchema.safeParse(value);
      if (copy.success) copies[scope] = copy.data;
    }
    return copies;
  } catch {
    return {};
  }
}

function toStored(show: ViewShow): StoredCopy {
  return {
    containers: show.containers,
    images: show.images,
    outline: show.outline,
    names: show.names,
    arrows: show.arrows,
    hiddenLayers: [...show.hiddenDrawingLayers],
  };
}

function fromStored(copy: StoredCopy): ViewShow {
  return {
    containers: copy.containers,
    images: copy.images,
    outline: copy.outline,
    names: copy.names,
    arrows: copy.arrows,
    hiddenDrawingLayers: new Set(copy.hiddenLayers),
  };
}

/** The blob with this copy's choice last (the most recent) and only the most recent ones. */
function withCopy(copies: Blob, scope: string, copy: StoredCopy): Blob {
  const others = Object.entries(copies).filter(([key]) => key !== scope);
  return Object.fromEntries([...others, [scope, copy]].slice(-MAX_COPIES));
}

/**
 * Applies this project copy's stored choice and starts storing each change. Without
 * `copyId` (`undefined` or empty), nothing is read or written: the choice only applies to the session.
 * Returns whoever stops storing.
 */
export function attachViewShowPersistence(
  ui: EditorUi,
  copyId: string | undefined,
): () => void {
  if (copyId === undefined || copyId === '') return () => undefined;
  const saved = readCopies()[copyId];
  if (saved !== undefined) ui.viewShow.value = fromStored(saved);
  let first = true;
  return ui.viewShow.subscribe((show) => {
    // The first call is the current value (already stored or the start): only changes write.
    if (first) {
      first = false;
      return;
    }
    const blob = withCopy(readCopies(), copyId, toStored(show));
    writeSetting(KEY, JSON.stringify({ v: VERSION, copies: blob }));
  });
}
