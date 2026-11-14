import { afterEach, describe, expect, it } from 'vitest';
import { diffSpecs, missingMigrations } from '../../src/model/specVersions';
import { specWarnings } from '../../src/model/specWarnings';
import { MODEL_MESSAGE_TEMPLATES } from '../../src/model/messages';
import { modelMessage } from '../../src/model/modelMessage';
import { parseSpec, type Spec } from '../../src/model/spec';
import { validateLibrary } from '../../src/model/library';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { issueText } from '../../src/ui/LibraryIssueList';

// MB3 (#1358): the specialization warnings (`specWarnings`) and the breaks without migration
// (`specVersions`) have a code and come out in the app's language. In pt-BR the text equals the `message`; in
// en-US there is no Portuguese word outside the parameters. The phrases that agree in gender
// ("o campo" / "a coluna") are one code per variant, and the test produces both.

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Ignored = Extract<ReturnType<typeof parseSpec>, { ok: true }>['ignored'];

function parsed(raw: Raw): { spec: Spec; ignored: Ignored } {
  const result = parseSpec(raw);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return { spec: result.spec, ignored: result.ignored };
}

function spec(over: Raw, types: Raw[]): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 's',
    name: 'S',
    version: 1,
    layers: [{ id: 'l', name: 'L', color: '#112233', annotationTypes: types }],
    ...over,
  };
}

// --- specialization warnings ---------------------------------------------------------------

function warningSpecs(): { spec: Spec; ignored: Ignored }[] {
  const legacy = parsed(
    spec({ format: 'mapeador-spec', formatVersion: 1 }, [
      { id: 't', name: 'T', fields: [] },
    ]),
  );
  const platforms = parsed(
    spec(
      {
        platforms: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
      [
        { id: 't', name: 'T', fields: [], code: { a: { symbol: 'S', path: 'p/x.kt' } } },
        { id: 'u', name: 'U', fields: [] },
      ],
    ),
  );
  const ignored = parsed(
    spec({}, [{ id: 't', name: 'T', fields: [{ key: 'x', type: 'codeRef' }] }]),
  );
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `e${i}`,
    name: `E${i}`,
    fields: [],
  }));
  const v11 = parsed({
    ...spec({ docRepos: [{ id: 'r', url: 'https://a.b' }] }, [
      { id: 't', name: 'T', fields: [], allowedChildren: many.map((m) => m.id) },
      ...many,
    ]),
  });
  const grouped = parsed(
    (() => {
      const s = spec({ docRepos: [{ id: 'r', url: 'https://a.b' }] }, [
        { id: 't', name: 'T', fields: [] },
      ]);
      s.layers[0].groups = [{ id: 'g', name: 'G' }];
      return s;
    })(),
  );
  return [legacy, platforms, ignored, v11, grouped];
}

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

function withoutParams(text: string, params: Record<string, string | number>): string {
  let out = text;
  for (const value of Object.values(params)) out = out.replace(`${value}`, '');
  return out;
}

interface Said {
  readonly message: string;
  readonly messageCode?: string | undefined;
  readonly messageParams?: Record<string, string | number> | undefined;
}

const shown = (item: Said): string =>
  messageText(
    modelMessage(item.messageCode ?? 'raw', item.messageParams ?? {}, item.message),
  );

const warnings = () => warningSpecs().flatMap((s) => specWarnings(s.spec, s.ignored));

// --- breaks and additive ones ---------------------------------------------------------------------

const BASE_TYPE = (): Raw => ({
  id: 't',
  name: 'T',
  allowedChildren: ['u'],
  childRoles: [{ id: 'r1', name: 'R1' }],
  component: 'components/a.json',
  fields: [
    { key: 'k', type: 'string' },
    { key: 'e', type: 'enum', options: ['a', 'b'] },
    { key: 'rm', type: 'string' },
    { key: 'req', type: 'string' },
    {
      key: 'tb',
      type: 'table',
      columns: [
        { key: 'c', type: 'string' },
        { key: 'd', type: 'enum', options: ['x', 'y'] },
        { key: 'ct', type: 'string' },
        { key: 'cr', type: 'string' },
      ],
    },
  ],
});

function previous(): Spec {
  return parsed(
    spec({}, [
      BASE_TYPE(),
      { id: 'u', name: 'U', fields: [] },
      { id: 'old', name: 'Old', fields: [] },
      { id: 'v', name: 'V', allowedChildren: ['u'], fields: [] },
    ]),
  ).spec;
}

function next(): Spec {
  const t = BASE_TYPE();
  t.component = 'components/b.json';
  t.appliesTo = ['marking', 'arrow'];
  t.doc = 'docs/t.md';
  t.examples = [{ name: 'ex', values: {} }];
  t.childRoles = [{ id: 'r2', name: 'R2' }];
  t.fields = [
    { key: 'k', type: 'number' },
    { key: 'e', type: 'enum', options: ['a', 'c'] },
    { key: 'req', type: 'string', required: true },
    { key: 'newf', type: 'string' },
    { key: 'newreq', type: 'string', required: true },
    {
      key: 'tb',
      type: 'table',
      columns: [
        { key: 'd', type: 'enum', options: ['x', 'z'] },
        { key: 'ct', type: 'number' },
        { key: 'cr', type: 'string', required: true },
        { key: 'n', type: 'string' },
        { key: 'nr', type: 'string', required: true },
      ],
    },
  ];
  return parsed(
    spec({ version: 2, fonts: [{ family: 'F', file: 'fonts/a.ttf' }] }, [
      t,
      { id: 'u', name: 'U', fields: [], component: 'components/u.json' },
      { id: 'fresh', name: 'Fresh', fields: [] },
      {
        id: 'v',
        name: 'V',
        allowedChildren: ['u'],
        childRoles: [{ id: 'q', name: 'Q' }],
        fields: [],
      },
    ]),
  ).spec;
}

const changes = () => diffSpecs(previous(), next());

describe('specialization version messages (MB3)', () => {
  it('the warnings produce the code of each warning variant', () => {
    const codes = new Set(warnings().map((w) => w.messageCode));
    for (const code of [
      'versions.legacyFormat',
      'versions.ignoredField',
      'versions.unusedPlatform',
      'versions.typeWithoutCode',
      'versions.pathWithoutRepo',
      'versions.manyChildrenIds',
      'versions.unusedGroup',
      'versions.unusedDocRepo',
    ]) {
      expect(codes, code).toContain(code);
    }
  });

  it('the differences produce the code of each variant (field and column, one per gender)', () => {
    const codes = new Set(changes().map((c) => c.messageCode));
    const catalog = Object.keys(MODEL_MESSAGE_TEMPLATES).filter(
      (c) => c.startsWith('versions.') && !warnings().some((w) => w.messageCode === c),
    );
    expect(catalog.length).toBeGreaterThan(20);
    for (const code of catalog) expect(codes, code).toContain(code);
  });

  it('the phrases by agreement are different codes (field ≠ column)', () => {
    const byPath = (code: string) => changes().filter((c) => c.messageCode === code);
    expect(byPath('versions.fieldRemoved')[0]?.message).toBe(
      'o campo "rm" do tipo "t" foi removido; declare um passo "remove-field" ou "rename-field" em migrations',
    );
    expect(byPath('versions.columnRemoved')[0]?.message).toBe(
      'a coluna "c" do campo "tb" do tipo "t" foi removida; declare um passo "remove-field" ou "rename-field" em migrations com field "tb.c"',
    );
    expect(byPath('versions.columnNewRequired')[0]?.message).toBe(
      'a coluna "nr" do campo "tb" do tipo "t" é nova e já obrigatória; declare um passo "fill-field" em migrations com field "tb.nr"',
    );
    expect(byPath('versions.fieldBecameRequired')[0]?.message).toBe(
      'o campo "req" do tipo "t" passou a ser obrigatório; declare um passo "fill-field" em migrations',
    );
  });

  it('missingMigrations returns only breaks, with the code', () => {
    const missing = missingMigrations(previous(), next());
    expect(missing.length).toBeGreaterThan(8);
    for (const change of missing) {
      expect(change.kind).toBe('breaking');
      expect(change.messageCode, change.message).toBeDefined();
    }
  });

  it('pt-BR: the text shown equals the `message`', () => {
    locale.value = 'pt-BR';
    for (const item of [...warnings(), ...changes()]) {
      expect(shown(item), item.message).toBe(item.message);
    }
  });

  it('en-US: no Portuguese word outside the parameters', () => {
    locale.value = 'en-US';
    for (const item of [...warnings(), ...changes()]) {
      const text = shown(item);
      expect(text, item.message).not.toBe(item.message);
      expect(withoutParams(text, item.messageParams ?? {}), item.message).not.toMatch(
        PORTUGUESE,
      );
    }
  });

  it('the library validator passes on the code of the warnings and of the breaks without migration', () => {
    locale.value = 'en-US';
    const files = (s: Spec) => [{ path: 's.spec.json', text: JSON.stringify(s) }];
    const report = validateLibrary({
      files: files(next()),
      specPath: 's.spec.json',
      previous: previous(),
      level: 2,
    });
    const removed = report.errors.find((e) => e.code === 'versions.fieldRemoved');
    expect(removed?.params).toMatchObject({ key: 'rm', typeId: 't' });
    expect(issueText(removed!)).toBe(
      'the field "rm" of the type "t" was removed; declare a "remove-field" or "rename-field" step in migrations',
    );
    const warned = validateLibrary({
      files: files(warningSpecs()[1]!.spec),
      specPath: 's.spec.json',
      level: 1,
    });
    const unused = warned.warnings.find((w) => w.code === 'versions.unusedPlatform');
    expect(issueText(unused!)).toBe(
      'the platform "b" is declared, but no type uses it in `code`',
    );
  });
});
