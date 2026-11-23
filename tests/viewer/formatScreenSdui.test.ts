// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quickJsRunner } from '../../mcp/pluginRunner';
import { approximateMeasurer } from '../../src/model';
import { loadLibrary, type TextFile } from '../../src/model/components/library';
import { formatScreens } from '../../src/model/formatScreen';

// The real `sdui` format of the `sdui-backend` example package, run through QuickJS (the MCP's executor),
// reading `examples/home.sdui.json` (stage #2059, VF1).

const ROOT = 'examples/libraries/sdui-backend';

function filesOf(dir: string): TextFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesOf(path);
    if (!/\.(json|js)$/.test(name)) return [];
    return [{ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }];
  });
}

describe('formatScreens with the real SDUI plugin', () => {
  it('turns home.sdui.json into a screen of the device size with the column children in its slot', async () => {
    const library = loadLibrary(filesOf(ROOT));
    const text = readFileSync(join(ROOT, 'examples/home.sdui.json'), 'utf8');
    const result = await formatScreens(library, text, {
      format: `${library.specId}/sdui`,
      measure: approximateMeasurer,
      run: quickJsRunner,
    });
    expect(result.error).toBeUndefined();
    expect(result.screens).toHaveLength(1);
    const screen = result.screen!;
    expect([screen.width, screen.height]).toEqual([412, 917]);
    expect(screen.name).toBe('Home');
    const byId = new Map(screen.instances.map((i) => [i.id, i]));
    const columns = screen.instances.filter((i) => i.typeId === 'sdui-column');
    const [content, bottomBar] = columns;
    expect(columns).toHaveLength(2);
    // The content column's buttons are its children; the `bottomBar` sits at the bottom edge.
    const children = screen.instances.filter((i) => i.parentId === content!.id);
    expect(children.filter((i) => i.typeId === 'sdui-button')).toHaveLength(2);
    expect(bottomBar!.parentId).toBeUndefined();
    expect(bottomBar!.box.y + bottomBar!.box.height).toBe(screen.height);
    expect(bottomBar!.box.width).toBe(screen.width);
    const signIn = screen.instances.find((i) => i.parentId === bottomBar!.id)!;
    expect(byId.get(signIn.id)!.values).toMatchObject({ label: 'Sign in' });
    // Same text, same ids: the host's selection survives a re-read.
    const again = await formatScreens(library, text, {
      format: `${library.specId}/sdui`,
      measure: approximateMeasurer,
      run: quickJsRunner,
    });
    expect(again.screens).toEqual(result.screens);
  });
});
