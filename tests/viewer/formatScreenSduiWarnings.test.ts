import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { quickJsRunner } from '../../mcp/pluginRunner';
import type { TextMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary, type TextFile } from '../../src/model/components/library';
import { formatScreens } from '../../src/model/formatScreen';
import { type Viewer, createViewer } from '../../viewer';
import { viewerHostFonts } from '../../viewer/hostFonts';

// The screen the real `sdui` format reads from `home.sdui.json`, drawn by the viewer, must carry no
// warning of the viewer's own (the demo panel showed "content larger than the box: button"; CL1).

beforeAll(() => installFakeCanvas());

// A measurer whose widths depend on the font family, as a real browser's do: the host's default stack
// (`system-ui, …`) is wider than the model's `sans-serif`.
const measurer: TextMeasurer = (text, font) => {
  const width = text.length * (font.family.startsWith('system-ui') ? 8 : 7);
  return {
    width,
    height: font.lineHeight,
    lines: [text],
    firstBaseline: font.lineHeight * 0.75,
    lastBaseline: font.lineHeight * 0.75,
    lineCount: 1,
  };
};

const ROOT = 'examples/libraries/sdui-backend';
const mounted: Viewer[] = [];
afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
});

function filesOf(dir: string): TextFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesOf(path);
    if (!/\.(json|js)$/.test(name)) return [];
    return [{ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }];
  });
}

describe('the viewer drawing a screen read through the SDUI format', () => {
  it('home.sdui.json gives no "content larger than the box" warning', async () => {
    const library = loadLibrary(filesOf(ROOT));
    const text = readFileSync(join(ROOT, 'examples/home.sdui.json'), 'utf8');
    const result = await formatScreens(library, text, {
      format: `${library.specId}/sdui`,
      measure: measurer,
      fonts: viewerHostFonts(),
      run: quickJsRunner,
    });
    expect(result.error).toBeUndefined();
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 1000, configurable: true });
    document.body.appendChild(el);
    const viewer = createViewer(el, {
      measure: measurer,
      library,
      screen: result.screen!,
    });
    mounted.push(viewer);
    const texts = [...viewer.warnings()].flatMap(([id, list]) =>
      list.map((w) => `${id}: ${w}`),
    );
    expect(texts).toEqual([]);
  });
});
