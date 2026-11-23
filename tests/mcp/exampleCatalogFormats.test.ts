import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, buildCatalog, drawFormatExample } from '../../src/model';
import type { LibraryFile } from '../../src/model/library';
import { quickJsRunner } from '../../mcp/pluginRunner';

// The Catalog's "File formats" page over the example packages (stage #2035, AF7): each example is
// parsed by the real plugin (QuickJS, as in the MCP) and drawn as the screens it builds.

function packageFiles(name: string): LibraryFile[] {
  const root = join(__dirname, '../../examples/libraries', name);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : [relative(root, join(dir, e.name)).split('\\').join('/')],
    );
  return walk(root).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
}

async function draw(name: string) {
  const catalog = buildCatalog(packageFiles(name));
  const format = catalog.formats[0]!;
  return drawFormatExample(catalog, format, format.examples[0]!, {
    run: quickJsRunner,
    measure: approximateMeasurer,
  });
}

describe('File formats page of the example packages', () => {
  it('draws home.sdui.json of sdui-backend as the Home screen', async () => {
    const view = await draw('sdui-backend');
    if (view.kind !== 'drawing') throw new Error(`expected a drawing, got ${view.kind}`);
    expect(view.containers).toHaveLength(1);
    expect(view.containers[0]!.name).toBe('Home');
    expect(view.containers[0]!.instances.length).toBeGreaterThanOrEqual(6);
  });

  it('draws page.measured.json of measured as the page with the card and the buttons', async () => {
    const view = await draw('measured');
    if (view.kind !== 'drawing') throw new Error(`expected a drawing, got ${view.kind}`);
    expect(view.containers).toHaveLength(1);
    expect(view.containers[0]!.instances.map((i) => i.typeId)).toEqual([
      'card',
      'button',
      'button',
      'button',
    ]);
  });
});
