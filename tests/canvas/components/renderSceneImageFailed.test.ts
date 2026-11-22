// DX7 (stage #1903, decisions 29 to 31): a remote image that failed (`failed`, `timeout`,
// `too-large`) draws the failure look: the gray fill, the X and a dashed outline in
// `palette.failedLine`. The neutral placeholder stays for the other states. `opaque` under
// `pixelSafe` draws the failure look too. Warnings carry the origin, once per origin and code.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  renderScene,
  type RemoteImageResult,
} from '../../../src/canvas/components/renderScene';
import {
  baseNode,
  translate,
  type Scene,
  type SceneNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const URL_A = 'https://cdn.example.com/a.png';
const URL_B = 'https://cdn.example.com/b.png';

function rect(fills: object[], id = 'box', y = 30): SceneNode {
  return {
    ...baseNode({
      id,
      name: id,
      width: 40,
      height: 40,
      transform: translate(30, y),
    }),
    type: 'rect',
    cornerRadius: 6,
    fills: fills as never,
  } as SceneNode;
}

function scene(...nodes: SceneNode[]): Scene {
  const [first, ...rest] = nodes;
  return { root: { ...first!, children: rest } as SceneNode, warnings: [] };
}

const draw = (
  state: RemoteImageResult,
  extra: { pixelSafe?: boolean; fills?: object[] } = {},
) =>
  renderScene(scene(rect(extra.fills ?? [{ type: 'image', url: URL_A }])), {
    remoteImage: () => state,
    pixelSafe: extra.pixelSafe,
  });

const outlines = (r: ReturnType<typeof renderScene>): Konva.Rect[] =>
  (r.byId.get('box')!.find('Rect') as Konva.Rect[]).filter((x) => (x.dash() ?? []).length > 0);

describe('DX7: the failure look', () => {
  it.each([
    ['failed', { state: 'failed' } as RemoteImageResult],
    ['timeout', { state: 'failed', reason: 'timeout' } as RemoteImageResult],
    ['too-large', 'too-large' as RemoteImageResult],
  ])('%s draws the X and the dashed outline in failedLine', (_n, state) => {
    const result = draw(state);
    const [outline] = outlines(result);
    expect(outline).toBeDefined();
    expect(outline!.dash()).toEqual([4, 3]);
    expect(outline!.strokeScaleEnabled()).toBe(false);
    expect(outline!.cornerRadius()).toBe(6);
    expect(outline!.stroke()).toBe('#d9480f');
    expect(outline!.listening()).toBe(false);
    const cross = (result.byId.get('box')!.find('Line') as Konva.Line[]).find(
      (l) => l.points().length === 8,
    );
    expect(cross?.stroke()).toBe('#d9480f');
  });

  it('uses the palette failedLine', () => {
    const r = renderScene(scene(rect([{ type: 'image', url: URL_A }])), {
      remoteImage: () => 'failed',
      palette: { failedLine: '#123456' },
    });
    expect(outlines(r)[0]!.stroke()).toBe('#123456');
  });

  it.each(['loading', 'blocked-consent', 'invalid'] as const)(
    '%s keeps the neutral placeholder',
    (state) => {
      const r = draw(state);
      expect(outlines(r)).toHaveLength(0);
      expect(r.warnings).toEqual([]);
    },
  );

  it('an empty src keeps the neutral placeholder', () => {
    const r = renderScene(scene(rect([{ type: 'image' }])), {
      remoteImage: () => 'failed',
    });
    expect(outlines(r)).toHaveLength(0);
  });

  it('opaque with pixelSafe draws the failure look and the opaque warning', () => {
    const opaque: RemoteImageResult = {
      state: 'opaque',
      image: { width: 8, height: 4 } as unknown as CanvasImageSource,
      width: 8,
      height: 4,
    };
    const safe = draw(opaque, { pixelSafe: true });
    expect(outlines(safe)).toHaveLength(1);
    expect(safe.warnings).toEqual([
      { code: 'remote-image-opaque', params: { origin: 'https://cdn.example.com' } },
    ]);
    const plain = draw(opaque);
    expect(outlines(plain)).toHaveLength(0);
    expect(plain.byId.get('box')!.find('Image')).toHaveLength(1);
    expect(plain.warnings).toEqual([]);
  });

  it('the failed warning carries the origin, once per origin', () => {
    const r = renderScene(
      scene(
        rect([{ type: 'image', url: URL_A }]),
        rect([{ type: 'image', url: URL_B }], 'other', 80),
      ),
      { remoteImage: () => 'failed' },
    );
    expect(r.warnings).toEqual([
      { code: 'remote-image-failed', params: { origin: 'https://cdn.example.com' } },
    ]);
  });
});
