import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type ProjectSpecialization,
} from '../../src/model';
import { Roots } from '../../mcp/paths';
import {
  findProject,
  loadProject,
  packageImageResolver,
  type LoadedProject,
} from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// PI2 (stage #2544): the MCP resolver reads a package image only for a specialization that the app
// treats as a package (a loaded spec and `specs/<id>/…`, `hasLoadedPackage`). Any other one is a
// missing file: the placeholder, with a note, and the image file is not read.

const EXAMPLE = join(__dirname, '../../examples/libraries/drawing-extras');
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let packaged: ProjectSpecialization;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-package-resolver-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs', 'images'), { recursive: true });
  mkdirSync(join(dir, 'specs', 'unloaded', 'images'), { recursive: true });
  cpSync(EXAMPLE, join(dir, 'specs', 'drawing-extras'), { recursive: true });
  // The image a non-package specialization would cite: `specs/plain.json` + `images/logo.png`.
  cpSync(join(EXAMPLE, 'images', 'logo.png'), join(dir, 'specs', 'images', 'logo.png'));
  // The same for a package folder whose spec did not load: only `spec: null` can refuse it.
  cpSync(
    join(EXAMPLE, 'images', 'logo.png'),
    join(dir, 'specs', 'unloaded', 'images', 'logo.png'),
  );
  const parsed = parseSpecText(
    readFileSync(join(EXAMPLE, 'drawing-extras.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'drawing-extras.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
  packaged = loaded.project.specializations.find((s) => s.id === 'drawing-extras')!;
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

/** `loaded` with one more specialization, a copy of the package one at another path. */
function withExtra(extra: ProjectSpecialization): LoadedProject {
  return {
    ...loaded,
    project: {
      ...loaded.project,
      specializations: [...loaded.project.specializations, extra],
    },
  };
}

describe('packageImageResolver: only a package specialization draws an image', () => {
  it('a package specialization draws each of its refs', async () => {
    const images = await packageImageResolver(
      roots,
      loaded,
    )([
      { specId: 'drawing-extras', asset: 'images/logo.png' },
      { specId: 'drawing-extras', asset: 'images/pattern.webp' },
      { specId: 'drawing-extras', asset: 'images/photo.jpg' },
    ]);
    for (const asset of ['images/logo.png', 'images/pattern.webp', 'images/photo.jpg']) {
      expect(images.get('drawing-extras', asset), asset).toBeDefined();
    }
    expect(images.notes).toEqual([]);
  });

  it('a standalone specialization citing an image that exists on disk gives the placeholder', async () => {
    const plain = withExtra({ ...packaged, id: 'plain', file: 'specs/plain.json' });
    const images = await packageImageResolver(
      roots,
      plain,
    )([{ specId: 'plain', asset: 'images/logo.png' }]);
    expect(images.get('plain', 'images/logo.png')).toBeUndefined();
    expect(images.notes).toHaveLength(1);
    expect(images.notes[0]).toContain('images/logo.png');
  });

  it('a specialization without a loaded spec gives the placeholder', async () => {
    const unloaded = withExtra({
      ...packaged,
      id: 'unloaded',
      file: 'specs/unloaded/unloaded.spec.json',
      spec: null,
    });
    const images = await packageImageResolver(
      roots,
      unloaded,
    )([{ specId: 'unloaded', asset: 'images/logo.png' }]);
    expect(images.get('unloaded', 'images/logo.png')).toBeUndefined();
    expect(images.notes).toHaveLength(1);
  });

  it('an unknown specId gives the placeholder and does not hide the known refs', async () => {
    const images = await packageImageResolver(
      roots,
      loaded,
    )([
      { specId: 'nobody', asset: 'images/logo.png' },
      { specId: 'drawing-extras', asset: 'images/logo.png' },
    ]);
    expect(images.get('nobody', 'images/logo.png')).toBeUndefined();
    expect(images.get('drawing-extras', 'images/logo.png')).toBeDefined();
    expect(images.notes).toHaveLength(1);
  });
});
