// Stage #1900, NV2: components read the named values (a composite field by dot, a whole composite in
// `font` and in a shadow), and the level 2 library checks and notices that go with it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../support/jsonSchema';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../src/model/components/parseComponent';
import {
  applyTokens,
  resolveTokens,
  tokenNotices,
  type SpecTokens,
} from '../../src/model/components/tokens';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';
import {
  isModelMessageTemplateCode,
  templateMessage,
  type ModelMessageTemplateCode,
} from '../../src/model/messages';
import { templatePtBR } from '../../src/i18n/modelMessagesTemplatesPtBR';

type Raw = Record<string, unknown>;

const TOKENS: SpecTokens = {
  values: {
    gap: 8,
    ink: '#112233',
    title: {
      family: 'Georgia',
      size: 22,
      weight: 600,
      lineHeight: 28,
      letterSpacing: 1,
    },
    'elevation-1': { color: '#00000040', x: 0, y: 2, blur: 6, spread: 1 },
    'elevation-2': { color: '#00000080', x: 0, y: 4, blur: 12, spread: 0 },
    old: { $value: 4, $notices: [{ kind: 'deprecated', message: 'use gap' }] },
    gone: { $value: '#ff0000', $notices: [{ kind: 'removed', message: 'use ink' }] },
    oldtitle: {
      $value: { size: 10, lineHeight: 12 },
      $notices: [{ kind: 'deprecated', message: 'use title' }],
    },
  },
};

function file(template: unknown): ComponentFile {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  } as ComponentFile;
}

const applied = (template: Raw): Raw =>
  applyTokens(file(template), resolveTokens(TOKENS, {})).template as unknown as Raw;

describe('substitution: a field by dot and a whole composite', () => {
  it('a dotted $token draws the composite field (number, alpha, inside a list)', () => {
    const out = applied({
      type: 'rect',
      cornerRadius: { $token: 'title.size' },
      stroke: { color: '#000', width: { $token: 'title.lineHeight' } },
    });
    expect(out.cornerRadius).toBe(22);
    expect((out.stroke as Raw).width).toBe(28);
  });

  it('font with a whole composite gives its fields and keeps the explicit keys', () => {
    const out = applied({
      type: 'text',
      text: 'x',
      font: { $token: 'title', align: 'center' },
    });
    expect(out.font).toEqual({
      family: 'Georgia',
      size: 22,
      weight: 600,
      lineHeight: 28,
      letterSpacing: 1,
      align: 'center',
    });
  });

  it('a bare font $token gives only the composite fields', () => {
    const out = applied({ type: 'text', text: 'x', font: { $token: 'title' } });
    expect(out.font).toEqual({
      family: 'Georgia',
      size: 22,
      weight: 600,
      lineHeight: 28,
      letterSpacing: 1,
    });
  });

  it('an explicit key next to the font $token wins, also a $token one', () => {
    const out = applied({
      type: 'text',
      text: 'x',
      font: { $token: 'title', size: 30, weight: { $token: 'gap' } },
    });
    expect((out.font as Raw).size).toBe(30);
    expect((out.font as Raw).weight).toBe(8);
    expect((out.font as Raw).lineHeight).toBe(28);
  });

  it('a whole composite in a shadow object', () => {
    const out = applied({ type: 'rect', shadow: { $token: 'elevation-1' } });
    expect(out.shadow).toEqual({ color: '#00000040', x: 0, y: 2, blur: 6, spread: 1 });
  });

  it('a whole composite in a shadow list item, with an explicit key winning', () => {
    const out = applied({
      type: 'rect',
      shadow: [
        { $token: 'elevation-1', blur: 20 },
        { $token: 'elevation-2' },
        { color: '#000', x: 1 },
      ],
    });
    expect(out.shadow).toEqual([
      { color: '#00000040', x: 0, y: 2, blur: 20, spread: 1 },
      { color: '#00000080', x: 0, y: 4, blur: 12, spread: 0 },
      { color: '#000', x: 1 },
    ]);
  });

  it('only the keys valid for the object are spread', () => {
    const out = applied({
      type: 'text',
      text: 'x',
      font: { $token: 'elevation-1' },
    });
    expect(out.font).toEqual({});
  });
});

describe('parseComponent: font and shadow accept a $token', () => {
  it('validates $token next to the other keys and collects whole-composite references', () => {
    const parsed = parseComponent(
      file({
        type: 'frame',
        shadow: [{ $token: 'elevation-1', blur: 3 }],
        children: [
          { type: 'text', text: 'x', font: { $token: 'title', align: 'center' } },
          { type: 'rect', shadow: { $token: 'elevation-2' } },
          { type: 'rect', cornerRadius: { $token: 'title.size' } },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tokenRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'title', whole: 'font' }),
        expect.objectContaining({ name: 'elevation-1', whole: 'shadow' }),
        expect.objectContaining({ name: 'elevation-2', whole: 'shadow' }),
        expect.objectContaining({ name: 'title.size', kind: 'number' }),
      ]),
    );
  });

  it('keeps validating the other keys next to $token', () => {
    const issues = validateComponent(
      file({ type: 'text', text: 'x', font: { $token: 'title', size: 'big' } }),
    );
    expect(issues.some((m) => m.includes('font.size'))).toBe(true);
  });

  it('rejects a non-string or invalid reference name in font and shadow', () => {
    expect(
      validateComponent(file({ type: 'text', text: 'x', font: { $token: 3 } })).length,
    ).toBeGreaterThan(0);
    expect(
      validateComponent(file({ type: 'rect', shadow: { $token: 'Bad Name' } })).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a bad field name after the dot', () => {
    expect(
      validateComponent(file({ type: 'rect', cornerRadius: { $token: 'title.Size' } }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateComponent(file({ type: 'rect', cornerRadius: { $token: 'title.a.b' } }))
        .length,
    ).toBeGreaterThan(0);
  });

  it('a shadow without $token still requires color', () => {
    expect(
      validateComponent(file({ type: 'rect', shadow: { x: 1 } })).length,
    ).toBeGreaterThan(0);
  });
});

const SPEC_PATH = 'nv.spec.json';

function spec(tokens: unknown): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 23,
    id: 'nv',
    name: 'Nv',
    version: 1,
    tokens,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/nv.json', fields: [] },
        ],
      },
    ],
  };
}

function validate(children: Raw[], tokens: unknown = TOKENS) {
  return validateLibrary({
    specPath: SPEC_PATH,
    level: 2,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(tokens)) },
      {
        path: 'components/nv.json',
        text: JSON.stringify(file({ type: 'frame', children })),
      },
    ],
  });
}

const errors = (r: ReturnType<typeof validate>) =>
  r.errors.map((e) => [e.path, e.message]);
const warnings = (r: ReturnType<typeof validate>) =>
  r.warnings.map((e) => [e.path, e.message]);

describe('level 2: composites read by components', () => {
  it('valid readings pass', () => {
    const r = validate([
      { type: 'rect', cornerRadius: { $token: 'title.size' }, fill: { $token: 'ink' } },
      { type: 'text', text: 'x', font: { $token: 'title', align: 'center' } },
      { type: 'rect', shadow: { $token: 'elevation-1' } },
      { type: 'rect', shadow: [{ $token: 'elevation-1' }, { $token: 'elevation-2' }] },
    ]);
    expect(errors(r)).toEqual([]);
  });

  it('a whole composite in a scalar position is an error', () => {
    const r = validate([{ type: 'rect', cornerRadius: { $token: 'title' } }]);
    expect(errors(r)).toContainEqual([
      'template.children[0].cornerRadius',
      'the token "title" is a composite; read one field (title.<field>)',
    ]);
  });

  it('a field of a scalar, or a field the composite lacks, is an error', () => {
    const r = validate([
      { type: 'rect', cornerRadius: { $token: 'gap.size' } },
      { type: 'rect', cornerRadius: { $token: 'title.nope' } },
      { type: 'rect', cornerRadius: { $token: 'missing.size' } },
    ]);
    expect(errors(r)).toEqual([
      ['template.children[0].cornerRadius', 'the token "gap" has no field "size"'],
      ['template.children[1].cornerRadius', 'the token "title" has no field "nope"'],
      [
        'template.children[2].cornerRadius',
        'the token "missing" does not exist in the specialization tokens',
      ],
    ]);
  });

  it('a dotted field with the wrong kind cites the dotted name', () => {
    const r = validate([{ type: 'rect', fill: { $token: 'title.size' } }]);
    expect(errors(r)).toContainEqual([
      'template.children[0].fill',
      'the token "title.size" is a number, but a color is expected here',
    ]);
  });

  it('a scalar in font or shadow is "not a composite"', () => {
    const r = validate([
      { type: 'text', text: 'x', font: { $token: 'gap' } },
      { type: 'rect', shadow: { $token: 'ink' } },
    ]);
    expect(errors(r)).toEqual([
      ['template.children[0].font.$token', 'the token "gap" is not a composite'],
      ['template.children[1].shadow.$token', 'the token "ink" is not a composite'],
    ]);
  });

  it('a missing token in font keeps the missing message', () => {
    const r = validate([{ type: 'text', text: 'x', font: { $token: 'nope' } }]);
    expect(errors(r)).toEqual([
      [
        'template.children[0].font.$token',
        'the token "nope" does not exist in the specialization tokens',
      ],
    ]);
  });

  it('a field that is not a key of font, or of shadow, is an error', () => {
    const r = validate([
      { type: 'text', text: 'x', font: { $token: 'elevation-1' } },
      { type: 'rect', shadow: { $token: 'title' } },
      { type: 'rect', shadow: [{ $token: 'title' }] },
    ]);
    const messages = errors(r).map(([, m]) => m);
    expect(messages).toContain(
      'field "color" of the token "elevation-1" is not a key of font',
    );
    expect(messages).toContain(
      'field "x" of the token "elevation-1" is not a key of font',
    );
    expect(messages).toContain(
      'field "family" of the token "title" is not a key of shadow',
    );
    expect(errors(r)).toContainEqual([
      'template.children[2].shadow[0].$token',
      'field "size" of the token "title" is not a key of shadow',
    ]);
    expect(errors(r)).toContainEqual([
      'template.children[0].font.$token',
      'field "color" of the token "elevation-1" is not a key of font',
    ]);
  });

  it('a valid field with the wrong kind is the wrong-kind error', () => {
    const wrong: SpecTokens = {
      values: {
        bad: { family: 3, size: '#ffffff' },
        sh: { color: 4, x: 1 },
      },
    };
    const r = validate(
      [
        { type: 'text', text: 'x', font: { $token: 'bad' } },
        { type: 'rect', shadow: { $token: 'sh' } },
      ],
      wrong,
    );
    expect(errors(r)).toEqual(
      expect.arrayContaining([
        [
          'template.children[0].font.$token',
          'the token "bad.family" is a number, but a font family is expected here',
        ],
        [
          'template.children[0].font.$token',
          'the token "bad.size" is a color, but a number is expected here',
        ],
        [
          'template.children[1].shadow.$token',
          'the token "sh.color" is a number, but a color is expected here',
        ],
      ]),
    );
  });
});

describe('level 2: deprecated and removed tokens warn', () => {
  it('tokenNotices lists the notices of a token', () => {
    expect(tokenNotices(TOKENS, 'old').map((n) => n.kind)).toEqual(['deprecated']);
    expect(tokenNotices(TOKENS, 'gap')).toEqual([]);
    expect(tokenNotices(undefined, 'old')).toEqual([]);
  });

  it('a read of a deprecated or removed token is a warning, never an error', () => {
    const r = validate([
      { type: 'rect', cornerRadius: { $token: 'old' } },
      { type: 'rect', fill: { $token: 'gone' } },
    ]);
    expect(errors(r)).toEqual([]);
    expect(warnings(r)).toEqual(
      expect.arrayContaining([
        ['template.children[0].cornerRadius', 'the token "old" is deprecated: use gap'],
        ['template.children[1].fill', 'the token "gone" is removed: use ink'],
      ]),
    );
  });

  it('a dotted or whole read cites the base token', () => {
    const r = validate([
      { type: 'rect', cornerRadius: { $token: 'oldtitle.size' } },
      { type: 'text', text: 'x', font: { $token: 'oldtitle' } },
    ]);
    expect(errors(r)).toEqual([]);
    expect(warnings(r)).toEqual(
      expect.arrayContaining([
        [
          'template.children[0].cornerRadius',
          'the token "oldtitle" is deprecated: use title',
        ],
        [
          'template.children[1].font.$token',
          'the token "oldtitle" is deprecated: use title',
        ],
      ]),
    );
  });
});

describe('messages: every NV2 code has a pt-BR template', () => {
  const CODES = [
    'library.tokenIsComposite',
    'library.tokenNoField',
    'library.tokenNotComposite',
    'library.tokenFieldNotKey.font',
    'library.tokenFieldNotKey.shadow',
    'library.tokenDeprecated',
    'library.tokenRemoved',
  ];
  it.each(CODES)('%s is in the catalog and has a pt-BR text', (code) => {
    expect(isModelMessageTemplateCode(code), code).toBe(true);
    const text = templateMessage(code as ModelMessageTemplateCode, {
      name: 'x',
      field: 'f',
      note: 'm',
    });
    expect(text.text).not.toContain('{');
    const ptBR = (templatePtBR as Readonly<Record<string, string | undefined>>)[
      `model.${code}`
    ];
    expect(ptBR, code).toBeDefined();
    expect(ptBR).not.toBe(text.text);
  });

  it('the issues carry a code', () => {
    const r = validate([{ type: 'rect', cornerRadius: { $token: 'title' } }]);
    const codes = r.errors.map((e: LibraryIssue) => e.code);
    expect(codes).toContain('library.tokenIsComposite');
  });
});

describe('the whole-composite $token takes a plain token name', () => {
  const schema: Record<string, unknown> = JSON.parse(
    readFileSync(new URL('../../docs/component.schema.json', import.meta.url), 'utf8'),
  );
  const PLAIN = 'expected a token name ([a-z0-9][a-z0-9-]*)';

  it.each([
    ['font', { type: 'text', text: 'x', font: { $token: 'title.size' } }],
    ['shadow', { type: 'rect', shadow: { $token: 'elevation-1.blur' } }],
    ['shadow list', { type: 'rect', shadow: [{ $token: 'elevation-1.blur' }] }],
  ])(
    'the parser rejects a dotted name in %s without suggesting name.field',
    (_n, node) => {
      const issues = validateComponent(file(node));
      expect(issues).toContain(
        `template.${Object.keys(node).includes('font') ? 'font' : 'shadow'}${Array.isArray((node as Raw).shadow) ? '[0]' : ''}.$token: ${PLAIN}`,
      );
      expect(issues.join('\n')).not.toContain('name.field');
    },
  );

  it.each([
    ['font', { type: 'text', text: 'x', font: { $token: 'title.size' } }],
    ['shadow', { type: 'rect', shadow: { $token: 'elevation-1.blur' } }],
  ])('the schema rejects a dotted name in %s', (_n, node) => {
    const root = { type: 'frame', children: [node] };
    expect(checkSchema(schema, file(root)).length).toBeGreaterThan(0);
  });

  it('the schema still accepts a plain composite name in font and shadow', () => {
    const node = {
      type: 'frame',
      shadow: { $token: 'elevation-1' },
      children: [{ type: 'text', text: 'x', font: { $token: 'title', align: 'center' } }],
    };
    expect(checkSchema(schema, file(node))).toEqual([]);
  });
});
