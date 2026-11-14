import { afterEach, describe, expect, it } from 'vitest';
import { modelMessage } from '../../src/model/modelMessage';
import { MODEL_MESSAGE_TEMPLATES } from '../../src/model/messages';
import { parseSpec, type SpecIssue } from '../../src/model/spec';
import { validateLibrary } from '../../src/model/library';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { SPEC_PATTERN_CODES, specCodeForText } from '../../src/model/messages/textLookup';
import { specMessages } from '../../src/model/messages/spec';
import { specMsg } from '../../src/model/specIssueCode';
import { issueText } from '../../src/ui/LibraryIssueList';
import { ptBRText } from '../support/modelText';

// MB2 (#1357): the specialization problems up to `layerShape` (fields, suggestions, `code`,
// examples, `appliesTo`, children, documents, roles, groups, types and layers) and the default
// zod texts have a code and come out in the app's language. In pt-BR the text equals the `message`, except for the
// default zod texts (decision 6: the `message` follows zod's, in English, and the pt-BR is a
// translation); in en-US there is no Portuguese word outside the parameters.

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

const container = (extra: Raw): Raw => ({
  id: 'c',
  name: 'C',
  width: 10,
  height: 10,
  ...extra,
});
const font = (extra: Raw): Raw => ({ family: 'F', file: 'fonts/a.ttf', ...extra });

/** A 1 → 2 migration with the given step (the specialization version goes up to 2). */
function steps(step: Raw): (s: Raw) => void {
  return (s) => {
    s.version = 2;
    s.migrations = [{ from: 1, to: 2, steps: [step] }];
  };
}

/** Type `t` gains table `tb` with string column `c`. */
function tableOf(s: Raw): void {
  type(s).fields = [
    { key: 'k', type: 'string' },
    { key: 'tb', type: 'table', columns: [{ key: 'c', type: 'string' }] },
  ];
}

/** Type `t` gains `allowedChildren` and role `r1`. */
function withRoles(s: Raw): void {
  type(s).allowedChildren = ['u'];
  type(s).childRoles = [{ id: 'r1', name: 'R1' }];
  s.formatVersion = 15;
  layer(s).annotationTypes.push({ id: 'w', name: 'W', fields: [] });
}

/** Origin declared in `origins`; the field cites the system without `path`. */
function withOrigin(s: Raw, origin: Raw): void {
  s.origins = [origin];
  field(s).sources = [{ system: origin.system }];
}

/** The field cites the declared system with the given `path`. */
function fieldPath(s: Raw, path: string): void {
  s.origins = [{ system: 'sys' }];
  field(s).sources = [{ system: 'sys', path }];
}

/** Each case: the expected code and the change that produces it from the valid specialization. */
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
  ['spec.onlyFormat', (s) => ((s.formatVersion = 14), (type(s).structural = true))],
  [
    'spec.onlyFormat',
    (s) => (
      (s.formatVersion = 9),
      (type(s).notices = [{ kind: 'removed', message: 'm' }])
    ),
  ],
  // MB3: repositories, platforms, containers, sources and migrations (file shapes).
  [
    'spec.urlInvalid',
    (s) => (s.platforms = [{ id: 'a', name: 'A', repo: { url: 'x' } }]),
  ],
  [
    'spec.urlTemplateNeedsPath',
    (s) =>
      (s.platforms = [
        {
          id: 'a',
          name: 'A',
          repo: { url: 'https://a.b', urlTemplate: 'https://a.b/x' },
        },
      ]),
  ],
  ['spec.repoIdInvalid', (s) => (s.docRepos = [{ id: 'A b', url: 'https://a.b' }])],
  ['spec.mustBeNumber', (s) => (s.containers = [container({ width: 'x' })])],
  ['spec.mustBeInteger', (s) => (s.containers = [container({ width: 1.5 })])],
  ['spec.minOne', (s) => (s.containers = [container({ width: 0 })])],
  ['spec.containerSideMax', (s) => (s.containers = [container({ width: 999999 })])],
  ['spec.containerIdInvalid', (s) => (s.containers = [container({ id: 'A b' })])],
  ['spec.fontWeightInvalid', (s) => (s.fonts = [font({ weight: 5 })])],
  ['spec.fontStyleInvalid', (s) => (s.fonts = [font({ style: 'x' })])],
  [
    'spec.mustBeTextOrNumber',
    steps({ op: 'fill-field', type: 't', field: 'k', default: true }),
  ],
  ['spec.migrationModeRemoveType', steps({ op: 'remove-type', type: 'zz', mode: 'x' })],
  [
    'spec.migrationModeRemoveRole',
    steps({ op: 'remove-role', type: 't', role: 'r', mode: 'x' }),
  ],
  ['spec.migrationOpInvalid', steps({ op: 'zz' })],
  [
    'spec.notEmptyList',
    (s) => ((s.version = 2), (s.migrations = [{ from: 1, to: 2, steps: [] }])),
  ],
  ['spec.formatInvalid', (s) => (s.format = 'x')],
  ['spec.formatVersionInvalid', (s) => (s.formatVersion = 99)],
  [
    'spec.onlyFormat',
    (s) => ((s.formatVersion = 1), (s.platforms = [{ id: 'a', name: 'A' }])),
  ],
  // External sources and origins
  [
    'spec.sourceOnlyOrigins',
    (s) => (field(s).sources = [{ system: 'figma', name: 'n', path: 'a' }]),
  ],
  ['spec.sourcePathRequired', (s) => withOrigin(s, { system: 'sys' })],
  ['spec.sourceNameRequired', (s) => (field(s).sources = [{ system: 'figma' }])],
  ['spec.fieldPathEmptySegment', (s) => fieldPath(s, 'a.')],
  ['spec.fieldPathMissingBracket', (s) => fieldPath(s, 'a[')],
  ['spec.fieldPathBadIndex', (s) => fieldPath(s, 'a[x]')],
  ['spec.fieldPathBadChar', (s) => fieldPath(s, 'a]')],
  ['spec.fieldPathWildcard', (s) => fieldPath(s, 'a[*]')],
  [
    'spec.ignoreRepeated',
    (s) => (
      (s.origins = [{ system: 'sys' }]),
      (type(s).sources = [{ system: 'sys', ignore: ['a', 'a'] }])
    ),
  ],
  [
    'spec.exampleSystemUndeclared',
    (s) => (type(s).examples = [{ name: 'x', system: 'zz', file: 'a.json' }]),
  ],
  [
    'spec.fontRepeated',
    (s) => (s.fonts = [font({ weight: 400 }), font({ weight: 400 })]),
  ],
  ['spec.fontRepeatedNoWeight', (s) => (s.fonts = [font({}), font({})])],
  [
    'spec.platformUndeclared',
    (s) => (
      (s.platforms = [{ id: 'a', name: 'A' }]),
      (type(s).code = { zz: { symbol: 'S' } })
    ),
  ],
  ['spec.codeNeedsPlatforms', (s) => (type(s).code = { a: { symbol: 'S' } })],
  [
    'spec.typeIdRepeated',
    (s) => layer(s).annotationTypes.push({ id: 't', name: 'X', fields: [] }),
  ],
  // Migrations
  [
    'spec.migrationFromRepeated',
    (s) => (
      (s.version = 3),
      (s.migrations = [
        { from: 1, to: 2, steps: [{ op: 'remove-type', type: 'zz', mode: 'delete' }] },
        { from: 1, to: 3, steps: [{ op: 'remove-type', type: 'zz', mode: 'delete' }] },
      ])
    ),
  ],
  [
    'spec.migrationToGreater',
    (s) => (
      (s.version = 3),
      (s.migrations = [
        { from: 2, to: 1, steps: [{ op: 'remove-type', type: 'zz', mode: 'delete' }] },
      ])
    ),
  ],
  [
    'spec.migrationToMax',
    (s) => (
      (s.version = 2),
      (s.migrations = [
        { from: 1, to: 5, steps: [{ op: 'remove-type', type: 'zz', mode: 'delete' }] },
      ])
    ),
  ],
  [
    'spec.migrationColumnNotEnum',
    (s) => (
      tableOf(s),
      steps({ op: 'map-values', type: 't', field: 'tb.c', values: { a: 'b' } })(s)
    ),
  ],
  ['spec.fieldRefManyDots', steps({ op: 'remove-field', type: 't', field: 'a.b.c' })],
  ['spec.fieldRefEmptyPart', steps({ op: 'remove-field', type: 't', field: 'tb.' })],
  [
    'spec.roleNotOfType',
    (s) => (withRoles(s), steps({ op: 'set-role', type: 't', role: 'zz' })(s)),
  ],
  [
    'spec.roleStillExists',
    (s) => (
      withRoles(s),
      steps({ op: 'remove-role', type: 't', role: 'r1', mode: 'clear' })(s)
    ),
  ],
  ['spec.typeNotInVersion', steps({ op: 'remove-field', type: 'zz', field: 'k' })],
  [
    'spec.typeNoRoles',
    (s) => (withRoles(s), steps({ op: 'set-role', type: 'u', role: 'r1' })(s)),
  ],
  ['spec.typeStillExists', steps({ op: 'remove-type', type: 't', mode: 'delete' })],
  [
    'spec.notFieldOfType',
    steps({ op: 'rename-field', type: 't', from: 'old', to: 'zz' }),
  ],
  [
    'spec.notTableOfType',
    steps({ op: 'fill-field', type: 't', field: 'k.c', default: 'x' }),
  ],
  [
    'spec.notColumnOfTable',
    (s) => (
      tableOf(s),
      steps({ op: 'fill-field', type: 't', field: 'tb.zz', default: 'x' })(s)
    ),
  ],
  ['spec.fieldStillExists', steps({ op: 'remove-field', type: 't', field: 'k' })],
  [
    'spec.columnStillExists',
    (s) => (tableOf(s), steps({ op: 'remove-field', type: 't', field: 'tb.c' })(s)),
  ],
  // Allowed children, groups, document repositories and owner
  ['spec.layerNotFound', (s) => (type(s).allowedChildren = [{ layer: 'zz' }])],
  [
    'spec.layerIsOwn',
    (s) => ((s.formatVersion = 12), (type(s).allowedChildren = [{ layer: 'l' }])),
  ],
  [
    'spec.typeSameLayer',
    (s) => ((s.formatVersion = 12), (type(s).allowedChildren = ['u'])),
  ],
  ['spec.typeNotFound', (s) => (type(s).allowedChildren = ['zz'])],
  [
    'spec.groupNotInLayer',
    (s) => (type(s).allowedChildren = [{ layer: 'l', groups: ['g'] }]),
  ],
  ['spec.docRepoUndeclared', (s) => (type(s).doc = { repo: 'zz', path: 'a.md' })],
  ['spec.ownerNoneLists', (s) => (type(s).requiresOwner = true)],
  [
    'spec.ownerOnlySelf',
    (s) => ((type(s).allowedChildren = ['t']), (type(s).requiresOwner = true)),
  ],
  // Tokens and icons
  ['spec.tokensShape', (s) => (s.tokens = 'x')],
  ['spec.tokenKeyUnknown', (s) => (s.tokens = { modes: ['a'], values: {}, zz: 1 })],
  ['spec.tokenModesEmpty', (s) => (s.tokens = { modes: [], values: {} })],
  ['spec.tokenModeInvalid', (s) => (s.tokens = { modes: ['A b'], values: {} })],
  ['spec.tokenModeRepeated', (s) => (s.tokens = { modes: ['a', 'a'], values: {} })],
  ['spec.tokenNameInvalid', (s) => (s.tokens = { modes: ['a'], values: { 'A b': 'x' } })],
  ['spec.tokenValueShape', (s) => (s.tokens = { modes: ['a'], values: { x: true } })],
  ['spec.tokenModeMissing', (s) => (s.tokens = { modes: ['a'], values: { x: {} } })],
  [
    'spec.tokenModeExtra',
    (s) => (s.tokens = { modes: ['a'], values: { x: { a: 'v', b: 'w' } } }),
  ],
  [
    'spec.tokenModeValueShape',
    (s) => (s.tokens = { modes: ['a'], values: { x: { a: true } } }),
  ],
  [
    'spec.tokenModesSameType',
    (s) => (s.tokens = { modes: ['a', 'b'], values: { x: { a: 'v', b: 1 } } }),
  ],
  ['spec.iconsPathShape', (s) => (s.icons = 3)],
  // formatVersion 16 (`specSignature.ts`)
  ['spec.likeNotField', v16Models({ like: 'zz.k' })],
  ['spec.formatNeedsPlaceholder', v16Models({ type: 'number', format: 'x' })],
  ['spec.modelTypeInvalid', v16Models({ type: 'zz' })],
  ['spec.optionsNotTextList', v16Models({ type: 'enum', options: [] })],
  ['spec.optionsRequiredInEnum', v16Models({ type: 'enum' })],
  ['spec.expandParamsRequired', v16Models({ expand: { call: 'c' } })],
  ['spec.mustBeNonEmptyText', v16Models({ expand: { call: 'c', params: { a: '' } } })],
  ['spec.modelFormRequired', v16Models({})],
  ['spec.modelFormsConflict', v16Models({ like: 't.k', ignore: true })],
  ['spec.mustBeTrue', v16Models({ ignore: false })],
  [
    'spec.callNotDeclared',
    (s) => {
      v16Models({ ignore: true })(s);
      type(s).code = { a: { symbol: 'S', params: { k: 'border.color' } } };
    },
  ],
  // The default zod texts, one per code the specialization produces.
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

/** A v16 specialization with the field model given in `fieldModels.a.X` (platform `a`). */
function v16Models(model: unknown): (s: Raw) => void {
  return (s) => {
    s.formatVersion = 16;
    s.platforms = [{ id: 'a', name: 'A' }];
    s.fieldModels = { a: { X: model } };
  };
}

function issuesOf(mutate: (s: Raw) => void): SpecIssue[] {
  const spec = base();
  mutate(spec);
  const parsed = parseSpec(spec);
  if (parsed.ok) throw new Error('a especialização devia ser inválida');
  return parsed.issues;
}

function asModelMessage(issue: SpecIssue) {
  return modelMessage(issue.code ?? 'raw', issue.params ?? {}, issue.message);
}

function shown(issue: SpecIssue): string {
  return messageText(asModelMessage(issue));
}

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

function withoutParams(text: string, issue: SpecIssue): string {
  let out = text;
  for (const value of Object.values(issue.params ?? {}))
    out = out.replace(`${value}`, '');
  return out;
}

describe('specialization messages (up to layerShape)', () => {
  it.each(CASES.map(([code, mutate], i) => [`${i} ${code}`, code, mutate] as const))(
    'produces the code: %s',
    (_name, code, mutate) => {
      const codes = issuesOf(mutate).map((i) => i.code);
      expect(codes).toContain(code);
    },
  );

  it("every code in the `spec` catalog (except zod's) is produced by a case", () => {
    const produced = new Set(CASES.map(([code]) => code));
    const catalog = Object.keys(MODEL_MESSAGE_TEMPLATES).filter(
      (c) => c.startsWith('spec.') && !c.startsWith('spec.zod.'),
    );
    expect(catalog.length).toBeGreaterThan(60);
    for (const code of catalog) expect(produced, code).toContain(code);
  });

  it('each fixed text in the `spec` catalog belongs to a single code (the code is found by the text)', () => {
    const fixed = Object.entries(MODEL_MESSAGE_TEMPLATES).filter(
      ([code, text]) =>
        code.startsWith('spec.') &&
        !code.startsWith('spec.zod.') &&
        !/\{\w+\}/.test(text),
    );
    const texts = fixed.map(([, text]) => text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('the `input` does not leave the model', () => {
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) expect('input' in issue).toBe(false);
    }
  });

  it('pt-BR: the text shown is the pt-BR template filled in (never the English `message`, even for the default zod texts)', () => {
    locale.value = 'pt-BR';
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        if (issue.code === undefined) continue;
        expect(shown(issue), issue.message).toBe(ptBRText(asModelMessage(issue)));
        // The `message` of the zod codes is zod's own English text; the pt-BR is translated (decision 6).
        if (ZOD_CODES.includes(issue.code))
          expect(shown(issue), issue.message).not.toBe(issue.message);
      }
    }
  });

  it('en-US: the text shown is the English `message` itself', () => {
    locale.value = 'en-US';
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        if (issue.code === undefined) continue;
        // The zod codes may differ in the plural ("Unrecognized keys"): the template is the base text.
        if (ZOD_CODES.includes(issue.code)) continue;
        expect(shown(issue), issue.message).toBe(issue.message);
      }
    }
  });

  it('en-US: no Portuguese word outside the parameters', () => {
    locale.value = 'en-US';
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        if (issue.code === undefined) continue;
        expect(withoutParams(shown(issue), issue), issue.message).not.toMatch(PORTUGUESE);
      }
    }
  });

  it('invalid_type carries `expected` and `received` (format names)', () => {
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

  it('the library validator passes on the code and translates the specialization line', () => {
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

// Item 2 of #1530 (decisions 2 and 7): the specialization message code does not come from a regex
// of the pt-BR text, except for the three texts that zod builds with the received value.
describe('specialization message code without false matches', () => {
  it('text that merely resembles a template with a parameter gets no code', () => {
    expect(specCodeForText('must be "a" ou "b"')).toBeUndefined();
    expect(specCodeForText('nome "a" e "b" repeated')).toBeUndefined();
    expect(specCodeForText('only allowed with formatVersion 4')).toBeUndefined();
  });

  it('the pattern applies only to the three enum codes', () => {
    expect(specCodeForText('"x" is invalid; use "marking" or "arrow"')).toEqual({
      code: 'spec.appliesToInvalid',
      params: { value: 'x' },
    });
    expect(
      specCodeForText(
        '"x" is invalid; use "removed", "deprecated", "diverges" or "pending"',
      ),
    ).toEqual({ code: 'spec.noticeKindInvalid', params: { value: 'x' } });
    expect(
      specCodeForText(
        '"x" is invalid; use "string", "number", "date", "enum", "table" or "ref"',
      ),
    ).toEqual({ code: 'spec.fieldTypeInvalid', params: { value: 'x' } });
  });

  it('the exact text of a template without a parameter still finds the code', () => {
    expect(specCodeForText('required')).toEqual({ code: 'spec.required' });
  });

  // The same `code` and the same `params` as before, one case per group of decision 2.
  const GROUPS: readonly (readonly [
    string,
    (s: Raw) => void,
    string,
    Record<string, string | number> | undefined,
  ])[] = [
    // pattern (the three enums)
    ['padrão', (s) => (field(s).type = 'foo'), 'spec.fieldTypeInvalid', { value: 'foo' }],
    [
      'padrão',
      (s) => (type(s).notices = [{ kind: 'zz', message: 'm' }]),
      'spec.noticeKindInvalid',
      { value: 'zz' },
    ],
    [
      'padrão',
      (s) => (type(s).appliesTo = ['x']),
      'spec.appliesToInvalid',
      { value: 'x' },
    ],
    // `known` (zod messages with constant values)
    ['known', (s) => (s.format = 'x'), 'spec.formatInvalid', { format: 'mapping-spec' }],
    [
      'known',
      (s) => (s.formatVersion = 99),
      'spec.formatVersionInvalid',
      { versions: '@versions', last: '@last' },
    ],
    [
      'known',
      (s) => (s.containers = [container({ width: 999999 })]),
      'spec.containerSideMax',
      { max: '@max' },
    ],
    [
      'known',
      (s) => (s.fonts = [font({ weight: 5 })]),
      'spec.fontWeightInvalid',
      { min: '100', max: '1000' },
    ],
    // emitter
    [
      'emissor',
      (s) => ((s.formatVersion = 1), (s.platforms = [{ id: 'a', name: 'A' }])),
      'spec.onlyFormat',
      { version: '@version' },
    ],
    [
      'emissor',
      (s) => (type(s).component = 'components/a.txt'),
      'spec.invalidExtension',
      { exts: '.json' },
    ],
    [
      'emissor',
      (s) => (type(s).doc = { repo: 'r', path: 'docs/a.txt' }),
      'spec.invalidExtension',
      { exts: '.md' },
    ],
    [
      'emissor',
      (s) =>
        (s.platforms = [
          {
            id: 'a',
            name: 'A',
            repo: { url: 'https://a.b', urlTemplate: 'https://a.b/x' },
          },
        ]),
      'spec.urlTemplateNeedsPath',
      { path: '{path}' },
    ],
    // the code that used to get lost along the way
    [
      'perdido',
      (s) => (s.tokens = { modes: ['a'], values: {}, zz: 1 }),
      'spec.tokenKeyUnknown',
      { key: 'zz' },
    ],
    [
      'perdido',
      (s) =>
        (type(s).examples = [
          { name: 'x', values: {} },
          { name: 'x', values: {} },
        ]),
      'spec.exampleNameRepeated',
      { name: 'x' },
    ],
    [
      'perdido',
      (s) => fieldPath(s, 'a['),
      'spec.fieldPathMissingBracket',
      { path: 'a[' },
    ],
  ];

  it.each(GROUPS.map((g, i) => [`${i} ${g[0]}: ${g[2]}`, g] as const))(
    'parseSpec returns the same code and params as before: %s',
    (_name, [, mutate, code, params]) => {
      const hit = issuesOf(mutate).find((i) => i.code === code);
      expect(hit, code).toBeDefined();
      if (params === undefined) return;
      const got = hit?.params ?? {};
      for (const [key, value] of Object.entries(params)) {
        if (value.toString().startsWith('@')) expect(got[key], key).toBeTypeOf('string');
        else expect(got[key], key).toBe(value);
      }
      expect(Object.keys(got).sort()).toEqual(Object.keys(params).sort());
    },
  );

  it('the nonexistent formatVersion and the container side carry the numbers in the text', () => {
    const version = issuesOf((s) => (s.formatVersion = 99)).find(
      (i) => i.code === 'spec.formatVersionInvalid',
    );
    expect(version?.message).toBe(
      `must be ${version?.params?.versions} or ${version?.params?.last}`,
    );
    const side = issuesOf((s) => (s.containers = [container({ width: 999999 })])).find(
      (i) => i.code === 'spec.containerSideMax',
    );
    expect(side?.message).toBe(`must be <= ${side?.params?.max}`);
    const only = issuesOf(
      (s) => ((s.formatVersion = 1), (s.platforms = [{ id: 'a', name: 'A' }])),
    ).find((i) => i.code === 'spec.onlyFormat');
    expect(only?.message).toBe(
      `only allowed with formatVersion ${only?.params?.version}`,
    );
  });
});

describe('SPEC_PATTERN_CODES contract (decision 6 of #1589)', () => {
  const HOSTILE = 'x" inválido; use "marking';
  const MUTATE: Readonly<Record<string, (s: Raw, value: string) => void>> = {
    'spec.fieldTypeInvalid': (s, value) => (field(s).type = value),
    'spec.noticeKindInvalid': (s, value) =>
      (type(s).notices = [{ kind: value, message: 'm' }]),
    'spec.appliesToInvalid': (s, value) => (type(s).appliesTo = [value]),
  };

  it('each code has a mutator in this test', () => {
    expect(Object.keys(MUTATE).sort()).toEqual([...SPEC_PATTERN_CODES].sort());
  });

  it.each(SPEC_PATTERN_CODES.map((code) => [code]))(
    '%s: the pt-BR template has exactly one {…}',
    (code) => {
      const text = (specMessages as Readonly<Record<string, string>>)[code] ?? '';
      expect(text.match(/\{\w+\}/g)).toHaveLength(1);
    },
  );

  it.each(SPEC_PATTERN_CODES.map((code) => [code]))(
    '%s: the hostile value comes back whole in params.value, with the catalog text',
    (code) => {
      const issue = issuesOf((s) => MUTATE[code]?.(s, HOSTILE)).find(
        (i) => i.code === code,
      );
      expect(issue?.params?.value).toBe(HOSTILE);
      expect(issue?.message).toBe(specMsg(code, { value: HOSTILE }).text);
    },
  );
});
