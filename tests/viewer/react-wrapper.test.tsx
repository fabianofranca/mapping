/** @jsxImportSource react */
/**
 * React wrapper of the viewer (`viewer-react` project: real React 19, jsdom and a fake canvas).
 * Observes real effects on the Konva Stage instead of spying on `createViewer`.
 */
import Konva from 'konva';
import * as React from 'react';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../viewer/samples/samples';
import settings from '../../viewer/samples/settings.sdui.json';
import { M3_FILES, M3_SCREEN } from '../../viewer/samples/samplesMaterial3';
import {
  MappingViewer,
  type MappingViewerProps,
  type SourceResult,
  loadLibrary,
} from '../../viewer/react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => installFakeCanvas());

const library = loadLibrary(SAMPLE_FILES);
const m3Library = loadLibrary(M3_FILES);

let host: HTMLDivElement | undefined;
let root: Root | undefined;

/** Mounts the wrapper in a sized container (the jsdom layout is zero). */
async function mount(props: MappingViewerProps, strict = true): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render(props, strict);
  return host;
}

async function render(props: MappingViewerProps, strict = true): Promise<void> {
  const node = <MappingViewer {...props} />;
  await act(async () => {
    root?.render(strict ? <StrictMode>{node}</StrictMode> : node);
  });
}

/** The wrapper `<div>`, with `clientWidth/Height` (jsdom does not compute layout). */
function viewerDiv(): HTMLDivElement {
  const div = host?.firstElementChild;
  if (!(div instanceof HTMLDivElement)) throw new Error('wrapper div not found');
  return div;
}

function stageOf(div: HTMLElement): Konva.Stage {
  const stage = Konva.stages.find((s) => s.container() === div);
  if (!stage) throw new Error('stage not found');
  return stage;
}

function instanceCount(stage: Konva.Stage): number {
  return stage.find((n: Konva.Node) => n.getAttr('instanceId') !== undefined).length;
}

/** Rectangles of the selection color in the overlay layer (the second; the content one has the components). */
function selectionRects(stage: Konva.Stage): Konva.Rect[] {
  const overlay = stage.getLayers()[1];
  return (overlay?.find<Konva.Rect>('Rect') ?? []).filter(
    (r) => r.stroke() === '#1a63cc',
  );
}

/** Internal ids of all the nodes of the content layer (they change when the drawing is redone). */
function contentIds(stage: Konva.Stage): number[] {
  return (stage.getLayers()[0]?.find(() => true) ?? []).map((n: Konva.Node) => n._id);
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('<MappingViewer/>', () => {
  it('runs on real React 19', () => {
    expect(React.version.startsWith('19')).toBe(true);
  });

  it('creates the stage in the container (StrictMode) and empties it on unmount', async () => {
    const el = await mount({ library, screen: SAMPLE_SCREEN });
    const div = viewerDiv();
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('100%');
    expect(el.querySelectorAll('canvas').length).toBe(2);
    // The StrictMode mount-unmount-mount leaves no stage behind.
    expect(Konva.stages.filter((s) => s.container() === div).length).toBe(1);
    expect(instanceCount(stageOf(div))).toBe(SAMPLE_SCREEN.instances.length);
    await act(async () => root?.unmount());
    root = undefined;
    expect(el.childElementCount).toBe(0);
    expect(Konva.stages.filter((s) => s.container() === div).length).toBe(0);
  });

  it('merges the host className and style over the default', async () => {
    await mount({
      library,
      screen: SAMPLE_SCREEN,
      className: 'mine',
      style: { height: '50%', background: 'red' },
    });
    const div = viewerDiv();
    expect(div.className).toBe('mine');
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('50%');
    expect(div.style.background).toBe('red');
  });

  it('changing screen and library updates the drawing and the warnings', async () => {
    const onWarnings = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onWarnings });
    const div = viewerDiv();
    const stage = stageOf(div);
    expect(instanceCount(stage)).toBe(SAMPLE_SCREEN.instances.length);
    const calls = onWarnings.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    await render({ library: m3Library, screen: M3_SCREEN, onWarnings });
    expect(instanceCount(stageOf(div))).toBe(M3_SCREEN.instances.length);
    expect(onWarnings.mock.calls.length).toBeGreaterThan(calls);
    // Still the same stage: it updated, did not recreate.
    expect(stageOf(div)).toBe(stage);
  });

  it('a screen without one instance draws one less', async () => {
    await mount({ library, screen: SAMPLE_SCREEN });
    const less = {
      ...SAMPLE_SCREEN,
      instances: SAMPLE_SCREEN.instances.slice(0, -1),
    };
    await render({ library, screen: less });
    expect(instanceCount(stageOf(viewerDiv()))).toBe(less.instances.length);
  });

  it('selection creates the selection rectangle and clearing it removes it', async () => {
    const id = SAMPLE_SCREEN.instances[0]?.id ?? '';
    await mount({ library, screen: SAMPLE_SCREEN });
    const stage = stageOf(viewerDiv());
    expect(selectionRects(stage).length).toBe(0);

    await render({ library, screen: SAMPLE_SCREEN, selection: [id] });
    const rects = selectionRects(stage);
    expect(rects.length).toBe(1);
    const box = SAMPLE_SCREEN.instances[0]?.box;
    expect(rects[0]?.size()).toEqual({ width: box?.width, height: box?.height });

    await render({ library, screen: SAMPLE_SCREEN, selection: [] });
    expect(selectionRects(stage).length).toBe(0);
  });

  it('hover shows the hover highlight (without firing onHover)', async () => {
    const id = SAMPLE_SCREEN.instances[0]?.id ?? '';
    const onHover = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onHover });
    const stage = stageOf(viewerDiv());
    const hoverRects = (): Konva.Rect[] =>
      (stage.getLayers()[1]?.find<Konva.Rect>('Rect') ?? []).filter(
        (r) => r.stroke() === 'rgba(26, 99, 204, 0.8)' && r.visible(),
      );
    expect(hoverRects().length).toBe(0);
    await render({ library, screen: SAMPLE_SCREEN, onHover, hover: id });
    expect(hoverRects().length).toBe(1);
    expect(onHover).not.toHaveBeenCalled();
  });

  it('passes fonts, measure, selectionColor e hoverColor ao viewer', async () => {
    const id = SAMPLE_SCREEN.instances[0]?.id ?? '';
    const measure = vi.fn(approximateMeasurer);
    await mount({
      library,
      screen: SAMPLE_SCREEN,
      measure,
      fonts: { sans: 'OwnFontSans', mono: 'OwnFontMono' },
      selectionColor: '#112233',
      hoverColor: '#445566',
      selection: [id],
      hover: SAMPLE_SCREEN.instances[1]?.id,
    });
    const stage = stageOf(viewerDiv());
    const strokes = (stage.getLayers()[1]?.find<Konva.Rect>('Rect') ?? [])
      .filter((r) => r.visible())
      .map((r) => r.stroke());
    expect(strokes).toContain('#112233');
    expect(strokes).toContain('#445566');
    expect(measure).toHaveBeenCalled();
    expect(JSON.stringify(measure.mock.calls)).toContain('OwnFontSans');
  });

  it('changing the callback does not recreate the viewer; the new callback is the one that receives the events', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onClick: first });
    const div = viewerDiv();
    const canvas = div.querySelector('canvas');
    const stage = stageOf(div);
    expect(canvas).not.toBeNull();

    await render({ library, screen: SAMPLE_SCREEN, onClick: second });
    expect(div.querySelector('canvas')).toBe(canvas);
    expect(stageOf(div)).toBe(stage);

    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('interactive turns the stage pointer on and off without recreating it', async () => {
    const onClick = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onClick, interactive: false });
    const div = viewerDiv();
    const stage = stageOf(div);
    expect(stage.listening()).toBe(false);
    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(onClick).not.toHaveBeenCalled();

    await render({ library, screen: SAMPLE_SCREEN, onClick, interactive: true });
    expect(stageOf(div)).toBe(stage);
    expect(stage.listening()).toBe(true);
    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    await render({ library, screen: SAMPLE_SCREEN, onClick });
    expect(stage.listening()).toBe(true);
    await render({ library, screen: SAMPLE_SCREEN, onClick, interactive: false });
    expect(stageOf(div)).toBe(stage);
    expect(stage.listening()).toBe(false);
  });

  it('fontsVersion redoes the drawing without recreating the stage', async () => {
    await mount({ library, screen: SAMPLE_SCREEN, fontsVersion: 0 });
    const div = viewerDiv();
    const stage = stageOf(div);
    const before = contentIds(stage);
    expect(before.length).toBeGreaterThan(0);
    await render({ library, screen: SAMPLE_SCREEN, fontsVersion: 1 });
    expect(stageOf(div)).toBe(stage);
    // `redraw` re-instantiates the content of the instances: new nodes appear.
    const after = contentIds(stage);
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((id) => !before.includes(id))).toBe(true);
  });

  it('source draws the computed screen and onSource receives the result; a new object recomputes', async () => {
    const onSource = vi.fn();
    await mount({ library: m3Library, screen: undefined, source: settings, onSource });
    const stage = stageOf(viewerDiv());
    const first = onSource.mock.calls.at(-1)?.[0] as SourceResult;
    expect(first.error).toBeUndefined();
    expect(first.screen).toBeDefined();
    expect(instanceCount(stage)).toBe(first.screen?.instances.length);
    const calls = onSource.mock.calls.length;

    // Re-render with the same source: nothing to recompute.
    await render({ library: m3Library, screen: undefined, source: settings, onSource });
    expect(onSource.mock.calls.length).toBe(calls);

    const next = structuredClone(settings);
    await render({ library: m3Library, screen: undefined, source: next, onSource });
    expect(onSource.mock.calls.length).toBeGreaterThan(calls);
    expect(stageOf(viewerDiv())).toBe(stage);
  });

  it('a source with an error does not draw and the error reaches onSource', async () => {
    const onSource = vi.fn();
    await mount({ library: m3Library, screen: M3_SCREEN, source: {}, onSource });
    expect((onSource.mock.calls.at(-1)?.[0] as SourceResult).error).toBeDefined();
    expect(instanceCount(stageOf(viewerDiv()))).toBe(0);
  });
});
