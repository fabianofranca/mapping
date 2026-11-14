import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';
import { TOKEN_KIND_NAMES, type TokenKind } from '../../src/model/components/tokens';
import {
  isModelMessageTemplateCode,
  MODEL_MESSAGE_TEMPLATES,
  fillTemplate,
  templateMessage,
  type ModelMessageTemplateCode,
} from '../../src/model/messages';
import { parseSpecText } from '../../src/model/spec';
import { buildCatalog } from '../../src/model/catalog';
import { loadSpecComponents } from '../../src/model/componentCatalog';
import { COMPONENTS, SPEC_FILE, testSpec } from '../model/componentFixtures';
import type { ModelMessage } from '../../src/model/modelMessage';
import { modelMessagesEnUS } from '../../src/i18n/modelMessages';
import { templatePtBR } from '../../src/i18n/modelMessagesTemplatesPtBR';
import { ptBRText } from '../support/modelText';
import { locale } from '../../src/store/settings';
import { issueText } from '../../src/ui/LibraryIssueList';
import { messageText } from '../../src/ui/modelMessage';

// MB1 (#1356): every message built by the library validator has a code and comes out in the app
// language. In pt-BR the text is identical to `message`; in en-US there is no Portuguese character
// outside the parameters (paths, ids and the drawing engine text, which MB5 translates, are data).

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Files = { path: string; text: string }[];

const ICONS_DIR = 'tests/fixtures/icons';
const readIcons = (path: string): string => readFileSync(join(ICONS_DIR, path), 'utf8');
const SPEC = 'icons.spec.json';

/** The test icon pack (valid) with problems from several groups at once. */
function noisyPackage(): { files: Files; previous: ReturnType<typeof previousSpec> } {
  const spec: Raw = JSON.parse(readIcons(SPEC));
  const types = spec.layers[0].annotationTypes as Raw[];
  const badge = types[0] as Raw;
  badge.doc = 'docs/badge.md';
  (badge.fields as Raw[]).push({ key: 'unused', type: 'string', default: 'x' });
  types.push(
    { id: 'ghost', name: 'G', component: 'components/ghost.json', fields: [] },
    { id: 'broken', name: 'B', component: 'components/broken.json', fields: [] },
  );
  spec.fonts = [{ family: 'Roboto', file: 'fonts/Roboto.ttf', weight: 400 }];
  const badgeComponent: Raw = JSON.parse(readIcons('components/badge.json'));
  badgeComponent.template.children[0].name = 'nuvem';
  return {
    files: [
      { path: SPEC, text: JSON.stringify(spec) },
      { path: 'components/badge.json', text: JSON.stringify(badgeComponent) },
      { path: 'components/broken.json', text: '{' },
      { path: 'icons/set.json', text: readIcons('icons/set.json') },
      { path: 'docs/badge.md', text: '' },
      { path: 'extra.json', text: '{}' },
    ],
    previous: previousSpec(),
  };
}

function previousSpec() {
  const parsed = parseSpecText(readIcons(SPEC));
  if (!parsed.ok) throw new Error('fixture inválida');
  return parsed.spec;
}

function tokenPackage(children: Raw[]): Files {
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'tk',
    name: 'Tk',
    size: { width: 100, height: 50 },
    template: { type: 'frame', children },
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'tk',
    name: 'Tk',
    version: 1,
    tokens: { modes: ['light'], values: { primary: { light: '#1a73e8' } } },
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/tk.json', fields: [] },
        ],
      },
    ],
  };
  return [
    { path: 'tk.spec.json', text: JSON.stringify(spec) },
    { path: 'components/tk.json', text: JSON.stringify(component) },
  ];
}

/** A `hug` component in height with `maxHeight`: the text does not fit even at the adjusted size (MC2). */
function fittedPackage(): Files {
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'ft',
    name: 'Ft',
    size: { width: 200, height: 50 },
    sizing: { height: 'hug' },
    template: {
      type: 'frame',
      width: 'fill',
      maxHeight: 40,
      layout: { type: 'column' },
      children: [
        {
          type: 'text',
          name: 'msg',
          text: 'a\nb\nc',
          width: 'fill',
          height: 'hug',
          font: { size: 10, lineHeight: 30 },
        },
      ],
    },
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'ft',
    name: 'Ft',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/ft.json', fields: [] },
        ],
      },
    ],
  };
  return [
    { path: 'ft.spec.json', text: JSON.stringify(spec) },
    { path: 'components/ft.json', text: JSON.stringify(component) },
  ];
}

function allIssues(): LibraryIssue[] {
  const noisy = noisyPackage();
  return [
    ...validateLibrary({ files: noisy.files, specPath: SPEC, previous: noisy.previous })
      .issues,
    ...validateLibrary({ files: fittedPackage(), specPath: 'ft.spec.json' }).issues,
    ...validateLibrary({
      files: tokenPackage([
        { type: 'rect', fill: { $token: 'inexistente' } },
        { type: 'rect', cornerRadius: { $token: 'primary' } },
      ]),
      specPath: 'tk.spec.json',
    }).issues,
  ];
}

const EXPECTED_CODES = [
  'library.notReferenced',
  'library.emptyDoc',
  'library.fileNotFound',
  'library.invalidJson',
  'library.fieldUnused',
  'library.tokenMissing',
  'library.tokenWrongKind.color.number',
  'library.fontMissing',
  'library.versionNotGrown',
  'library.draw.preview',
  'library.drawFitted.defaults',
  'library.iconMissing',
];

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

describe('library validator messages', () => {
  it('produces the expected codes, without `target`', () => {
    const issues = allIssues();
    const codes = new Set(issues.map((i) => i.code));
    for (const code of EXPECTED_CODES) expect(codes, code).toContain(code);
    expect(issues.some((i) => 'target' in i)).toBe(false);
  });

  it('the drawing warning carries the engine text in `detail`', () => {
    const drawing = allIssues().find((i) => i.code === 'library.draw.preview');
    expect(drawing?.detail?.text).toContain('unknown icon');
  });

  it('pt-BR: the text shown is the pt-BR template filled in; en-US shows `message`', () => {
    for (const issue of allIssues()) {
      if (issue.code === undefined) continue;
      const template = (templatePtBR as Readonly<Record<string, string | undefined>>)[
        `model.${issue.code}`
      ];
      if (template === undefined) continue;
      locale.value = 'pt-BR';
      const params =
        issue.detail === undefined
          ? (issue.params ?? {})
          : { ...issue.params, reason: ptBRText(issue.detail) };
      expect(issueText(issue), issue.message).toBe(fillTemplate(template, params));
      locale.value = 'en-US';
      expect(issueText(issue), issue.message).toBe(issue.message);
    }
  });

  it('en-US: no Portuguese word outside the parameters', () => {
    locale.value = 'en-US';
    for (const issue of allIssues()) {
      if (issue.code === undefined) continue;
      let text = issueText(issue);
      for (const value of Object.values(issue.params ?? {}))
        text = text.replace(`${value}`, '');
      if (issue.detail !== undefined) text = text.replace(issue.detail.text, '');
      expect(text, issue.message).not.toMatch(PORTUGUESE);
    }
  });

  it('en-US: the texts that script R8.4 checks', () => {
    locale.value = 'en-US';
    const issues = allIssues();
    const text = (code: string) => {
      const issue = issues.find((i) => i.code === code);
      return issue === undefined ? undefined : issueText(issue);
    };
    expect(text('library.notReferenced')).toBe(
      'file not referenced by the specialization',
    );
    expect(text('library.emptyDoc')).toBe('empty document');
    expect(text('library.fileNotFound')).toMatch(/^file not found: /);
  });

  it('`{detail}` only stays in `library.invalidJson` (the inner message goes into `{reason}`)', () => {
    const withDetail = (entries: [string, string][]) =>
      entries.filter(([, text]) => text.includes('{detail}')).map(([code]) => code);
    expect(withDetail(Object.entries(MODEL_MESSAGE_TEMPLATES))).toEqual([
      'library.invalidJson',
    ]);
    expect(withDetail(Object.entries(modelMessagesEnUS))).toEqual([
      'model.library.invalidJson',
    ]);
  });

  it('en-US: `library.draw.*` with the inner message comes out with it translated', () => {
    locale.value = 'en-US';
    const drawing = allIssues().find((i) => i.code === 'library.draw.preview');
    expect(drawing?.detail).toBeDefined();
    expect(drawing?.params).not.toHaveProperty('detail');
    const text = issueText(drawing as LibraryIssue);
    expect(text).toContain('unknown icon');
    expect(text).not.toContain('ícone desconhecido');
    expect(text).not.toContain('{reason}');
    expect(text).not.toContain('{detail}');
  });

  it('there is one token code per pair of types, with the text of `TOKEN_KIND_NAMES`', () => {
    const kinds = Object.keys(TOKEN_KIND_NAMES) as TokenKind[];
    for (const found of kinds) {
      for (const expected of kinds) {
        if (found === expected) continue;
        const code = `library.tokenWrongKind.${found}.${expected}`;
        expect(isModelMessageTemplateCode(code), code).toBe(true);
        expect(
          templateMessage(code as ModelMessageTemplateCode, { name: 'x' }).text,
        ).toBe(
          `the token "x" is a ${TOKEN_KIND_NAMES[found]}, but a ${TOKEN_KIND_NAMES[expected]} is expected here`,
        );
      }
    }
  });
});

describe('the `detail` rule (decision 9 of #1589)', () => {
  const materials = (): readonly ModelMessage[] => {
    const read = (path: string): string | undefined => {
      if (path.endsWith('text.json')) return JSON.stringify({ format: 'outro' });
      if (path.endsWith('icons.json')) return JSON.stringify({ format: 'outro' });
      const id = /components\/(.+)\.json$/.exec(path)?.[1];
      return id && COMPONENTS[id] ? JSON.stringify(COMPONENTS[id]) : undefined;
    };
    const loaded = loadSpecComponents(
      { ...testSpec(), icons: 'icons.json' },
      SPEC_FILE,
      1,
      read,
    );
    return loaded.problemMessages;
  };

  it('components.invalid and icons.invalid with `detail` do not carry `reason` in params', () => {
    const withDetail = materials().filter((m) => m.detail !== undefined);
    expect(withDetail.map((m) => m.code).sort()).toEqual(
      expect.arrayContaining(['components.invalid', 'icons.invalid']),
    );
    for (const m of withDetail) expect(m.params, m.code).not.toHaveProperty('reason');
  });

  it('catalog.invalidProblem with `detail` does not carry `reason` in params', () => {
    const root = join('tests/fixtures/material3');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .map((p) => p.split('\\').join('/'))
      .filter((p) => p.endsWith('.json') || p.endsWith('.md'))
      .map((path) => ({
        path,
        text:
          path === 'components/m3-button.json'
            ? '{"format":"outro"}'
            : readFileSync(join(root, path), 'utf8'),
      }));
    const problem = buildCatalog(files)
      .layers.flatMap((l) => l.entries)
      .find(
        (e) => e.componentProblem?.code === 'catalog.invalidProblem',
      )?.componentProblem;
    expect(problem?.detail).toBeDefined();
    expect(problem?.params).not.toHaveProperty('reason');
  });

  it('the en-US text shown is the same as before (the translated `detail` in {reason})', () => {
    locale.value = 'en-US';
    const m = materials().find((x) => x.code === 'icons.invalid');
    expect(m).toBeDefined();
    const shown = messageText(m as ModelMessage);
    expect(shown).toContain(messageText((m as ModelMessage).detail as ModelMessage));
    expect(shown).not.toContain('{reason}');
  });
});
