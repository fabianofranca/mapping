// Named slots (#1080, SL2): the viewer draws the default content (`fallback`) of the slots that stay
// empty and not that of the slots that receive children of the screen's tree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { layoutScreen } from '../../src/model/components/layout';
import { loadLibrary } from '../../src/model/components/library';
import { type Viewer, createViewer } from '../../viewer';

beforeAll(() => installFakeCanvas());

const DIR = 'tests/fixtures/slots';
const library = loadLibrary(
  ['slots.spec.json', 'components/bar.json', 'components/pin.json'].map((path) => ({
    path,
    text: readFileSync(join(DIR, path), 'utf8'),
  })),
);

const mounted: Viewer[] = [];
afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
});

/** The texts drawn by the viewer for a bar with the given children (a pin in the named slot, if any). */
function drawnTexts(slot: string | undefined): string[] {
  const children =
    slot === undefined
      ? []
      : [{ id: 'p', typeId: 'pin', values: { label: 'PIN' }, children: [], slot }];
  const { screen } = layoutScreen(
    {
      id: 's',
      name: 'S',
      width: 360,
      height: 200,
      background: '#FFF',
      roots: [
        {
          node: {
            id: 'b',
            typeId: 'bar',
            values: { navLabel: 'NAV', actionLabel: 'ACT' },
            children,
          },
        },
      ],
    },
    library,
    approximateMeasurer,
  );
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  mounted.push(createViewer(el, { measure: approximateMeasurer, library, screen }));
  const stage = Konva.stages.find((s) => s.container() === el);
  if (!stage) throw new Error('stage not found');
  return stage.find<Konva.Text>('Text').map((t) => t.text());
}

describe('createViewer: named slots', () => {
  it('both slots empty: both default contents are drawn', () => {
    expect(drawnTexts(undefined)).toEqual(expect.arrayContaining(['NAV', 'ACT']));
  });

  it('a child in actions: its fallback is not drawn, the other slot one is', () => {
    const texts = drawnTexts('actions');
    expect(texts).toContain('PIN');
    expect(texts).toContain('NAV');
    expect(texts).not.toContain('ACT');
  });

  it('a child in navigationIcon: its fallback is not drawn, the other slot one is', () => {
    const texts = drawnTexts('navigationIcon');
    expect(texts).toContain('PIN');
    expect(texts).toContain('ACT');
    expect(texts).not.toContain('NAV');
  });
});
