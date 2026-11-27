// SG3 (stage #2847, decision 9): `clipPath` into the icon's `clip`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIconsFile } from '../../../src/model/components/icons';
import { svgToIcon } from '../../../src/model/components/svgIcon';
import { shapePath } from '../../../src/model/components/svgShapes';
import { ptBRText } from '../../support/modelText';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../../fixtures/svg-icons/paint', name), 'utf8');
const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
const PATH = '<path d="M0 0h4v4z"/>';
const clipDef = (shape: string, attributes = ''): string =>
  `<defs><clipPath id="c"${attributes}>${shape}</clipPath></defs>`;
const clipped = (shape: string, attributes = ''): string =>
  clipDef(shape, attributes) + `<g clip-path="url(#c)">${PATH}</g>`;

function clipOf(text: string) {
  const result = svgToIcon(text);
  if (!result.ok) throw new Error(result.problems.map((p) => p.text).join('; '));
  return result.icon.clip;
}
const problemsOf = (text: string): string[] => {
  const result = svgToIcon(text);
  return result.ok ? [] : result.problems.map((p) => p.text);
};

describe('svgClip: what becomes the icon clip', () => {
  it("Figma's form: a full-viewBox clip around a circular one gives the circle's path", () => {
    const circle = shapePath('circle', (name) => ({ cx: '12', cy: '12', r: '12' })[name]);
    const result = svgToIcon(fixture('clip-circle.svg'));
    expect(result.ok && result.icon.clip).toEqual({ d: circle?.ok ? circle.d : '' });
    expect(result.ok && result.icon.clip).not.toHaveProperty('fillRule');
    expect(result.ok && result.icon.paths).toHaveLength(2);
    // The icon with the clip is a valid version 4 file entry.
    const file = {
      format: 'mapping-icons',
      formatVersion: 4,
      viewBox: [24, 24],
      icons: { a: (result.ok ? result.icon : {}) as never },
    };
    expect(parseIconsFile(file).ok).toBe(true);
  });

  it('clip-rule="evenodd", as an attribute or in style, gives fillRule evenodd', () => {
    const rule = (extra: string): string => `<path d="M0 0h8v8H0z" ${extra}/>`;
    expect(clipOf(svg(clipped(rule('clip-rule="evenodd"'))))?.fillRule).toBe('evenodd');
    expect(clipOf(svg(clipped(rule('style="clip-rule:evenodd"'))))?.fillRule).toBe(
      'evenodd',
    );
    expect(clipOf(svg(clipped(rule('clip-rule="nonzero"'))))).toEqual({
      d: 'M0 0h8v8H0z',
    });
  });

  it('a rect with rx, a path and a polyline are clips; the polyline is closed', () => {
    expect(
      clipOf(svg(clipped('<rect x="2" y="2" width="8" height="8" rx="2"/>')))?.d,
    ).toMatch(/^M4 2H8A2 2 0 0 1 10 4/);
    expect(clipOf(svg(clipped('<path d="M1 1h6v6z"/>')))?.d).toBe('M1 1h6v6z');
    expect(clipOf(svg(clipped('<polyline points="0,0 8,0 8,8"/>')))?.d).toBe(
      'M0 0L8 0L8 8Z',
    );
  });

  it('a clip-path on the only path works', () => {
    const body =
      clipDef('<circle cx="4" cy="4" r="4"/>') +
      '<path clip-path="url(#c)" d="M0 0h4v4z"/>';
    expect(clipOf(svg(body))?.d).toMatch(/^M8 4A4 4/);
  });

  it('ignores the paint properties of the clip shape', () => {
    const shape =
      '<rect width="8" height="8" fill="white" fill-rule="evenodd" stroke="red" stroke-width="2"/>';
    expect(clipOf(svg(clipped(shape)))?.d).toBe('M0 0H8V8H0Z');
  });

  it('ignores an unused clipPath, wherever it is', () => {
    const unused =
      '<clipPath id="u"><circle r="4"/><rect width="1" height="1"/></clipPath>';
    expect(clipOf(svg(`<defs>${unused}</defs>${PATH}`))).toBeUndefined();
    expect(clipOf(svg(`${unused}${PATH}`))).toBeUndefined();
  });

  it('a clip around every painted shape, repeated down the tree, is one clip', () => {
    const body =
      clipDef('<circle cx="4" cy="4" r="4"/>') +
      '<g clip-path="url(#c)"><path clip-path="url(#c)" d="M0 0h4v4z"/><path d="M1 1h2v2z"/></g>';
    expect(clipOf(svg(body))?.d).toMatch(/^M8 4A4 4/);
  });
});

describe('svgClip: what is named', () => {
  it.each([
    [
      'two shapes in one clipPath',
      clipped('<circle r="4"/><rect width="1" height="1"/>'),
      'unsupported in SVG: clipPath c with more than one shape',
    ],
    ['a line', clipped('<line x2="4"/>'), 'unsupported in SVG: line'],
    [
      'objectBoundingBox units',
      clipped('<circle r="4"/>', ' clipPathUnits="objectBoundingBox"'),
      'unsupported in SVG: clipPath clipPathUnits',
    ],
    [
      'a transform on the clipPath',
      clipped('<circle r="4"/>', ' transform="scale(2)"'),
      'unsupported in SVG: clipPath transform',
    ],
    [
      'a transform on the clip shape',
      clipped('<circle r="4" transform="scale(2)"/>'),
      'unsupported in SVG: circle transform',
    ],
    [
      'a clip-path on the clip shape',
      clipped('<circle r="4" clip-path="url(#c)"/>'),
      'unsupported in SVG: circle clip-path',
    ],
    [
      'a missing id',
      '<g clip-path="url(#x)">' + PATH + '</g>',
      'invalid value in SVG: g clip-path="url(#x)"',
    ],
    [
      'a url that is not a clipPath',
      '<rect id="x" width="1" height="1"/><g clip-path="url(#x)">' + PATH + '</g>',
      'invalid value in SVG: g clip-path="url(#x)"',
    ],
  ])('refuses %s', (_label, body, expected) => {
    expect(problemsOf(svg(body))).toContain(expected);
  });

  it('refuses a clip-path on the root svg, as before', () => {
    const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" clip-path="url(#c)">${clipDef('<circle r="4"/>')}${PATH}</svg>`;
    expect(problemsOf(text)).toContain('unsupported in SVG: svg clip-path');
  });

  it('refuses two different non-trivial clips in a chain, naming the inner one', () => {
    expect(problemsOf(fixture('clip-nested.svg'))).toEqual([
      'unsupported in SVG: a clip-path inside another clip-path (clip1_1_2)',
    ]);
  });

  it('refuses a clipped path next to an unclipped one', () => {
    const body = clipped('<circle r="4"/>') + '<path d="M1 1h2v2z"/>';
    expect(problemsOf(svg(body))).toEqual([
      'unsupported in SVG: the clip-path c covers only part of the icon',
    ]);
  });

  it('refuses two paths with different clips', () => {
    const defs =
      '<defs><clipPath id="a"><circle r="4"/></clipPath><clipPath id="b"><rect width="4" height="4"/></clipPath></defs>';
    const body = `${defs}<path clip-path="url(#a)" d="M0 0h4v4z"/><path clip-path="url(#b)" d="M1 1h2v2z"/>`;
    expect(problemsOf(svg(body))).toHaveLength(1);
    expect(problemsOf(svg(body))[0]).toMatch(/covers only part of the icon/);
  });

  // portuguese-guard:begin the object of the test is the pt-BR rendering of the model message
  it('has the three messages in pt-BR', () => {
    const result = svgToIcon(svg(clipped('<circle r="4"/><rect width="1" height="1"/>')));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(ptBRText(result.problems[0]!)).toBe(
        'sem suporte no SVG: clipPath c com mais de uma forma',
      );
    const nested = svgToIcon(fixture('clip-nested.svg'));
    if (!nested.ok)
      expect(ptBRText(nested.problems[0]!)).toBe(
        'sem suporte no SVG: um clip-path dentro de outro clip-path (clip1_1_2)',
      );
    const partial = svgToIcon(svg(clipped('<circle r="4"/>') + '<path d="M1 1h2v2z"/>'));
    if (!partial.ok)
      expect(ptBRText(partial.problems[0]!)).toBe(
        'sem suporte no SVG: o clip-path c cobre só parte do ícone',
      );
  });
  // portuguese-guard:end
});
