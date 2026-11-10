import { afterEach, describe, expect, it } from 'vitest';
import { modelMessage } from '../../src/model/modelMessage';
import { MODEL_MESSAGE_TEMPLATES } from '../../src/model/messages';
import { parseSpec, type SpecIssue } from '../../src/model/spec';
import { validateLibrary } from '../../src/model/library';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { issueText } from '../../src/ui/LibraryIssueList';

// MB2 (#1357): os problemas da especialização até `layerShape` (campos, sugestões, `code`,
// exemplos, `appliesTo`, filhos, documentos, papéis, grupos, tipos e camadas) e os textos padrão
// do zod têm código e saem na língua da app. Em pt-BR o texto é igual ao `message`, salvo os
// textos padrão do zod (decisão 6: o `message` segue o do zod, em inglês, e o pt-BR é uma
// tradução); em en-US não há palavra do português fora dos parâmetros.

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function base(): Raw {
  return {
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
          { id: 't', name: 'T', fields: [{ key: 'k', type: 'string' }] },
          { id: 'u', name: 'U', fields: [] },
        ],
      },
    ],
  };
}

const layer = (s: Raw): Raw => s.layers[0];
const type = (s: Raw, i = 0): Raw => layer(s).annotationTypes[i];
const field = (s: Raw, i = 0): Raw => type(s).fields[i];

/** Cada caso: o código esperado e a mudança que o produz a partir da especialização válida. */
const CASES: readonly (readonly [string, (s: Raw) => void])[] = [
  ['spec.notEmpty', (s) => (layer(s).id = '')],
  ['spec.colorInvalid', (s) => (layer(s).color = 'red')],
  ['spec.tagInvalid', (s) => (field(s).tags = ['A B'])],
  ['spec.keyInvalid', (s) => (field(s).key = 'a b')],
  ['spec.keyReserved', (s) => (field(s).key = '_x')],
  ['spec.platformIdInvalid', (s) => (s.platforms = [{ id: 'A b', name: 'x' }])],
  ['spec.required', (s) => delete field(s).type],
  ['spec.fieldTypeInvalid', (s) => (field(s).type = 'foo')],
  ['spec.mustBeText', (s) => (type(s).component = 3)],
  [
    'spec.dateInvalid',
    (s) => (type(s).notices = [{ kind: 'removed', message: 'm', since: 'x' }]),
  ],
  [
    'spec.dateNonexistent',
    (s) => (type(s).notices = [{ kind: 'removed', message: 'm', since: '2024-02-31' }]),
  ],
  ['spec.packagePathInvalid', (s) => (type(s).component = '/abs.json')],
  ['spec.invalidExtension', (s) => (type(s).component = 'components/a.txt')],
  ['spec.typeSourceNeedsIdOrName', (s) => (type(s).sources = [{ system: 'figma' }])],
  [
    'spec.acceptsNeedsOne',
    (s) =>
      (s.layers[0].annotationTypes[0].fields = [{ key: 'r', type: 'ref', accepts: {} }]),
  ],
  [
    'spec.acceptsAnnotationsEmpty',
    (s) => (type(s).fields = [{ key: 'r', type: 'ref', accepts: { annotations: [] } }]),
  ],
  ['spec.noticeKindInvalid', (s) => (type(s).notices = [{ kind: 'x', message: 'm' }])],
  ['spec.noticeKindShape', (s) => (type(s).notices = [{ kind: 5, message: 'm' }])],
  [
    'spec.noticeRepeated',
    (s) =>
      (type(s).notices = [
        { kind: 'removed', message: 'm' },
        { kind: 'removed', message: 'm' },
      ]),
  ],
  [
    'spec.valueMustBeNumber',
    (s) => (type(s).fields = [{ key: 'n', type: 'number', default: 'a' }]),
  ],
  [
    'spec.valueMustBeDate',
    (s) => (type(s).fields = [{ key: 'd', type: 'date', default: 'a' }]),
  ],
  [
    'spec.valueMustBeOption',
    (s) => (type(s).fields = [{ key: 'e', type: 'enum', options: ['a'], default: 'z' }]),
  ],
  [
    'spec.valueNotForTable',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          columns: [{ key: 'c', type: 'string' }],
          default: 'x',
        },
      ]),
  ],
  [
    'spec.valueNotForRef',
    (s) =>
      (type(s).fields = [
        { key: 'r', type: 'ref', accepts: { free: true }, default: 'x' },
      ]),
  ],
  ['spec.suggestionsEmpty', (s) => (field(s).suggestions = [])],
  [
    'spec.suggestionsMax',
    (s) => (field(s).suggestions = Array.from({ length: 201 }, (_, i) => `s${i}`)),
  ],
  ['spec.suggestionsBlank', (s) => (field(s).suggestions = [''])],
  ['spec.suggestionsTrim', (s) => (field(s).suggestions = [' a'])],
  ['spec.suggestionsRepeated', (s) => (field(s).suggestions = ['a', 'a'])],
  [
    'spec.columnTypeNotAllowed',
    (s) =>
      (type(s).fields = [
        { key: 'tb', type: 'table', columns: [{ key: 'c', type: 'table' }] },
      ]),
  ],
  ['spec.optionsRequired', (s) => (type(s).fields = [{ key: 'e', type: 'enum' }])],
  [
    'spec.optionsBlank',
    (s) => (type(s).fields = [{ key: 'e', type: 'enum', options: [''] }]),
  ],
  [
    'spec.optionsRepeated',
    (s) => (type(s).fields = [{ key: 'e', type: 'enum', options: ['a', 'a'] }]),
  ],
  ['spec.optionsOnlyEnum', (s) => (field(s).options = ['a'])],
  [
    'spec.onlyStringField',
    (s) => (type(s).fields = [{ key: 'n', type: 'number', suggestions: ['a'] }]),
  ],
  ['spec.notTypeField', (s) => (field(s).linkedRef = 'zz')],
  [
    'spec.linkedRefNotColumn',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          columns: [{ key: 'c', type: 'string', linkedRef: 'zz' }],
        },
      ]),
  ],
  ['spec.linkedRefNotRefField', (s) => (field(s).linkedRef = 'k')],
  [
    'spec.linkedRefNotRefColumn',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          columns: [{ key: 'c', type: 'string', linkedRef: 'c' }],
        },
      ]),
  ],
  ['spec.onlyTable', (s) => (field(s).rowLabel = 'x')],
  ['spec.onlyRef', (s) => (field(s).accepts = { free: true })],
  ['spec.notAllowedForFieldType', (s) => (field(s).platforms = ['a'])],
  ['spec.acceptsRequired', (s) => (type(s).fields = [{ key: 'r', type: 'ref' }])],
  [
    'spec.refNoTags',
    (s) =>
      (type(s).fields = [
        { key: 'r', type: 'ref', accepts: { free: true }, tags: ['a'] },
      ]),
  ],
  [
    'spec.valuesOnlyEnum',
    (s) => (field(s).sources = [{ system: 'x', name: 'n', values: { a: 'b' } }]),
  ],
  [
    'spec.notInOptions',
    (s) =>
      (type(s).fields = [
        {
          key: 'e',
          type: 'enum',
          options: ['a'],
          sources: [{ system: 'x', name: 'n', values: { q: 'z' } }],
        },
      ]),
  ],
  [
    'spec.columnNoTags',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          columns: [{ key: 'c', type: 'string', tags: ['a'] }],
        },
      ]),
  ],
  [
    'spec.keyRepeated',
    (s) =>
      (type(s).fields = [
        { key: 'a', type: 'string' },
        { key: 'a', type: 'string' },
      ]),
  ],
  ['spec.columnsRequired', (s) => (type(s).fields = [{ key: 'tb', type: 'table' }])],
  [
    'spec.rowLabelRequired',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          tags: ['a'],
          columns: [{ key: 'c', type: 'string' }],
        },
      ]),
  ],
  [
    'spec.rowLabelNotStringColumn',
    (s) =>
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          rowLabel: 'zz',
          columns: [{ key: 'c', type: 'string' }],
        },
      ]),
  ],
  [
    'spec.codePathInvalid',
    (s) => (type(s).code = { android: { symbol: 'S', path: '/abs' } }),
  ],
  [
    'spec.notTypeField',
    (s) => (type(s).code = { android: { symbol: 'S', params: { zz: 'x' } } }),
  ],
  [
    'spec.codeFieldNotEnum',
    (s) => (type(s).code = { android: { symbol: 'S', values: { k: { a: 'b' } } } }),
  ],
  [
    'spec.notInOptionsOf',
    (s) => (
      (type(s).fields = [{ key: 'e', type: 'enum', options: ['a'] }]),
      (type(s).code = { android: { symbol: 'S', values: { e: { z: 'b' } } } })
    ),
  ],
  [
    'spec.variantsNoCases',
    (s) =>
      (type(s).code = { android: { symbol: 'S', variants: { field: 'k', cases: {} } } }),
  ],
  [
    'spec.variantsEmptyCase',
    (s) => (
      (type(s).fields = [{ key: 'e', type: 'enum', options: ['a'] }]),
      (type(s).code = {
        android: { symbol: 'S', variants: { field: 'e', cases: { a: {} } } },
      })
    ),
  ],
  [
    'spec.exampleValueShape',
    (s) => (type(s).examples = [{ name: 'x', values: { k: true } }]),
  ],
  [
    'spec.exampleNameRepeated',
    (s) =>
      (type(s).examples = [
        { name: 'x', values: {} },
        { name: 'x', values: {} },
      ]),
  ],
  [
    'spec.exampleBothModes',
    (s) => (type(s).examples = [{ name: 'x', values: {}, system: 'a' }]),
  ],
  ['spec.exampleNoMode', (s) => (type(s).examples = [{ name: 'x' }])],
  ['spec.requiredWithFile', (s) => (type(s).examples = [{ name: 'x', file: 'a.json' }])],
  ['spec.requiredWithSystem', (s) => (type(s).examples = [{ name: 'x', system: 'a' }])],
  [
    'spec.exampleRefNoValue',
    (s) => (
      (type(s).fields = [{ key: 'r', type: 'ref', accepts: { free: true } }]),
      (type(s).examples = [{ name: 'x', values: { r: 'a' } }])
    ),
  ],
  [
    'spec.exampleTableNeedsRows',
    (s) => (
      (type(s).fields = [
        { key: 'tb', type: 'table', columns: [{ key: 'c', type: 'string' }] },
      ]),
      (type(s).examples = [{ name: 'x', values: { tb: 'a' } }])
    ),
  ],
  [
    'spec.exampleRowNotObject',
    (s) => (
      (type(s).fields = [
        { key: 'tb', type: 'table', columns: [{ key: 'c', type: 'string' }] },
      ]),
      (type(s).examples = [{ name: 'x', values: { tb: [1] } }])
    ),
  ],
  [
    'spec.exampleNotColumn',
    (s) => (
      (type(s).fields = [
        { key: 'tb', type: 'table', columns: [{ key: 'c', type: 'string' }] },
      ]),
      (type(s).examples = [{ name: 'x', values: { tb: [{ zz: 'a' }] } }])
    ),
  ],
  [
    'spec.exampleRefCell',
    (s) => (
      (type(s).fields = [
        {
          key: 'tb',
          type: 'table',
          columns: [{ key: 'c', type: 'ref', accepts: { free: true } }],
        },
      ]),
      (type(s).examples = [{ name: 'x', values: { tb: [{ c: 'a' }] } }])
    ),
  ],
  ['spec.appliesToEmpty', (s) => (type(s).appliesTo = [])],
  ['spec.repeatedValues', (s) => (type(s).appliesTo = ['marking', 'marking'])],
  [
    'spec.arrowOnlyNoComponent',
    (s) => ((type(s).appliesTo = ['arrow']), (type(s).component = 'components/a.json')),
  ],
  [
    'spec.arrowOnlyNoFloating',
    (s) => ((type(s).appliesTo = ['arrow']), (type(s).floating = true)),
  ],
  ['spec.appliesToInvalid', (s) => (type(s).appliesTo = ['x'])],
  ['spec.appliesToShape', (s) => (type(s).appliesTo = [3])],
  ['spec.allowedChildShape', (s) => (type(s).allowedChildren = [3])],
  ['spec.groupsEmpty', (s) => (type(s).allowedChildren = [{ layer: 'l', groups: [] }])],
  ['spec.unknownKeys', (s) => (type(s).allowedChildren = [{ layer: 'l', zz: 1 }])],
  ['spec.groupsList', (s) => (type(s).allowedChildren = [{ layer: 'l', groups: 3 }])],
  ['spec.docShape', (s) => (type(s).doc = 3)],
  ['spec.docPathInvalid', (s) => (type(s).doc = { repo: 'r', path: '/abs.md' })],
  ['spec.docAnchor', (s) => (type(s).doc = { repo: 'r', path: 'a.md#x' })],
  ['spec.childRolesLabelNeedsRoles', (s) => (type(s).childRolesLabel = 'Papel')],
  [
    'spec.childRolesNeedsChildren',
    (s) => (type(s).childRoles = [{ id: 'a', name: 'A' }]),
  ],
  [
    'spec.childRolesEmpty',
    (s) => ((type(s).allowedChildren = ['u']), (type(s).childRoles = [])),
  ],
  [
    'spec.idRepeated',
    (s) => (
      (type(s).allowedChildren = ['u']),
      (type(s).childRoles = [
        { id: 'a', name: 'A' },
        { id: 'a', name: 'B' },
      ])
    ),
  ],
  ['spec.groupRepeated', (s) => (type(s).groups = ['a', 'a'])],
  ['spec.mustBeBoolean', (s) => (type(s).structural = 'x')],
  [
    'spec.structuralNoComponent',
    (s) => ((type(s).structural = true), (type(s).component = 'components/a.json')),
  ],
  ['spec.labelFieldNotString', (s) => (type(s).labelField = 'zz')],
  ['spec.onlyFormat15', (s) => ((s.formatVersion = 14), (type(s).structural = true))],
  [
    'spec.onlyFormat10',
    (s) => (
      (s.formatVersion = 9),
      (type(s).notices = [{ kind: 'removed', message: 'm' }])
    ),
  ],
  // Os textos padrão do zod, um por código que a especialização produz.
  ['spec.zod.invalid_type', (s) => (s.name = 3)],
  ['spec.zod.unrecognized_keys', (s) => (layer(s).zz = 1)],
  ['spec.zod.too_small', (s) => (field(s).label = '')],
  [
    'spec.mustBeObject',
    (s) =>
      (type(s).code = { android: { symbol: 'S', variants: { field: 'k', cases: 3 } } }),
  ],
];

const ZOD_CODES = [
  'spec.zod.invalid_type',
  'spec.zod.unrecognized_keys',
  'spec.zod.too_small',
];

function issuesOf(mutate: (s: Raw) => void): SpecIssue[] {
  const spec = base();
  mutate(spec);
  const parsed = parseSpec(spec);
  if (parsed.ok) throw new Error('a especialização devia ser inválida');
  return parsed.issues;
}

function shown(issue: SpecIssue): string {
  return messageText(
    modelMessage(issue.code ?? 'raw', issue.params ?? {}, issue.message),
  );
}

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

function withoutParams(text: string, issue: SpecIssue): string {
  let out = text;
  for (const value of Object.values(issue.params ?? {}))
    out = out.replace(`${value}`, '');
  return out;
}

describe('mensagens da especialização (até layerShape)', () => {
  it.each(CASES.map(([code, mutate], i) => [`${i} ${code}`, code, mutate] as const))(
    'produz o código: %s',
    (_name, code, mutate) => {
      const codes = issuesOf(mutate).map((i) => i.code);
      expect(codes).toContain(code);
    },
  );

  it('todo código do catálogo `spec` (menos os do zod) é produzido por um caso', () => {
    const produced = new Set(CASES.map(([code]) => code));
    const catalog = Object.keys(MODEL_MESSAGE_TEMPLATES).filter(
      (c) => c.startsWith('spec.') && !c.startsWith('spec.zod.'),
    );
    expect(catalog.length).toBeGreaterThan(60);
    for (const code of catalog) expect(produced, code).toContain(code);
  });

  it('cada texto fixo do catálogo `spec` é de um código só (o código é achado pelo texto)', () => {
    const fixed = Object.entries(MODEL_MESSAGE_TEMPLATES).filter(
      ([code, text]) =>
        code.startsWith('spec.') &&
        !code.startsWith('spec.zod.') &&
        !/\{\w+\}/.test(text),
    );
    const texts = fixed.map(([, text]) => text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('o `input` não sai do modelo', () => {
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) expect('input' in issue).toBe(false);
    }
  });

  it('pt-BR: o texto mostrado é igual ao `message`, salvo os textos padrão do zod', () => {
    locale.value = 'pt-BR';
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        if (issue.code === undefined) continue;
        if (ZOD_CODES.includes(issue.code)) {
          // Exceção declarada (decisão 6): o `message` é o do zod, em inglês; o pt-BR é traduzido.
          expect(shown(issue), issue.message).not.toBe(issue.message);
          continue;
        }
        expect(shown(issue), issue.message).toBe(issue.message);
      }
    }
  });

  it('en-US: nenhuma palavra em português fora dos parâmetros', () => {
    locale.value = 'en-US';
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        if (issue.code === undefined) continue;
        expect(withoutParams(shown(issue), issue), issue.message).not.toMatch(PORTUGUESE);
      }
    }
  });

  it('invalid_type leva `expected` e `received` (nomes do formato)', () => {
    const hit = issuesOf((s) => (s.name = 3)).find(
      (i) => i.code === 'spec.zod.invalid_type',
    );
    expect(hit?.params).toEqual({ expected: 'string', received: 'number' });
    expect(hit?.message).toMatch(/^Invalid input/);
    const missing = issuesOf((s) => delete s.name).find(
      (i) => i.code === 'spec.zod.invalid_type',
    );
    expect(missing?.params).toEqual({ expected: 'string', received: 'undefined' });
    const list = issuesOf((s) => (s.layers = {})).find(
      (i) => i.code === 'spec.zod.invalid_type',
    );
    expect(list?.params).toEqual({ expected: 'array', received: 'object' });
  });

  it('o validador da biblioteca repassa o código e traduz a linha da especialização', () => {
    locale.value = 'en-US';
    const spec = base();
    type(spec).fields = [
      { key: 'a', type: 'string' },
      { key: 'a', type: 'string' },
    ];
    const result = validateLibrary({
      files: [{ path: 's.spec.json', text: JSON.stringify(spec) }],
      specPath: 's.spec.json',
    });
    const issue = result.issues.find((i) => i.code === 'spec.keyRepeated');
    expect(issue).toBeDefined();
    expect(issue?.params).toEqual({ key: 'a' });
    expect(issueText(issue!)).toBe('key "a" repeated');
  });
});
