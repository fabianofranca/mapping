// FG2: the minimal XML reader of the SVG converter (`src/model/components/svgXml.ts`).
import { describe, expect, it } from 'vitest';
import {
  SVG_MAX_BYTES,
  SVG_MAX_DEPTH,
  parseXml,
  type XmlElement,
} from '../../../src/model/components/svgXml';

function rootOf(text: string): XmlElement {
  const result = parseXml(text);
  if (!result.ok) throw new Error(result.error.text);
  return result.root;
}

function errorOf(text: string): { code: string; text: string } {
  const result = parseXml(text);
  if (result.ok) throw new Error('expected an error');
  return { code: result.error.code, text: result.error.text };
}

describe('parseXml: elements and attributes', () => {
  it('reads the root, the children and the attributes in order', () => {
    const root = rootOf('<svg a="1" b="2"><g><path d="M0 0"/></g><rect/></svg>');
    expect(root.name).toBe('svg');
    expect([...root.attributes]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(root.children.map((c) => c.name)).toEqual(['g', 'rect']);
    expect(root.children[0]?.children[0]?.attributes.get('d')).toBe('M0 0');
  });

  it('accepts both quote styles and spaces around the equals sign', () => {
    const root = rootOf(`<svg a = "x 'y'" b='say "hi"'  c="3"></svg>`);
    expect(root.attributes.get('a')).toBe(`x 'y'`);
    expect(root.attributes.get('b')).toBe('say "hi"');
    expect(root.attributes.get('c')).toBe('3');
  });

  it('reads self-closing tags with and without a space before the slash', () => {
    const root = rootOf('<svg><path d="M0 0"/><path d="M1 1" /></svg>');
    expect(root.children).toHaveLength(2);
    expect(root.children[1]?.attributes.get('d')).toBe('M1 1');
  });

  it('keeps names with a namespace prefix and dashes as written', () => {
    const root = rootOf('<svg xmlns:xlink="u" stroke-width="2"><svg:path/></svg>');
    expect(root.attributes.get('xmlns:xlink')).toBe('u');
    expect(root.attributes.get('stroke-width')).toBe('2');
    expect(root.children[0]?.name).toBe('svg:path');
  });

  it('ignores the text between elements, CDATA included', () => {
    const root = rootOf(
      '<svg>\n  hello <![CDATA[ <not-an-element> ]]> <g/> tail\n</svg>',
    );
    expect(root.children.map((c) => c.name)).toEqual(['g']);
  });

  it('decodes the five entities and the numeric references in attribute values', () => {
    const root = rootOf(
      '<svg a="&lt;&gt;&amp;&quot;&apos;" b="&#65;&#x42;&#x1F600;"></svg>',
    );
    expect(root.attributes.get('a')).toBe(`<>&"'`);
    expect(root.attributes.get('b')).toBe('AB\u{1F600}');
  });

  it('does not decode twice: &amp;lt; stays &lt;', () => {
    expect(rootOf('<svg a="&amp;lt;"/>').attributes.get('a')).toBe('&lt;');
  });

  it('records the line of each element', () => {
    const root = rootOf('<svg>\n<g>\n\n<path/></g></svg>');
    expect(root.line).toBe(1);
    expect(root.children[0]?.line).toBe(2);
    expect(root.children[0]?.children[0]?.line).toBe(4);
  });

  it('accepts a byte order mark and surrounding whitespace', () => {
    expect(rootOf('﻿ \n<svg/>\n ').name).toBe('svg');
  });
});

describe('parseXml: comments and declarations', () => {
  it('skips the <?xml?> declaration, processing instructions and comments', () => {
    const root = rootOf(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- before -->\n<svg><!-- <g> --><?pi data?><path/></svg>\n<!-- after -->',
    );
    expect(root.children.map((c) => c.name)).toEqual(['path']);
  });

  it('refuses a DOCTYPE, with the line', () => {
    const error = errorOf(
      '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg/>',
    );
    expect(error.code).toBe('svgIcon.xmlDoctype');
    expect(error.text).toContain('line 2');
  });

  it('refuses an entity declaration inside a DOCTYPE (billion laughs)', () => {
    const error = errorOf(
      '<!DOCTYPE svg [ <!ENTITY a "aaaa"> <!ENTITY b "&a;&a;&a;"> ]><svg x="&b;"/>',
    );
    expect(error.code).toBe('svgIcon.xmlDoctype');
  });

  it('refuses an ENTITY declaration outside a DOCTYPE too', () => {
    expect(errorOf('<svg><!ENTITY a "b"></svg>').code).toBe('svgIcon.xmlDoctype');
  });

  it('refuses a named entity other than the five, with the line', () => {
    const error = errorOf('<svg>\n<path d="&nbsp;"/></svg>');
    expect(error.code).toBe('svgIcon.xmlEntity');
    expect(error.text).toContain('&nbsp;');
    expect(error.text).toContain('line 2');
  });

  it('refuses a numeric reference outside the Unicode range and a lone &', () => {
    expect(errorOf('<svg a="&#0;"/>').code).toBe('svgIcon.xmlEntity');
    expect(errorOf('<svg a="&#xD800;"/>').code).toBe('svgIcon.xmlEntity');
    expect(errorOf('<svg a="&#x110000;"/>').code).toBe('svgIcon.xmlEntity');
    expect(errorOf('<svg a="a & b"/>').code).toBe('svgIcon.xmlEntity');
  });
});

describe('parseXml: malformed documents', () => {
  it('reports a tag left open before its parent closes, with the line of the closing tag', () => {
    const error = errorOf('<svg>\n<g>\n<path/>\n</svg>');
    expect(error.code).toBe('svgIcon.xmlMismatch');
    expect(error.text).toContain('line 4');
    expect(error.text).toContain('</svg>');
    expect(error.text).toContain('<g>');
  });

  it('reports the end of the text inside an open element', () => {
    const error = errorOf('<svg>\n<g>\n<path/>');
    expect(error.code).toBe('svgIcon.xmlUnclosed');
    expect(error.text).toContain('<g>');
    expect(error.text).toContain('line 2');
  });

  it('reports a mismatched closing tag with the line', () => {
    const error = errorOf('<svg>\n<g></path>\n</svg>');
    expect(error.code).toBe('svgIcon.xmlMismatch');
    expect(error.text).toContain('line 2');
    expect(error.text).toContain('</path>');
    expect(error.text).toContain('<g>');
  });

  it('reports a closing tag with nothing open', () => {
    const error = errorOf('<svg/>\n</svg>');
    expect(error.code).toBe('svgIcon.xmlSyntax');
    expect(error.text).toContain('line 2');
  });

  it.each([
    ['an unterminated comment', '<svg><!-- oops </svg>'],
    ['an unterminated tag', '<svg><path d="M0 0"'],
    ['an unterminated attribute value', '<svg a="1></svg>'],
    ['an attribute without a value', '<svg a></svg>'],
    ['an attribute without quotes', '<svg a=1></svg>'],
    ['a repeated attribute', '<svg a="1" a="2"/>'],
    ['text outside the root', 'hello <svg/>'],
    ['a second root', '<svg/><svg/>'],
    ['a tag without a name', '<svg>< /></svg>'],
    ['a stray CDATA outside the root', '<![CDATA[x]]><svg/>'],
    ['an unknown declaration', '<svg><!FOO></svg>'],
    ['an unterminated processing instruction', '<svg><?pi </svg>'],
  ])('refuses %s', (_label, text) => {
    const result = parseXml(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.text).toMatch(/line \d+|no root/);
  });

  it('refuses text with no element', () => {
    expect(errorOf('').code).toBe('svgIcon.xmlNoRoot');
    expect(errorOf('<!-- only a comment -->').code).toBe('svgIcon.xmlNoRoot');
  });
});

describe('parseXml: limits', () => {
  it('accepts a document of exactly the size limit and refuses one byte more', () => {
    const open = '<svg a="';
    const close = '"/>';
    const fill = (n: number): string => 'x'.repeat(n - open.length - close.length);
    expect(parseXml(open + fill(SVG_MAX_BYTES) + close).ok).toBe(true);
    const error = errorOf(open + fill(SVG_MAX_BYTES + 1) + close);
    expect(error.code).toBe('svgIcon.xmlTooLarge');
    expect(error.text).toContain('256 KB');
  });

  it('counts bytes, not characters', () => {
    const text = `<svg a="${'\u00e9'.repeat(SVG_MAX_BYTES / 2)}"/>`;
    expect(errorOf(text).code).toBe('svgIcon.xmlTooLarge');
  });

  it('accepts the maximum depth and refuses one level more, with the line', () => {
    const nest = (levels: number): string =>
      `${'<g>\n'.repeat(levels - 1)}<g/>${'</g>'.repeat(levels - 1)}`;
    expect(parseXml(nest(SVG_MAX_DEPTH)).ok).toBe(true);
    const error = errorOf(nest(SVG_MAX_DEPTH + 1));
    expect(error.code).toBe('svgIcon.xmlTooDeep');
    expect(error.text).toContain('64');
    expect(error.text).toContain(`line ${SVG_MAX_DEPTH + 1}`);
  });

  it('does not overflow the stack on a very deep or very long input', () => {
    expect(errorOf('<g>'.repeat(20_000)).code).toBe('svgIcon.xmlTooDeep');
    const many = `<svg>${'<path d="M0 0"/>'.repeat(10_000)}</svg>`;
    const root = rootOf(many);
    expect(root.children).toHaveLength(10_000);
  });
});
