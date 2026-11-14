// Format 4, phase CF7: the library icon set (`mapping-icons`) and the `icon` node.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { parseIconsFile } from '../../../src/model/components/icons';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import type { PathNode, SceneNode } from '../../../src/model/components/scene';
import { walk } from '../../../src/model/components/scene';
import { parseSpecText } from '../../../src/model/spec';
import { modelMessage } from '../../../src/model/modelMessage';
import { ptBRText } from '../../support/modelText';

const V4 = 'only allowed with formatVersion 4';

const FILE = {
  format: 'mapping-icons',
  formatVersion: 1,
  viewBox: [24, 24],
  icons: {
    check: {
      paths: [{ d: 'M5 12l5 5L20 7', stroke: true, width: 2, cap: 'round' }],
    },
  },
};

function setOf(json: unknown): IconSet {
  const result = parseIconsFile(json);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.set;
}

describe('parseIconsFile', () => {
  it('accepts the set with viewBox, paths, stroke and cap', () => {
    const result = parseIconsFile(FILE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.viewBox).toEqual([24, 24]);
      expect(result.set.icons.check?.paths[0]).toMatchObject({
        d: 'M5 12l5 5L20 7',
        stroke: true,
        width: 2,
        cap: 'round',
      });
    }
  });

  it('rejects the name "Check" by the pattern, with the path', () => {
    const result = parseIconsFile({ ...FILE, icons: { Check: FILE.icons.check } });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('icons.Check: invalid name');
  });

  it('rejects empty paths', () => {
    const result = parseIconsFile({ ...FILE, icons: { check: { paths: [] } } });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('icons.check.paths: expected');
  });

  it('rejects formatVersion 3 with a version message (1 and 2 apply)', () => {
    const result = parseIconsFile({ ...FILE, formatVersion: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('formatVersion: must be 1 or 2');
    expect(parseIconsFile({ ...FILE, formatVersion: 1 }).ok).toBe(true);
    expect(parseIconsFile({ ...FILE, formatVersion: 2 }).ok).toBe(true);
  });

  it('the invalid formatVersion message: model text in English and the whole pt-BR rendering', () => {
    const result = parseIconsFile({ ...FILE, formatVersion: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((i) => i.path === 'formatVersion');
    expect(issue?.code).toBe('iconsFile.formatVersionInvalid');
    const message = modelMessage(
      'iconsFile.formatVersionInvalid',
      issue?.params ?? {},
      issue?.message ?? '',
    );
    expect(issue?.message).toBe('must be 1 or 2');
    expect(message.text).toBe('must be 1 or 2');
    // pt-BR kept: the object of the test is the pt-BR rendering of the model message
    expect(ptBRText(message)).toBe('deve ser 1 ou 2');
  });

  it('mapping-icons 2 accepts mirror per icon (boolean); 1 is still accepted without it', () => {
    const icons = { back: { mirror: true, paths: FILE.icons.check.paths } };
    const ok = parseIconsFile({ ...FILE, formatVersion: 2, icons });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.set.icons.back?.mirror).toBe(true);
    const bad = parseIconsFile({
      ...FILE,
      formatVersion: 2,
      icons: { back: { mirror: 'yes', paths: FILE.icons.check.paths } },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors.join('\n')).toContain(
        'icons.back.mirror: expected true or false',
      );
  });

  it('mirror in formatVersion 1 is only allowed with formatVersion 2', () => {
    const result = parseIconsFile({
      ...FILE,
      icons: { back: { mirror: true, paths: FILE.icons.check.paths } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(
        'icons.back.mirror: only allowed with formatVersion 2',
      );
  });

  it('rejects an unknown key, invalid cap/join and a set without viewBox', () => {
    const bad = parseIconsFile({
      format: 'mapping-icons',
      formatVersion: 1,
      icons: { x: { paths: [{ d: 'M0 0', cap: 'pontudo', extra: 1 }] } },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const text = bad.errors.join('\n');
      expect(text).toContain('viewBox: required field');
      expect(text).toContain('icons.x.paths[0].cap');
      expect(text).toContain('icons.x.paths[0].extra: unknown key');
    }
  });
});

function component(template: unknown, version = 4): ComponentFile {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 48, height: 48 },
    template,
  } as unknown as ComponentFile;
}

const box = { x: 0, y: 0, width: 48, height: 48 };

function iconRoot(
  node: Record<string, unknown>,
  values: Record<string, string> = {},
  icons: IconSet = setOf(FILE),
) {
  const c = component({ type: 'frame', children: [{ type: 'icon', ...node }] });
  return instantiate(c, values, box, { measure: approximateMeasurer, icons });
}

const paths = (root: SceneNode): PathNode[] =>
  [...walk(root)].filter((n): n is PathNode => n.type === 'path');

describe('icon node: validation', () => {
  it('accepts a literal name and one in an expression, color and strokeWidth', () => {
    const issues = validateComponent(
      component({
        type: 'frame',
        children: [
          { type: 'icon', name: 'check', color: '#0a7', strokeWidth: 3 },
          {
            type: 'icon',
            name: { $field: 'icone' },
            color: { $token: 'x' },
            width: 'hug',
            height: 'hug',
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it('requires name and rejects an unknown key', () => {
    const issues = validateComponent(
      component({ type: 'frame', children: [{ type: 'icon', d: 'M0 0' }] }),
    );
    expect(issues).toContain('template.children[0].name: required field');
    expect(issues).toContain('template.children[0].d: unknown key: d');
  });

  it('in v3 it fails with only allowed with formatVersion 4, on the node path', () => {
    const issues = validateComponent(
      component({ type: 'frame', children: [{ type: 'icon', name: 'check' }] }, 3),
    );
    expect(issues).toContain(`template.children[0].type: ${V4}`);
  });
});

describe('icon node: scene', () => {
  it('produces the path with the node color and the icon cap', () => {
    const { root, warnings } = iconRoot({ name: 'check', color: '#0a7' });
    expect(warnings).toEqual([]);
    const [path] = paths(root);
    expect(path?.d).toBe('M5 12l5 5L20 7');
    expect(path?.stroke?.paints).toEqual([{ type: 'solid', color: '#0a7' }]);
    expect(path?.stroke?.cap).toBe('round');
    expect(path?.stroke?.width).toBe(2);
    expect(path?.fills).toEqual([]);
  });

  it('hug gives the viewBox of the set, and the icon viewBox wins over the default', () => {
    const icons = setOf({
      ...FILE,
      icons: { ...FILE.icons, dot: { viewBox: [10, 12], paths: [{ d: 'M0 0h10v12z' }] } },
    });
    const measure = (name: string) =>
      measureComponent(
        component({
          type: 'frame',
          layout: { type: 'row' },
          children: [{ type: 'icon', name, width: 'hug', height: 'hug' }],
        }),
        {},
        { width: null, height: null },
        { measure: approximateMeasurer, icons },
      );
    expect(measure('check')).toMatchObject({ width: 24, height: 24 });
    expect(measure('dot')).toMatchObject({ width: 10, height: 12 });
  });

  it('color paints only what has no color of its own; fill/stroke true use the node color', () => {
    const icons = setOf({
      ...FILE,
      icons: {
        mix: {
          paths: [
            { d: 'M0 0', fill: '#ff0000' },
            { d: 'M1 1', fill: true },
            { d: 'M2 2' },
            { d: 'M3 3', stroke: '#00ff00', width: 1.5 },
            { d: 'M4 4', stroke: true },
          ],
        },
      },
    });
    const { root } = iconRoot({ name: 'mix', color: '#112233' }, {}, icons);
    const [own, filled, plain, strokeOwn, strokeNode] = paths(root);
    expect(own?.fills).toEqual([{ type: 'solid', color: '#ff0000' }]);
    expect(filled?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
    expect(plain?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
    expect(strokeOwn?.stroke?.paints).toEqual([{ type: 'solid', color: '#00ff00' }]);
    expect(strokeOwn?.fills).toEqual([]);
    expect(strokeNode?.stroke?.paints).toEqual([{ type: 'solid', color: '#112233' }]);
  });

  it('strokeWidth changes the stroke width', () => {
    const { root } = iconRoot({ name: 'check', strokeWidth: 3.5 });
    expect(paths(root)[0]?.stroke?.width).toBe(3.5);
  });

  it('scales the viewBox paths to the node box', () => {
    const { root } = iconRoot({ name: 'check', width: 48, height: 48 });
    const icon = [...walk(root)].find((n) => n.type === 'group');
    expect(icon?.width).toBe(48);
    expect(paths(root)[0]?.transform.slice(0, 4)).toEqual([2, 0, 0, 2]);
  });

  it('an unknown name at draw time becomes a placeholder with the warning', () => {
    const { root, warnings } = iconRoot(
      { name: { $field: 'icone' } },
      { icone: 'nuvem' },
    );
    expect(warnings).toContain('unknown icon: nuvem');
    expect(paths(root)).toEqual([]);
    const unknown = [...walk(root)].find((n) => n.type === 'unknown');
    expect(unknown).toMatchObject({ sourceType: 'icon' });
  });

  it('without a declared set the icon is also unknown', () => {
    const c = component({ type: 'frame', children: [{ type: 'icon', name: 'check' }] });
    const { warnings } = instantiate(c, {}, box, { measure: approximateMeasurer });
    expect(warnings).toContain('unknown icon: check');
  });
});

describe('icons in the specialization', () => {
  const spec = (formatVersion: number) =>
    JSON.stringify({
      format: 'mapping-spec',
      formatVersion,
      id: 's',
      name: 'S',
      version: 1,
      icons: 'icons/set.json',
      layers: [],
    });

  it('in a v13 specialization it fails with the version message', () => {
    const result = parseSpecText(spec(13));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        path: 'icons',
        message: 'only allowed with formatVersion 15',
        code: 'spec.onlyFormat',
        params: { version: '15' },
      });
  });

  it('in v15 it accepts the path of a .json of the package and rejects another', () => {
    expect(parseSpecText(spec(15)).ok).toBe(true);
    const bad = parseSpecText(spec(15).replace('icons/set.json', '../set.json'));
    expect(bad.ok).toBe(false);
  });
});
