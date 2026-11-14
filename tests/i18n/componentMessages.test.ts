import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { modelMessage, type ModelMessage } from '../../src/model/modelMessage';
import { MODEL_MESSAGE_TEMPLATES, fillTemplate } from '../../src/model/messages';
import { componentMessages } from '../../src/model/messages/component';
import { iconsFileMessages } from '../../src/model/messages/icons';
import { originMessages } from '../../src/model/messages/origins';
import { componentCodeForText } from '../../src/model/messages/textLookup';
import {
  parseComponent,
  parseComponentText,
} from '../../src/model/components/parseComponent';
import { parseIconsText, type IconsIssue } from '../../src/model/components/icons';
import { loadSpecComponents, parseSpec, type SpecIssue } from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { originProblemText, parseOrigins } from '../../src/model/components/origin';
import { LAYOUT_ANCHORS } from '../../src/model/components/layout';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { issueText } from '../../src/ui/LibraryIssueList';
import { ptBRText } from '../support/modelText';

// MB4 (#1359): the errors and warnings of the component, the icons and the origins declaration have
// a code and come out in the app language. The model text is English and equals the en-US rendering;
// in pt-BR the rendering is the pt-BR template filled with the parameters (key names, ids and paths
// are data, so they never count as Portuguese).

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

interface Coded {
  readonly code?: string | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
  readonly message: string;
}

const asMessage = (issue: Coded): ModelMessage =>
  modelMessage(issue.code ?? 'raw', issue.params ?? {}, issue.message);

/** The text without the parameter values (data: paths, ids, the text of another module). */
function withoutParams(text: string, issue: Coded): string {
  let out = text;
  for (const value of Object.values(issue.params ?? {}))
    out = out.split(String(value)).join('');
  return out;
}

/** en-US shows the model text itself (English); pt-BR shows the pt-BR template filled in. */
function expectBothLocales(issue: Coded): void {
  const message = asMessage(issue);
  locale.value = 'pt-BR';
  expect(messageText(message), issue.message).toBe(ptBRText(message));
  expect(messageText(message), issue.message).not.toBe(issue.message);
  locale.value = 'en-US';
  const shown = messageText(message);
  expect(shown, issue.message).toBe(issue.message);
  expect(withoutParams(shown, issue), `${issue.code}: ${shown}`).not.toMatch(PORTUGUESE);
}

function expectLocalized(issues: readonly Coded[]): void {
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) {
    expect(issue.code, issue.message).toBeDefined();
    expectBothLocales(issue);
  }
}

// --- component --------------------------------------------------------------------------

function validComponent(): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'badge',
    name: 'Badge',
    size: { width: 40, height: 20 },
    template: { type: 'frame', children: [] },
  };
}

/** Each case changes the valid component to produce problems of a different group. */
const COMPONENT_CASES: readonly ((c: Raw) => void)[] = [
  (c) => {
    c.format = 'x';
    c.formatVersion = 99;
    c.id = 'A b';
    c.name = '';
    delete c.size;
    delete c.template;
  },
  (c) => {
    c.size = { width: -1, height: 'x' };
    c.minSize = { width: 100, height: 10 };
    c.preview = { a: true, b: [1] };
    c.screen = { width: 0 };
    c.extra = 1;
  },
  (c) => {
    c.template = { type: 'rect', rotation: 3, x: 1 };
  },
  (c) => {
    c.template = {
      type: 'frame',
      fill: 3,
      stroke: { color: '#fff', width: -1, sides: ['a', 'a'], cap: 'x' },
      shadow: {},
      cornerRadius: 'x',
      layout: { type: 'diag', gap: 'x' },
      children: [
        { type: 'text', text: 3, font: { size: 'x', weight: 5 } },
        { type: 'zzz' },
        { type: 'icon' },
        { type: 'image', src: 3 },
        { type: 'path' },
        { type: 'repeat' },
        { type: 'frame', children: 3 },
      ],
    };
  },
  (c) => {
    c.template = {
      type: 'frame',
      children: [
        {
          type: 'text',
          text: { $if: { $eq: ['a'] }, then: 1 },
          color: { $switch: 3, cases: 3 },
          font: { family: { $token: 'A b' }, size: { $add: [1] } },
        },
        { type: 'text', text: { $concat: 3, $field: 'x' }, runs: [{ text: 1 }] },
        { type: 'rect', fill: { $mul: [1, 2], $div: [1] }, opacity: { $gt: [1] } },
      ],
    };
  },
  (c) => {
    c.formatVersion = 1;
    c.template = {
      type: 'frame',
      fill: { $token: 'a' },
      children: [
        { type: 'repeat', field: 'x' },
        { type: 'image', src: 'x' },
      ],
    };
  },
  (c) => {
    c.formatVersion = 4;
    c.template = {
      type: 'frame',
      children: [
        { type: 'text', text: '$index' },
        {
          type: 'repeat',
          field: 'rows',
          count: 2,
          template: { type: 'text', text: 'a', x: 1 },
        },
        { type: 'text', text: { $index: true } },
      ],
    };
  },
  // `$lines` and `sizing` by expression (MC2).
  (c) => {
    c.sizing = {
      width: { $size: 'width' },
      height: { $add: [{ $lines: 'msg' }, 1] },
    };
    c.template = {
      type: 'frame',
      minHeight: { $lines: 'ausente' },
      children: [
        { type: 'text', name: 'dup', text: 'a' },
        { type: 'text', name: 'dup', text: 'b', width: { $lines: 'dup' } },
        { type: 'text', name: 'x', text: 'c', height: { $lines: '' } },
        { type: 'text', name: 'msg', text: 'd', width: { $lines: 'msg' } },
      ],
    };
  },
  // Row wrapping (MC4): `lineGap`, `maxPerLine` and `maxLines` without `wrap`.
  (c) => {
    c.template = {
      type: 'frame',
      layout: { type: 'row', lineGap: 4, maxPerLine: 2, maxLines: 1 },
      children: [
        {
          type: 'repeat',
          count: 2,
          lineGap: 1,
          template: { type: 'frame', children: [] },
        },
      ],
    };
  },
];

describe('component messages', () => {
  it.each(COMPONENT_CASES.map((fix, i) => [i, fix] as const))(
    'case %i: every problem has a code and comes out in the app language',
    (_i, fix) => {
      const input = validComponent();
      fix(input);
      const parsed = parseComponent(input);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expectLocalized(parsed.issues);
    },
  );

  it('the invalid font family warning has a code', () => {
    const input = validComponent();
    input.template = {
      type: 'frame',
      children: [{ type: 'text', text: 'a', font: { family: '"' } }],
    };
    const parsed = parseComponent(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expectLocalized(parsed.warnings);
  });

  it('invalid JSON uses library.invalidJson, with the same text', () => {
    const parsed = parseComponentText('{ não é json');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.code).toBe('library.invalidJson');
    expect(parsed.issues[0]?.message).toMatch(/^invalid JSON: /);
  });

  it('the library validator passes on the component code', () => {
    const input = validComponent();
    input.id = 'A b';
    const report = validateLibrary({
      files: [
        {
          path: 'a.spec.json',
          text: JSON.stringify({
            format: 'mapping-spec',
            formatVersion: 15,
            id: 's',
            name: 'S',
            version: 1,
            layers: [
              {
                id: 'l',
                name: 'L',
                color: '#112233',
                annotationTypes: [
                  { id: 't', name: 'T', component: 'components/a.json', fields: [] },
                ],
              },
            ],
          }),
        },
        { path: 'components/a.json', text: JSON.stringify(input) },
      ],
    });
    const issue = report.errors.find((e) => e.file === 'components/a.json');
    expect(issue?.code).toBe('component.idInvalid');
    locale.value = 'en-US';
    expect(issueText(issue!)).not.toMatch(PORTUGUESE);
  });
});

// --- icons --------------------------------------------------------------------------------

describe('icon messages', () => {
  const BAD: readonly unknown[] = [
    3,
    {
      format: 'x',
      formatVersion: 2,
      viewBox: [0, 'a'],
      extra: 1,
      icons: {},
    },
    {
      format: 'mapping-icons',
      formatVersion: 1,
      icons: {
        'A b': 1,
        ok: { viewBox: 3, paths: [] },
        two: {
          extra: 1,
          paths: [
            3,
            { d: '', fill: 3, stroke: '', width: -1, cap: 'x', join: 'y', z: 1 },
          ],
        },
      },
    },
  ];

  it.each(BAD.map((b, i) => [i, b] as const))(
    'case %i: every problem has a code and comes out in the app language',
    (_i, input) => {
      const parsed = parseIconsText(JSON.stringify(input));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expectLocalized(parsed.issues as readonly IconsIssue[]);
    },
  );

  it('invalid JSON uses library.invalidJson, with the same text', () => {
    const parsed = parseIconsText('{');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.code).toBe('library.invalidJson');
    expect(parsed.issues[0]?.message).toMatch(/^invalid JSON: /);
  });
});

// --- origins declaration (parseSpec) ------------------------------------------------

function specWith(origins: unknown): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 's',
    name: 'S',
    version: 1,
    origins,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 't', name: 'T', fields: [] }],
      },
    ],
  };
}

const ORIGIN_CASES: readonly unknown[] = [
  3,
  [3, { system: '' }, { system: 'a', name: 1, kind: 'x', extra: 1 }],
  [{ system: 'a' }, { system: 'a' }],
  [
    {
      system: 'a',
      node: { type: '', props: 3 },
      screen: {
        roots: [],
        id: 3,
        width: { path: '' },
        height: { path: 'a[' },
        anchor: 'zz',
        margin: 1,
        scrim: '',
      },
      booleans: 3,
      examples: [
        3,
        { name: '', file: 3 },
        { name: 'x', file: 'a.txt' },
        { name: 'x', file: 'a.json' },
      ],
    },
  ],
  [{ system: 'a', node: { type: 't', props: 'p', children: 'c' } }],
];

describe('origins declaration messages', () => {
  it.each(ORIGIN_CASES.map((o, i) => [i, o] as const))(
    'case %i: every problem has a code and comes out in the app language',
    (_i, origins) => {
      const parsed = parseSpec(specWith(origins));
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      const issues = parsed.issues as readonly SpecIssue[];
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.code, issue.message).toBeDefined();
        expectBothLocales(issue);
      }
    },
  );
});

// The texts of `parseOrigins(raw).problems` (`${path}: ${message}`) are pinned as literals: the
// refactoring of the problems as data (#1589, RM1) does not change a single letter, not even for the
// component library, which shows them in this format.
// The same cases as `ORIGIN_CASES`, plus a repeated origin and an invalid anchor that are otherwise valid.
const ORIGIN_TEXT_CASES: readonly (readonly [unknown, readonly string[]])[] = [
  [ORIGIN_CASES[0], ['origins: expected a list']],
  [
    ORIGIN_CASES[1],
    [
      'origins[0]: expected an object',
      'origins[1].system: expected non-empty text',
      'origins[1].node: expected an object with type, props and children',
      'origins[1].screen: required',
      'origins[2].kind: expected one of: tree, measured',
    ],
  ],
  [
    ORIGIN_CASES[2],
    [
      'origins[0].node: expected an object with type, props and children',
      'origins[0].screen: required',
      'origins[1].node: expected an object with type, props and children',
      'origins[1].screen: required',
    ],
  ],
  [
    ORIGIN_CASES[3],
    [
      'origins[0].node.type: required (key name, non-empty text)',
      'origins[0].node.props: required (key name, non-empty text)',
      'origins[0].node.children: required (key name, non-empty text)',
      'origins[0].screen.anchor: unknown key: anchor',
      'origins[0].screen.margin: unknown key: margin',
      'origins[0].screen.scrim: unknown key: scrim',
      'origins[0].screen.width.path: expected a path (non-empty text)',
      'origins[0].screen.height.path: invalid path "a[" (missing "]")',
      'origins[0].screen.roots: expected a list with at least one root',
      'origins[0].booleans: expected { "true": text, "false": text }',
      'origins[0].examples[0]: expected an object',
      'origins[0].examples[1].name: expected non-empty text',
      'origins[0].examples[1].file: expected the path of a .json file in the package',
      'origins[0].examples[2].file: invalid extension: expected .json',
      'origins[0].examples[3].name: name "x" repeated',
    ],
  ],
  [ORIGIN_CASES[4], ['origins[0].screen: required']],
  // The unknown key with `": "` in the name and the anchor with `"; use "` (the RM1 defect).
  [
    [{ system: 'a', 'x: y': 1 }],
    [
      'origins[0].x: y: unknown key: x: y',
      'origins[0].node: expected an object with type, props and children',
      'origins[0].screen: required',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('a; use b')],
    [
      'origins[0].screen.roots[0].anchor: invalid anchor: a; use b; use top-start, top, top-end, start, center, end, bottom-start, bottom, bottom-end',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('zz')],
    [
      'origins[0].screen.roots[0].anchor: invalid anchor: zz; use top-start, top, top-end, start, center, end, bottom-start, bottom, bottom-end',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('top'), ORIGIN_VALID_WITH_ANCHOR('top')],
    ['origins[1].system: repeated origin: a'],
  ],
  [
    [
      {
        ...ORIGIN_VALID_WITH_ANCHOR('top'),
        screen: {
          width: 1,
          height: 1,
          roots: [
            { path: 'a[*]', margin: 2 },
            { path: 'a[x]' },
            { path: 'a..b' },
            { path: 3 },
          ],
        },
      },
    ],
    [
      'origins[0].screen.roots[0].margin: margin is only valid with anchor',
      'origins[0].screen.roots[1].path: invalid path "a[x]" (invalid index: [x])',
      'origins[0].screen.roots[2].path: invalid path "a..b" (empty segment)',
      'origins[0].screen.roots[3].path: expected a path (non-empty text)',
    ],
  ],
  [
    [
      {
        ...ORIGIN_VALID_WITH_ANCHOR('top'),
        screen: { width: { path: 'a[*]' }, height: 1, roots: [{ path: 'a' }] },
      },
    ],
    ['origins[0].screen.width.path: "[*]" is only valid in roots[].path'],
  ],
  [
    [
      {
        ...ORIGIN_VALID_WITH_ANCHOR('top'),
        screen: { width: { path: 'a]b' }, height: 1, roots: [{ path: 'a' }] },
        examples: [{ name: 'x', file: '../a.json' }],
      },
    ],
    [
      'origins[0].screen.width.path: invalid path "a]b" (unexpected character: ])',
      'origins[0].examples[0].file: invalid path: use a path relative to the specialization folder, with "/", without "." or ".." and without a drive (e.g. components/button.json)',
    ],
  ],
  // The invalid index can be a line break: the code follows the variant's (flag `s`).
  [
    [
      {
        ...ORIGIN_VALID_WITH_ANCHOR('top'),
        screen: { width: 1, height: { path: 'a[\n]' }, roots: [{ path: 'a' }] },
      },
    ],
    ['origins[0].screen.height.path: invalid path "a[\n]" (invalid index: [\n])'],
  ],
];

function ORIGIN_VALID_WITH_ANCHOR(anchor: string): Raw {
  return {
    system: 'a',
    node: { type: 't', props: 'p', children: 'c' },
    screen: { width: 1, height: 1, roots: [{ path: 'a', anchor }] },
  };
}

describe('origins problem texts (parseOrigins)', () => {
  it.each(ORIGIN_TEXT_CASES.map((c, i) => [i, c[0], c[1]] as const))(
    'case %i: the text of each problem does not change',
    (_i, origins, texts) => {
      expect(parseOrigins(origins).problems.map(originProblemText)).toEqual(texts);
    },
  );
});

describe('origin with a user value in the key name or in the anchor (RM1 defect)', () => {
  it('the unknown key with ": " in the name comes out on the right path, with the code at the emitter', () => {
    const parsed = parseSpec(specWith([{ system: 'a', 'x: y': 1 }]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const issue = (parsed.issues as readonly SpecIssue[]).find((i) =>
      i.message.includes('unknown key'),
    );
    expect(issue).toEqual({
      path: 'origins[0].x: y',
      message: 'unknown key: x: y',
      code: 'spec.tokenKeyUnknown',
      params: { key: 'x: y' },
    });
    locale.value = 'en-US';
    expect(messageText(asMessage(issue as Coded))).toBe('unknown key: x: y');
    locale.value = 'pt-BR';
    expect(messageText(asMessage(issue as Coded))).toBe('chave desconhecida: x: y');
  });

  it('the anchor with "; use " in the value keeps the origins.anchorInvalid parameters', () => {
    const parsed = parseSpec(specWith([ORIGIN_VALID_WITH_ANCHOR('a; use b')]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const issues = parsed.issues as readonly SpecIssue[];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: 'origins[0].screen.roots[0].anchor',
      code: 'origins.anchorInvalid',
      params: { anchor: 'a; use b', anchors: LAYOUT_ANCHORS.join(', ') },
    });
  });
});

// --- component catalog (the warning for the component that did not load) ----------------------

describe('component that did not load', () => {
  it('the reason becomes `detail` and comes out translated; the text is English and pt-BR is the template', () => {
    const spec = parseSpec({
      format: 'mapping-spec',
      formatVersion: 15,
      id: 's',
      name: 'S',
      version: 1,
      icons: 'icons.json',
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [
            { id: 't', name: 'T', component: 'components/t.json', fields: [] },
          ],
        },
      ],
    });
    expect(spec.ok).toBe(true);
    if (!spec.ok) return;
    const loaded = loadSpecComponents(spec.spec, 'a/s.spec.json', 1, (path) =>
      path.endsWith('t.json')
        ? JSON.stringify({ format: 'x' })
        : JSON.stringify({ format: 'y' }),
    );
    expect(loaded.problemMessages).toHaveLength(2);
    for (const message of loaded.problemMessages) {
      expect(message.detail, message.text).toBeDefined();
      locale.value = 'pt-BR';
      expect(messageText(message)).toBe(ptBRText(message));
      expect(messageText(message)).not.toBe(message.text);
      locale.value = 'en-US';
      const shown = messageText(message);
      expect(shown).toBe(message.text);
      expect(withoutParams(shown, { message: '', params: message.params })).not.toMatch(
        PORTUGUESE,
      );
    }
  });
});

// --- the catalog --------------------------------------------------------------------------

const ORIGIN_CODED_PROBLEMS: ReadonlySet<string> = new Set([
  'origins.anchorInvalid',
  'origins.expectedKind',
  'origins.systemRepeated',
]);

describe('component, iconsFile and origins catalogs', () => {
  const ALL = { ...componentMessages, ...iconsFileMessages, ...originMessages };

  it('the codes are in the model single catalog', () => {
    for (const code of Object.keys(ALL))
      expect(MODEL_MESSAGE_TEMPLATES).toHaveProperty(code);
  });

  it('each template of the `component` catalog finds its own code by the text', () => {
    for (const [code, template] of Object.entries(componentMessages)) {
      const params = Object.fromEntries(
        [...template.matchAll(/\{(\w+)\}/g)].map((m, i) => [m[1], `v${i}`]),
      ) as Record<string, string>;
      const text = fillTemplate(template, params);
      expect(componentCodeForText(text)?.code, text).toBe(code);
    }
  });

  it('no catalog template is orphaned: its text exists in the parser', () => {
    // The variable errors (`let`/`$var`) originate in `variables.ts`, which `parseComponent` calls.
    const sources: readonly [Readonly<Record<string, string>>, string][] = [
      [
        componentMessages,
        'src/model/components/parseComponent.ts src/model/components/variables.ts',
      ],
      [iconsFileMessages, 'src/model/components/icons.ts'],
      [originMessages, 'src/model/components/origin.ts'],
    ];
    for (const [catalog, file] of sources) {
      const source = file
        .split(' ')
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n')
        .replace(/'\s*\+\s*'/g, '');
      for (const [code, template] of Object.entries(catalog)) {
        // The parser builds this one with the `COMPONENT_FORMAT` constant; case 0 above produces it.
        if (code === 'component.formatInvalid') continue;
        // The drawing warnings (`origins.draw.*`) come out of the catalog through `templateMessage` (MB5),
        // without the text in the code; `engineMessages.test.ts` produces them.
        // The translation errors (`origins.error.*`, MB6 guard) too.
        if (code.startsWith('origins.draw.') || code.startsWith('origins.error.'))
          continue;
        // The three problems with a user value come out of the catalog through `codedProblem` (#1589),
        // without the text in `origin.ts`; the literals of "origins problem texts" produce them.
        if (ORIGIN_CODED_PROBLEMS.has(code)) continue;
        const parts = template
          .split(/\{\w+\}/)
          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp(parts.join('[^\\n]*?'));
        expect(re.test(source), `${code} (${file})`).toBe(true);
      }
    }
  });
});
