import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpec,
  serialize,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import {
  FIT_COMPONENTS,
  FIT_SPEC_ID,
  FIT_SPEC_JSON,
  LONG_LABEL,
} from '../model/fitFixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// FN2 (decisions 9 and 10 of #2825): `measure_component` resolves a `$tokenNamed` in the project's applied
// libraries, the same lookup the app's model uses: a family token that only a SECOND applied library declares
// measures like the built-in it equals, and a name nobody declares draws the default.

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const PALETTE = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'palette',
  name: 'Palette',
  version: 1,
  tokens: {
    modes: ['light', 'dark'],
    values: { 'wide-font': '"Mapping Mono", monospace' },
  },
  layers: [
    {
      id: 'palette-notes',
      name: 'Palette notes',
      color: '#00796B',
      annotationTypes: [{ id: 'swatch', name: 'Swatch', fields: [] }],
    },
  ],
};

const NAMED_LABEL = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'named-label',
  name: 'named-label',
  size: { width: 120, height: 40 },
  sizing: { width: 'hug', height: 'hug' },
  template: {
    type: 'frame',
    layout: { type: 'column', padding: 8 },
    children: [
      {
        type: 'text',
        name: 'label',
        text: { $field: 'label', default: '' },
        width: 'hug',
        height: 'hug',
        color: { $tokenNamed: { $field: 'cor' }, default: '#101010' },
        font: {
          family: {
            $tokenNamed: { $field: 'familia' },
            default: { $token: 'font-sans' },
          },
          size: 14,
          lineHeight: 20,
        },
      },
    ],
  },
};

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-token-named-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs', 'fit', 'components'), { recursive: true });
  mkdirSync(join(dir, 'specs', 'palette'), { recursive: true });
  const fitJson = {
    ...FIT_SPEC_JSON,
    layers: [
      ...FIT_SPEC_JSON.layers,
      {
        id: 'named',
        name: 'Named',
        color: '#6750A4',
        annotationTypes: [
          {
            id: 'named-label',
            name: 'Named label',
            component: 'components/named-label.json',
            fields: [
              { key: 'label', type: 'string', default: 'Ok' },
              { key: 'familia', type: 'string' },
              { key: 'cor', type: 'string' },
            ],
          },
        ],
      },
    ],
  };
  const fit = parseSpec(fitJson);
  const palette = parseSpec(PALETTE);
  if (!fit.ok) throw new Error(fit.errors.join('\n'));
  if (!palette.ok) throw new Error(palette.errors.join('\n'));
  writeFileSync(join(dir, 'specs', 'fit', 'fit.spec.json'), JSON.stringify(fitJson));
  writeFileSync(
    join(dir, 'specs', 'palette', 'palette.spec.json'),
    JSON.stringify(PALETTE),
  );
  for (const [id, component] of Object.entries({
    ...FIT_COMPONENTS,
    'named-label': NAMED_LABEL,
  })) {
    writeFileSync(
      join(dir, 'specs', 'fit', 'components', `${id}.json`),
      JSON.stringify(component),
    );
  }
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = applySpecialization(p, fit.spec, { packageSpecName: 'fit.spec.json' });
  p = applySpecialization(p, palette.spec, { packageSpecName: 'palette.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

interface Measure {
  pixels: { width: number; height: number };
}

const widthFor = async (familia: string): Promise<number> =>
  ok(
    await mcp.call<Measure>('measure_component', {
      project: 'telas',
      specId: FIT_SPEC_ID,
      type: 'named-label',
      values: { label: LONG_LABEL, familia },
    }),
  ).pixels.width;

describe('measure_component: $tokenNamed across the applied libraries', () => {
  it('a family token of the other library measures like the built-in it names', async () => {
    const wide = await widthFor('wide-font');
    expect(wide).toBe(await widthFor('font-mono'));
    expect(wide).not.toBe(await widthFor('font-sans'));
  });

  it('a name nobody declares is used as a literal stack, and an empty one draws font-sans', async () => {
    expect(await widthFor('')).toBe(await widthFor('font-sans'));
  });
});
