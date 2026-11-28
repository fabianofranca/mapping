// IF1 (stage #2931): `ignoreFilters` drops every SVG `filter` and reports what it dropped;
// without it a `filter` is still an error (decision 7).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { svgToIcon, type SvgIconOptions } from '../../../src/model/components/svgIcon';

const FIXTURES = join(__dirname, '../../fixtures/svg-icons');
const innerShadow = readFileSync(join(FIXTURES, 'filter/inner-shadow.svg'), 'utf8');
const BOX = '0 0 24 24';
const svg = (body: string, attributes = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX}" ${attributes}>${body}</svg>`;
const SHAPE = 'M0 0h4v4z';
const ON: SvgIconOptions = { ignoreFilters: true };

const problemsOf = (text: string, options: SvgIconOptions = {}): string[] => {
  const result = svgToIcon(text, options);
  return result.ok ? [] : result.problems.map((p) => p.text);
};

function ok(text: string, options: SvgIconOptions = ON) {
  const result = svgToIcon(text, options);
  if (!result.ok) throw new Error(result.problems.map((p) => p.text).join('; '));
  return result;
}

describe('without ignoreFilters', () => {
  it('refuses the Figma inner shadow as before', () => {
    const problems = problemsOf(innerShadow);
    expect(problems).toContain('unsupported in SVG: g filter');
    expect(problems).toContain('unsupported in SVG: filter');
  });

  it('has no dropped key on a file without a filter', () => {
    expect('dropped' in ok(svg(`<path d="${SHAPE}"/>`), {})).toBe(false);
    expect('dropped' in ok(svg(`<path d="${SHAPE}"/>`))).toBe(false);
  });
});

describe('with ignoreFilters', () => {
  it('converts the Figma inner shadow to its drawing and reports the filter', () => {
    const result = ok(innerShadow);
    expect(result.icon.paths).toEqual([
      { d: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z', fill: true },
    ]);
    expect(result.dropped).toEqual([
      { element: 'g', attribute: 'filter', value: 'url(#filter0_i_1_2)' },
    ]);
  });

  it.each([
    ['a path', `<path filter="url(#f)" d="${SHAPE}"/>`, 'path'],
    ['a rect', '<rect filter="url(#f)" width="4" height="4"/>', 'rect'],
    ['a group', `<g filter="url(#f)"><path d="${SHAPE}"/></g>`, 'g'],
  ])('drops a filter attribute on %s and reports its element', (_name, body, element) => {
    const result = ok(svg(body));
    expect(result.icon.paths).toHaveLength(1);
    expect(result.dropped).toEqual([{ element, attribute: 'filter', value: 'url(#f)' }]);
  });

  it('drops a filter on the root svg', () => {
    const result = ok(svg(`<path d="${SHAPE}"/>`, 'filter="url(#f)"'));
    expect(result.dropped).toEqual([
      { element: 'svg', attribute: 'filter', value: 'url(#f)' },
    ]);
  });

  it('drops a filter inside style and keeps the other declarations', () => {
    const result = ok(svg(`<path style="filter:url(#f); fill:#ff0000" d="${SHAPE}"/>`));
    expect(result.icon.paths).toEqual([{ d: SHAPE, fill: true }]);
    expect(result.dropped).toEqual([
      { element: 'path', attribute: 'filter', value: 'url(#f)' },
    ]);
  });

  it('drops a CSS function and a missing id, and reports them', () => {
    const result = ok(
      svg(
        `<path filter="blur(2px)" d="${SHAPE}"/><path filter="url(#nope)" d="${SHAPE}"/>`,
      ),
    );
    expect(result.dropped).toEqual([
      { element: 'path', attribute: 'filter', value: 'blur(2px)' },
      { element: 'path', attribute: 'filter', value: 'url(#nope)' },
    ]);
  });

  it('drops filter="none" without a report', () => {
    const result = ok(
      svg(`<path filter="none" d="${SHAPE}"/><path style="filter: none" d="${SHAPE}"/>`),
    );
    expect(result.icon.paths).toHaveLength(2);
    expect('dropped' in result).toBe(false);
  });

  it('drops a filter element with no reference without a report', () => {
    const result = ok(
      svg(`<defs><filter id="f"><feOffset dy="1"/></filter></defs><path d="${SHAPE}"/>`),
    );
    expect(result.icon.paths).toHaveLength(1);
    expect('dropped' in result).toBe(false);
  });

  it('drops a filter element under svg and under a group, not only in defs', () => {
    const result = ok(
      svg(
        `<filter id="a"><feFlood/></filter><g><filter id="b"><feBlend mode="normal"/></filter><path d="${SHAPE}"/></g>`,
      ),
    );
    expect(result.icon.paths).toHaveLength(1);
    expect('dropped' in result).toBe(false);
  });

  it('gives one item per element name and value, in document order', () => {
    const result = ok(
      svg(
        [
          `<path filter="url(#a)" d="${SHAPE}"/>`,
          `<path filter="url(#a)" d="${SHAPE}"/>`,
          `<g filter="url(#a)"><path filter="url(#b)" d="${SHAPE}"/></g>`,
          `<path filter="url(#b)" d="${SHAPE}"/>`,
        ].join(''),
      ),
    );
    expect(result.dropped).toEqual([
      { element: 'path', attribute: 'filter', value: 'url(#a)' },
      { element: 'g', attribute: 'filter', value: 'url(#a)' },
      { element: 'path', attribute: 'filter', value: 'url(#b)' },
    ]);
  });

  it('still refuses a mask, and the failure has no dropped', () => {
    const result = svgToIcon(
      svg(`<g filter="url(#f)" mask="url(#m)"><path d="${SHAPE}"/></g>`),
      ON,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.text)).toEqual(['unsupported in SVG: g mask']);
    expect('dropped' in result).toBe(false);
  });
});
