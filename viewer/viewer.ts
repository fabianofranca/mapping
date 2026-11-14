/**
 * Embeddable viewer: shows ONE screen of the component library in a host container, with no
 * framework. It creates its own `Konva.Stage` with two layers: the content one (the `artboard`
 * with the screen background at index 0 of the group and, on top of it, the `ScreenRenderer`) and
 * the overlay one (hover and selection rectangles, `listening: false`).
 *
 * Scale and position (framing) live on the STAGE, not on the groups: both layers share the same
 * transformation and the overlay follows the content, with the boxes in screen coordinates. There
 * is no pan or wheel zoom: the host sizes the container and the `ResizeObserver` (when it exists)
 * reframes. Drawing happens at most once per frame.
 *
 * Interaction: by default the pointer reports `onHover`/`onClick`. With `interactive: false` (or
 * `setInteractive(false)`) the canvas becomes image-only: the pointer does nothing, but
 * `setSelection` and `setHover` keep working (selection and hover coming from the host, e.g. a
 * tree), as do `clientToScreen`, `instanceAt` and `boxOf`.
 *
 * The screen comes from two sources: `screen` (already built) or `source` (an external JSON,
 * translated by the origin declared in the specialization and laid out by `screenFromSource` with
 * the same measurer as the drawing). A defined `source` wins over `screen`. The screen is
 * recomputed when the library or `source` change (identity) and on `redraw()`; `onSource`
 * receives each result (warnings and `error`). Without a library, or with `error`, nothing is
 * drawn.
 *
 * Fonts belong to the host: after a font loads, call `redraw()` to re-measure the texts. The
 * module does not register fonts and, by default, makes no network request.
 *
 * Remote images (the component's `image` node): off by default. With `remoteImages: true`, the
 * URL must pass the policy (only `https:`, no local network) and the origin must pass the host's
 * `allowOrigin` function (without it, everything is refused and the component draws the
 * placeholder). The CSP (`img-src`) belongs to the host site. See `remoteImages.ts` and
 * `PACKAGE-README.md`.
 */
import Konva from 'konva/lib/Core';
import { Group } from 'konva/lib/Group';
import { Layer } from 'konva/lib/Layer';
import { Rect } from 'konva/lib/shapes/Rect';
import { Stage } from 'konva/lib/Stage';
import { type Library, withHostTokens } from '../src/model/components/library';
import type { Direction } from '../src/model/components/componentFormat';
import type { HostFonts } from '../src/model/components/tokens';
import { tokenValue } from '../src/theme/tokens';
import type { TextMeasurer } from '../src/model/components/instantiate';
import type { Box, Screen } from '../src/model/components/screen';
import { type SourceResult, screenFromSource } from '../src/model/components/origin';
import type { AllowOrigin } from './allowOrigin';
import { createViewerRemoteImages } from './remoteImages';
import { VIEWER_LABELS } from './labels';
import { konvaMeasurer } from '../src/canvas/components/konvaMeasurer';
import {
  type InstanceWarnings,
  ScreenRenderer,
} from '../src/canvas/components/screenRenderer';

export interface ViewerInput {
  readonly library: Library | undefined;
  readonly screen: Screen | undefined;
  /** External JSON, already parsed; when defined, the screen is the one computed from it and `screen` is ignored. */
  readonly source: unknown;
  /** Specialization origin used for `source` (absent = the first). */
  readonly sourceSystem: string | undefined;
  /**
   * Mode of the drawing tokens (`light`, `dark`…, the specialization's `modes`). Absent, or a
   * mode the specialization does not declare, means the first mode. Changing it redraws without
   * reloading the library or the screen.
   */
  readonly drawingMode: string | undefined;
  /**
   * Reading direction of the screen computed from `source` (`ltr`, the default, or `rtl`): it
   * goes to `layoutScreen` (mirrors the roots, the logical anchors and the slots) and to the
   * component engine. Absent, the origin's `screen.direction` applies; a ready-made `screen`
   * (without `source`) already carries the boxes and the direction (`Screen.direction`, only in
   * `rtl`) and is not recomputed: the inside of each component follows the screen's direction,
   * and this option, if given, wins.
   */
  readonly direction: Direction | undefined;
}

export interface ViewerOptions {
  readonly library?: Library;
  readonly screen?: Screen;
  /** External JSON (see `ViewerInput.source`); wins over `screen`. */
  readonly source?: unknown;
  readonly sourceSystem?: string;
  /** Initial mode of the drawing tokens (see `ViewerInput.drawingMode`); changed through `update`. */
  readonly drawingMode?: string;
  /** Initial reading direction (see `ViewerInput.direction`); changed through `update`. */
  readonly direction?: Direction;
  /** Result of each computation of the screen from `source` (screen, warnings and `error`). */
  readonly onSource?: (result: SourceResult) => void;
  /** The pointer entered/left an instance (`undefined` = none). */
  readonly onHover?: (id: string | undefined) => void;
  /** Click (primary button) on an instance or on the background (`undefined`); x,y in screen px. */
  readonly onClick?: (id: string | undefined, event: { x: number; y: number }) => void;
  /** Instantiation warnings per instance, on each update that redrew something. */
  readonly onWarnings?: (byInstance: InstanceWarnings) => void;
  readonly measure?: TextMeasurer;
  /**
   * Default font of the texts without `family` (the `font-sans`/`font-mono` built into the tokens).
   * Default: the app's token stack (`--font-sans`/`--font-mono`), the same as the app. A
   * specialization that redefines `font-sans` in its `tokens` wins.
   */
  readonly fonts?: HostFonts;
  /** How the screen fits the container: `'contain'` (default, with `padding` margin) or a fixed scale. */
  readonly fit?: 'contain' | number;
  /** Margin, in container px, of the `'contain'` framing (default 16). */
  readonly padding?: number;
  /**
   * The pointer selects/highlights (default `true`). With `false` the canvas is image-only: no
   * `onHover`/`onClick`; the host's `setSelection` and `setHover` keep working.
   */
  readonly interactive?: boolean;
  /** Highlight colors (CSS); defaults: selection '#1A63CC', hover 'rgba(26, 99, 204, 0.8)'. */
  readonly selectionColor?: string;
  readonly hoverColor?: string;
  /**
   * Shows the components' remote images (default `false`: no request, the placeholder in their
   * place). When on, only `https:` and only the origins `allowOrigin` accepts.
   */
  readonly remoteImages?: boolean;
  /**
   * Decides, per origin (e.g. `https://cdn.example.com`), whether the image may be requested.
   * Default: refuse everything. Only applies with `remoteImages: true`; it is read when the
   * viewer is created.
   */
  readonly allowOrigin?: AllowOrigin;
}

export interface Viewer {
  /** Redraws only what changed (identity of library, screen and instances). Omitted fields stay. */
  update(input: Partial<ViewerInput>): void;
  /** Re-instantiates everything and recomputes the screen from `source` (e.g. the host's fonts loaded). */
  redraw(): void;
  /** Selection highlight (solid border); empty = none. */
  setSelection(ids: readonly string[]): void;
  /** Hover highlight coming from the host (e.g. the list beside it); does not fire `onHover`. */
  setHover(id: string | undefined): void;
  /**
   * Turns pointer interaction on/off (see `ViewerOptions.interactive`). Turning it off while
   * the pointer's hover is active calls `onHover(undefined)` once.
   */
  setInteractive(on: boolean): void;
  /** Reapplies the framing (also automatic when the container is resized). */
  fit(): void;
  scale(): number;
  /** The instance's rectangle on the screen (screen px). */
  boxOf(id: string): Box | undefined;
  instanceAt(point: { x: number; y: number }): string | undefined;
  /** Converts a DOM point (`clientX/clientY`) to screen px. */
  clientToScreen(client: { x: number; y: number }): { x: number; y: number };
  warnings(): InstanceWarnings;
  /** The drawn screen: the one computed from `source` or the one passed in `screen` (`undefined` = none). */
  screen(): Screen | undefined;
  /** PNG of the screen (without the highlights). */
  toDataURL(pixelRatio?: number): string;
  dispose(): void;
}

/** Cap on Konva's pixel ratio: 3× screens redraw 2.25× more pixels than 2× for nothing visible in the viewer. */
const MAX_PIXEL_RATIO = 2;
let pixelRatioCapped = false;

/** Applies the cap once, when the first viewer is created (importing the module does not touch Konva). */
function capPixelRatio(): void {
  if (pixelRatioCapped) return;
  pixelRatioCapped = true;
  const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  Konva.pixelRatio = Math.min(device, MAX_PIXEL_RATIO);
}

/** `#rrggbb` + alpha → `rgba(r, g, b, a)`. */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Default highlight colors: the light theme's accent; hover takes the token's opacity. */
const SELECT_COLOR = tokenValue('color-accent', 'light');
const HOVER_COLOR = withAlpha(
  SELECT_COLOR,
  Number(tokenValue('opacity-viewer-hover', 'light')),
);
const DEFAULT_PADDING = 16;
const MIN_SCALE = 0.01;
/** "Empty" screen handed to the renderer when the host clears the screen. */
const EMPTY_SCREEN: Screen = {
  id: '',
  name: '',
  width: 1,
  height: 1,
  background: 'transparent',
  instances: [],
};

export function createViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
): Viewer {
  capPixelRatio();
  const selectionColor = options.selectionColor ?? SELECT_COLOR;
  const hoverColor = options.hoverColor ?? HOVER_COLOR;
  const padding = options.padding ?? DEFAULT_PADDING;
  const fitMode = options.fit ?? 'contain';

  let interactive = options.interactive ?? true;

  /** Usable area of the container: `clientWidth/Height` without the padding, and the origin after the border and padding. */
  const contentBox = (): { width: number; height: number; left: number; top: number } => {
    const style = getComputedStyle(container);
    const px = (value: string): number => Number.parseFloat(value) || 0;
    const left = px(style.borderLeftWidth) + px(style.paddingLeft);
    const top = px(style.borderTopWidth) + px(style.paddingTop);
    return {
      width: Math.max(
        1,
        container.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
      ),
      height: Math.max(
        1,
        container.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
      ),
      left,
      top,
    };
  };

  const initialBox = contentBox();
  const stage = new Stage({
    container: container as HTMLDivElement,
    width: initialBox.width,
    height: initialBox.height,
  });
  // The size changes through `resizeStage`, which redraws only once (Konva's listener would
  // redraw synchronously on each of the two properties).
  stage.off('widthChange.konva heightChange.konva');
  const content = new Layer();
  const overlay = new Layer({ listening: false });
  const screenGroup = new Group();
  const artboard = new Rect({ fill: '#FFFFFF', visible: false });
  screenGroup.add(artboard);
  content.add(screenGroup);
  const hoverRect = new Rect({
    stroke: hoverColor,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
    visible: false,
  });
  overlay.add(hoverRect);
  stage.add(content, overlay);

  const measure = options.measure ?? konvaMeasurer;
  const fonts: HostFonts = options.fonts ?? {
    sans: tokenValue('font-sans', 'light'),
    mono: tokenValue('font-mono', 'light'),
  };
  /** The received library, with the mode's tokens and the host's font in the components. */
  const baked = new WeakMap<Library, Map<string, Library>>();
  let drawingMode: string | undefined = options.drawingMode;
  const withFonts = (lib: Library | undefined): Library | undefined => {
    if (lib === undefined) return undefined;
    const byMode = baked.get(lib) ?? new Map<string, Library>();
    baked.set(lib, byMode);
    const key = drawingMode ?? '';
    const hit = byMode.get(key) ?? withHostTokens(lib, fonts, drawingMode);
    byMode.set(key, hit);
    return hit;
  };
  // Always `pixelSafe`: the `toDataURL` below reads pixels, so no `opaque` image is drawn.
  const images = options.remoteImages
    ? createViewerRemoteImages(options.allowOrigin)
    : undefined;
  const renderer = new ScreenRenderer(screenGroup, {
    labels: VIEWER_LABELS,
    measure,
    pixelSafe: true,
    ...(images ? { remoteImage: (url: string) => images.resolve(url) } : {}),
  });
  const selectionRects = new Map<string, Rect>();

  let library: Library | undefined = options.library;
  let passedScreen: Screen | undefined = options.screen;
  let source: unknown = options.source;
  let sourceSystem: string | undefined = options.sourceSystem;
  let direction: Direction | undefined = options.direction;
  /** The effective screen: the one computed from `source` (if defined) or `passedScreen`. */
  let screen: Screen | undefined = passedScreen;
  let selection: readonly string[] = [];
  let hoverId: string | undefined;
  /** What the pointer is over (so `onHover` is only reported when it changes). */
  let pointerId: string | undefined;
  let fittedKey: string | undefined;
  let frame = 0;
  let disposed = false;

  const draw = (): void => {
    if (disposed || frame) return;
    if (typeof requestAnimationFrame !== 'function') {
      stage.batchDraw();
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      stage.batchDraw();
    });
  };

  /** Fits the stage size to the container's; `true` if it changed (the caller redraws, once). */
  const syncSize = (): boolean => {
    const { width, height } = contentBox();
    if (stage.width() === width && stage.height() === height) return false;
    stage.setAttrs({ width, height });
    return true;
  };

  /** Framing key: size of the screen and of the stage (container changed = frame again). */
  const fitKeyOf = (current: Screen): string =>
    `${current.width}x${current.height}@${stage.width()}x${stage.height()}`;

  const applyFit = (): void => {
    const resized = syncSize();
    if (screen) {
      const scale =
        fitMode === 'contain'
          ? Math.max(
              MIN_SCALE,
              Math.min(
                (stage.width() - padding * 2) / screen.width,
                (stage.height() - padding * 2) / screen.height,
              ),
            )
          : Math.max(MIN_SCALE, fitMode);
      stage.scale({ x: scale, y: scale });
      stage.position({
        x: (stage.width() - screen.width * scale) / 2,
        y: (stage.height() - screen.height * scale) / 2,
      });
      fittedKey = fitKeyOf(screen);
    }
    // Konva redraws the layers right away when resizing (once, already with the new scale);
    // with no size change, the frame takes care of it.
    if (resized) stage._resizeDOM();
    else if (screen) draw();
  };

  const boxOf = (id: string): Box | undefined => renderer.instanceOf(id)?.box;

  /** Hover and selection follow the current boxes (the screen may have changed). */
  const syncOverlay = (): void => {
    const selected = new Set(selection);
    for (const [id, rect] of selectionRects) {
      if (selected.has(id) && boxOf(id)) continue;
      rect.destroy();
      selectionRects.delete(id);
    }
    for (const id of selected) {
      const box = boxOf(id);
      if (!box) continue;
      let rect = selectionRects.get(id);
      if (!rect) {
        rect = new Rect({
          stroke: selectionColor,
          strokeWidth: 2,
          strokeScaleEnabled: false,
          listening: false,
        });
        overlay.add(rect);
        selectionRects.set(id, rect);
      }
      rect.setAttrs({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
    const hoverBox =
      hoverId !== undefined && !selected.has(hoverId) ? boxOf(hoverId) : undefined;
    if (hoverBox) hoverRect.setAttrs({ ...hoverBox, visible: true });
    else hoverRect.visible(false);
    draw();
  };

  const emitWarnings = (): void => options.onWarnings?.(renderer.warnings());

  /** Recomputes the effective screen; with `source` and a library, reports `onSource`. */
  const resolveScreen = (): void => {
    if (source === undefined) {
      screen = passedScreen;
      return;
    }
    if (!library) {
      screen = undefined;
      return;
    }
    const result = screenFromSource(withFonts(library) ?? library, source, {
      system: sourceSystem,
      ...(direction !== undefined ? { direction } : {}),
      measure,
    });
    screen = result.screen;
    options.onSource?.(result);
  };

  const sync = (force: boolean): void => {
    const current = screen ?? EMPTY_SCREEN;
    artboard.setAttrs({
      width: current.width,
      height: current.height,
      fill: current.background,
      visible: screen !== undefined,
    });
    const changed = renderer.update(withFonts(library), current, {
      force,
      zBase: 1,
      ...(direction !== undefined ? { direction } : {}),
    });
    if (screen && fittedKey !== fitKeyOf(screen)) applyFit();
    syncOverlay();
    if (changed || force) emitWarnings();
  };

  const toScreen = (local: { x: number; y: number }): { x: number; y: number } => {
    const scale = stage.scaleX();
    return { x: (local.x - stage.x()) / scale, y: (local.y - stage.y()) / scale };
  };

  const clientToScreen = (client: { x: number; y: number }): { x: number; y: number } => {
    const rect = container.getBoundingClientRect();
    const box = contentBox();
    return toScreen({
      x: client.x - rect.left - box.left,
      y: client.y - rect.top - box.top,
    });
  };

  const setPointer = (id: string | undefined): void => {
    if (id === pointerId) return;
    pointerId = id;
    options.onHover?.(id);
    hoverId = id;
    syncOverlay();
  };

  /** Turns the pointer on/off; when turned off, the hover that came from it is cleared (the host is notified). */
  const applyInteractive = (on: boolean): void => {
    interactive = on;
    stage.listening(on);
    if (!on) setPointer(undefined);
  };
  stage.listening(interactive);

  stage.on('mousemove', (e) => {
    if (interactive) setPointer(renderer.instanceIdOf(e.target));
  });
  stage.on('mouseleave', () => {
    if (interactive) setPointer(undefined);
  });
  stage.on('click tap', (e) => {
    if (!interactive) return;
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
    const pointer = stage.getPointerPosition();
    const point = pointer
      ? toScreen(pointer)
      : e.evt instanceof MouseEvent
        ? clientToScreen({ x: e.evt.clientX, y: e.evt.clientY })
        : { x: 0, y: 0 };
    options.onClick?.(renderer.instanceIdOf(e.target), point);
  });

  let observer: ResizeObserver | undefined;
  /** The resize is applied on the next frame, once, no matter how many notifications arrive. */
  let resizeFrame = 0;
  const scheduleResize = (): void => {
    if (disposed || resizeFrame) return;
    if (typeof requestAnimationFrame !== 'function') {
      applyFit();
      return;
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!disposed) applyFit();
    });
  };
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleResize);
    observer.observe(container);
  }

  const unsubscribeImages = images?.subscribe((url) => {
    if (disposed) return;
    if (renderer.refreshImage(url)) draw();
  });

  resolveScreen();
  if (library !== undefined || screen !== undefined) sync(false);

  return {
    update(input) {
      if (disposed) return;
      let recompute = false;
      if ('library' in input && input.library !== library) {
        library = input.library;
        recompute = true;
      }
      if ('source' in input && input.source !== source) {
        source = input.source;
        recompute = true;
      }
      if ('sourceSystem' in input && input.sourceSystem !== sourceSystem) {
        sourceSystem = input.sourceSystem;
        recompute = true;
      }
      if ('direction' in input && input.direction !== direction) {
        direction = input.direction;
        if (source !== undefined) recompute = true;
      }
      if ('drawingMode' in input && input.drawingMode !== drawingMode) {
        drawingMode = input.drawingMode;
        // with `source`, the screen comes out of the library already with the mode's tokens
        if (source !== undefined) recompute = true;
      }
      if ('screen' in input && input.screen !== passedScreen) {
        passedScreen = input.screen;
        if (source === undefined) recompute = true; // with `source`, `screen` is ignored
      }
      if (recompute) resolveScreen();
      sync(false);
    },
    redraw() {
      if (disposed) return;
      resolveScreen();
      sync(true);
    },
    setSelection(ids) {
      if (disposed) return;
      selection = [...ids];
      syncOverlay();
    },
    setHover(id) {
      if (disposed) return;
      hoverId = id;
      syncOverlay();
    },
    setInteractive(on) {
      if (disposed || on === interactive) return;
      applyInteractive(on);
    },
    fit() {
      if (!disposed) applyFit();
    },
    scale: () => stage.scaleX(),
    boxOf: (id) => (disposed ? undefined : boxOf(id)),
    instanceAt: (point) => (disposed ? undefined : renderer.instanceAt(point)),
    clientToScreen: (client) => clientToScreen(client),
    warnings: () => (disposed ? new Map() : renderer.warnings()),
    screen: () => (disposed ? undefined : screen),
    toDataURL(pixelRatio = 2) {
      if (disposed || !screen) return '';
      const scale = stage.scaleX();
      overlay.visible(false);
      try {
        const url: string | null = stage.toDataURL({
          x: stage.x(),
          y: stage.y(),
          width: screen.width * scale,
          height: screen.height * scale,
          pixelRatio: pixelRatio / scale,
        });
        return url ?? '';
      } finally {
        overlay.visible(true);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      unsubscribeImages?.();
      images?.dispose();
      if (typeof cancelAnimationFrame === 'function') {
        if (frame) cancelAnimationFrame(frame);
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
      }
      frame = 0;
      resizeFrame = 0;
      renderer.dispose();
      selectionRects.clear();
      stage.destroy();
    },
  };
}
