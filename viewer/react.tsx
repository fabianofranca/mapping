/** @jsxImportSource react */
/**
 * Thin React wrapper of the embeddable viewer: `<MappingViewer/>` is a `<div>`
 * that hosts a `createViewer`. It imports only from `react` (`react-dom` belongs to the host).
 *
 * - The viewer is created and destroyed by `useEffect([])`: in `<StrictMode>` React mounts,
 *   unmounts and mounts again, and each cycle creates and discards its own viewer without leaking.
 * - The callbacks (`onHover`, `onClick`, `onWarnings`, `onSource`) are read through a ref:
 *   passing a new function on every render does NOT recreate the viewer.
 * - `library`/`screen`/`source`/`sourceSystem`/`drawingMode`/`direction` → `update` (`source`,
 *   the external JSON, wins over `screen` and is translated by the specialization's origin;
 *   `onSource` receives each computation), `selection` → `setSelection`, `hover` → `setHover`,
 *   `fontsVersion` → `redraw`.
 * - `interactive` (default `true`) → `setInteractive`: with `false` the canvas neither selects nor
 *   reports `onHover`/`onClick`; the host's `selection` and `hover` keep working.
 * - `remoteImages` and `allowOrigin` apply only at creation (remote images, off by default;
 *   `allowOrigin` is read through a ref, so a new function on every render does not recreate
 *   the viewer).
 * - `measure`, `fonts`, `selectionColor` and `hoverColor` apply only at creation (like `fit` and
 *   `padding`).
 * - `fit` and `padding` apply only at creation (changing them later does not reframe). To
 *   reframe on demand, use `createViewer` directly and call `viewer.fit()`.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createViewer } from './index';
import type { Library, Screen, Viewer, ViewerOptions } from './index';

export * from './index';

export interface MappingViewerProps {
  readonly library: Library | undefined;
  readonly screen: Screen | undefined;
  /** External JSON, already parsed; when defined, it wins over `screen` (see `ViewerInput.source`). */
  readonly source?: unknown;
  readonly sourceSystem?: string;
  /** Mode of the drawing tokens (`light`, `dark`…); changing it redraws without reloading. */
  readonly drawingMode?: string;
  /** Reading direction (`ltr`, the default, or `rtl`); applies to the screen computed from `source`. */
  readonly direction?: ViewerOptions['direction'];
  readonly onSource?: ViewerOptions['onSource'];
  readonly selection?: readonly string[];
  readonly hover?: string | undefined;
  readonly onHover?: ViewerOptions['onHover'];
  readonly onClick?: ViewerOptions['onClick'];
  readonly onWarnings?: ViewerOptions['onWarnings'];
  /** Default `true`; `false` = the canvas is image-only (selection and hover only through props). */
  readonly interactive?: boolean;
  /** Only at viewer creation: text measurer (default: `konvaMeasurer`). */
  readonly measure?: ViewerOptions['measure'];
  /** Only at viewer creation: default font of the texts without `family`. */
  readonly fonts?: ViewerOptions['fonts'];
  /** Only at viewer creation: selection and hover highlight colors (CSS). */
  readonly selectionColor?: string;
  readonly hoverColor?: string;
  /** Only at viewer creation (changing it later has no effect). */
  readonly fit?: ViewerOptions['fit'];
  /** Only at viewer creation (changing it later has no effect). */
  readonly padding?: number;
  /** Only at viewer creation: turns remote images on (default `false`). */
  readonly remoteImages?: boolean;
  /** Accepted origins (default: refuse everything). Applies with `remoteImages`; read on every request. */
  readonly allowOrigin?: ViewerOptions['allowOrigin'];
  readonly className?: string;
  /** Merged over the default `{ width: '100%', height: '100%' }`. */
  readonly style?: CSSProperties;
  /** Version of the host's fonts: changing the value calls `redraw()` (re-measures the texts). */
  readonly fontsVersion?: number | string;
}

const NO_SELECTION: readonly string[] = [];
const FILL: CSSProperties = { width: '100%', height: '100%' };

export function MappingViewer(props: MappingViewerProps): JSX.Element {
  const {
    library,
    screen,
    source,
    sourceSystem,
    drawingMode,
    direction,
    selection,
    hover,
    fontsVersion,
    className,
    style,
  } = props;
  const interactive = props.interactive ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  /** Always the latest version of the props: callbacks and the initial values at creation. */
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const initial = latest.current;
    const viewer = createViewer(container, {
      library: initial.library,
      screen: initial.screen,
      source: initial.source,
      sourceSystem: initial.sourceSystem,
      drawingMode: initial.drawingMode,
      direction: initial.direction,
      measure: initial.measure,
      fonts: initial.fonts,
      selectionColor: initial.selectionColor,
      hoverColor: initial.hoverColor,
      fit: initial.fit,
      padding: initial.padding,
      interactive: initial.interactive,
      remoteImages: initial.remoteImages,
      allowOrigin: (origin) => latest.current.allowOrigin?.(origin) === true,
      onHover: (id) => latest.current.onHover?.(id),
      onClick: (id, point) => latest.current.onClick?.(id, point),
      onWarnings: (warnings) => latest.current.onWarnings?.(warnings),
      onSource: (result) => latest.current.onSource?.(result),
    });
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.update({
      library,
      screen,
      source,
      sourceSystem,
      drawingMode,
      direction,
    });
  }, [library, screen, source, sourceSystem, drawingMode, direction]);

  useEffect(() => {
    viewerRef.current?.setSelection(selection ?? NO_SELECTION);
  }, [selection]);

  useEffect(() => {
    viewerRef.current?.setHover(hover);
  }, [hover]);

  useEffect(() => {
    viewerRef.current?.setInteractive(interactive);
  }, [interactive]);

  const drawnFonts = useRef(fontsVersion);
  useEffect(() => {
    // The creation value does not redraw (the viewer already drew with it), nor does StrictMode's remount.
    if (drawnFonts.current === fontsVersion) return;
    drawnFonts.current = fontsVersion;
    viewerRef.current?.redraw();
  }, [fontsVersion]);

  return <div ref={containerRef} className={className} style={{ ...FILL, ...style }} />;
}
