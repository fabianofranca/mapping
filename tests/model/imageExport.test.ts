import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addContainer,
  createMarking,
  exportImageName,
  imageExportTarget,
  shortCode,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

function base(): Project {
  let p = emptyProject();
  p = addContainer(p, {
    id: 'I1',
    file: 'images/lateral.jpg',
    width: 4000,
    height: 3000,
  });
  p = addContainer(p, { id: 'I2', file: 'images/frente.jpg', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 100, y: 200, width: 300, height: 100 },
  });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    rect: { x: 500, y: 150, width: 100, height: 400 },
  });
  p = createMarking(p, {
    id: 'M3',
    containerId: 'I2',
    rect: { x: 0, y: 0, width: 50, height: 50 },
  });
  return p;
}

describe('imageExportTarget', () => {
  it('two markings of the same container give their bounding box', () => {
    expect(imageExportTarget(base(), ['M1', 'M2'])).toEqual({
      ok: true,
      containerId: 'I1',
      rect: { x: 100, y: 150, width: 500, height: 400 },
      markingIds: ['M1', 'M2'],
    });
  });

  it('one marking gives its own rect', () => {
    expect(imageExportTarget(base(), ['M1'])).toEqual({
      ok: true,
      containerId: 'I1',
      rect: { x: 100, y: 200, width: 300, height: 100 },
      markingIds: ['M1'],
    });
  });

  it('the rect is clipped to the container', () => {
    const p = base();
    const wide = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M3' ? { ...m, rect: { x: -20, y: 900, width: 200, height: 300 } } : m,
      ),
    };
    const t = imageExportTarget(wide, ['M3']);
    expect(t).toMatchObject({
      ok: true,
      rect: { x: 0, y: 900, width: 180, height: 100 },
    });
  });

  it('markings on two containers give different-images', () => {
    expect(imageExportTarget(base(), ['M1', 'M3'])).toEqual({
      ok: false,
      reason: 'different-images',
    });
  });

  it('a canvas marking gives no-image', () => {
    const p = base();
    const canvas = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M1' ? { ...m, containerId: null } : m)),
    };
    expect(imageExportTarget(canvas, ['M1'])).toEqual({ ok: false, reason: 'no-image' });
  });

  it('a floating marking gives no-image', () => {
    const p = base();
    const floating = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M1' ? { ...m, containerId: null, floating: true } : m,
      ),
    };
    expect(imageExportTarget(floating, ['M1', 'M2'])).toEqual({
      ok: false,
      reason: 'no-image',
    });
  });

  it('a container without a file gives no-image', () => {
    let p = addBackgroundContainer(base(), {
      id: 'I3',
      width: 400,
      height: 300,
      background: '#ffffff',
    });
    p = createMarking(p, {
      id: 'M4',
      containerId: 'I3',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    expect(imageExportTarget(p, ['M4'])).toEqual({ ok: false, reason: 'no-image' });
  });

  it('an unknown id gives not-in-project', () => {
    expect(imageExportTarget(base(), ['M1', 'nope'])).toEqual({
      ok: false,
      reason: 'not-in-project',
    });
  });

  it('an empty list gives not-in-project', () => {
    expect(imageExportTarget(base(), [])).toEqual({
      ok: false,
      reason: 'not-in-project',
    });
  });
});

describe('exportImageName', () => {
  const container = (name: string | null, file: string | null) => ({ name, file });

  it('one marking: <image name>-<code>.png', () => {
    expect(
      exportImageName(
        container('Login', 'images/login.png'),
        { kind: 'one', code: '3f2a9c1b' },
        'selection',
      ),
    ).toBe('Login-3f2a9c1b.png');
  });

  it('a null name uses the file base name, and many markings use the word and the count', () => {
    expect(
      exportImageName(
        container(null, 'images/cadastro.webp'),
        { kind: 'many', count: 3 },
        'selection',
      ),
    ).toBe('cadastro-selection-3.png');
  });

  it('forbidden characters become -, and the ends are trimmed', () => {
    expect(
      exportImageName(
        container('a/b:c?', null),
        { kind: 'one', code: 'x1' },
        'selection',
      ),
    ).toBe('a-b-c-x1.png');
    expect(
      exportImageName(container('  a *  b..', null), { kind: 'many', count: 2 }, 'sel'),
    ).toBe('a-b-sel-2.png');
  });

  it('an empty name becomes image', () => {
    expect(
      exportImageName(container('///', null), { kind: 'one', code: 'ab' }, 'selection'),
    ).toBe('image-ab.png');
    expect(
      exportImageName(container(null, null), { kind: 'many', count: 2 }, 'selection'),
    ).toBe('image-selection-2.png');
  });

  it('the marking code comes from shortCode', () => {
    const p = base();
    const code = shortCode(p, 'm', 'M1');
    expect(
      exportImageName(container('Side', null), { kind: 'one', code }, 'selection'),
    ).toBe(`Side-${code}.png`);
  });
});
