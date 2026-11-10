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
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { issueText } from '../../src/ui/LibraryIssueList';

// MB4 (#1359): os erros e avisos do componente, dos ícones e da declaração das origens têm código
// e saem na língua da app. Em pt-BR o texto é igual ao `message`; em en-US não há palavra do
// português fora dos parâmetros (nomes de chave, ids e caminhos são dados).

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

/** O texto sem os valores dos parâmetros (dados: caminhos, ids, o texto de outro módulo). */
function withoutParams(text: string, issue: Coded): string {
  let out = text;
  for (const value of Object.values(issue.params ?? {}))
    out = out.split(String(value)).join('');
  return out;
}

function expectLocalized(issues: readonly Coded[]): void {
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) {
    expect(issue.code, issue.message).toBeDefined();
    locale.value = 'pt-BR';
    expect(messageText(asMessage(issue)), issue.message).toBe(issue.message);
    locale.value = 'en-US';
    const shown = messageText(asMessage(issue));
    expect(withoutParams(shown, issue), `${issue.code}: ${shown}`).not.toMatch(
      PORTUGUESE,
    );
    expect(shown, issue.message).not.toBe(issue.message);
  }
}

// --- componente --------------------------------------------------------------------------

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

/** Cada caso muda o componente válido para produzir problemas de um grupo diferente. */
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
];

describe('mensagens do componente', () => {
  it.each(COMPONENT_CASES.map((fix, i) => [i, fix] as const))(
    'caso %i: todo problema tem código e sai na língua da app',
    (_i, fix) => {
      const input = validComponent();
      fix(input);
      const parsed = parseComponent(input);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expectLocalized(parsed.issues);
    },
  );

  it('o aviso de família de fonte inválida tem código', () => {
    const input = validComponent();
    input.template = {
      type: 'frame',
      children: [{ type: 'text', text: 'a', font: { family: '"' } }],
    };
    const parsed = parseComponent(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expectLocalized(parsed.warnings);
  });

  it('JSON inválido usa library.invalidJson, com o mesmo texto', () => {
    const parsed = parseComponentText('{ não é json');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.code).toBe('library.invalidJson');
    expect(parsed.issues[0]?.message).toMatch(/^JSON inválido: /);
  });

  it('o validador da biblioteca repassa o código do componente', () => {
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

// --- ícones --------------------------------------------------------------------------------

describe('mensagens dos ícones', () => {
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
    'caso %i: todo problema tem código e sai na língua da app',
    (_i, input) => {
      const parsed = parseIconsText(JSON.stringify(input));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expectLocalized(parsed.issues as readonly IconsIssue[]);
    },
  );

  it('JSON inválido usa library.invalidJson, com o mesmo texto', () => {
    const parsed = parseIconsText('{');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.code).toBe('library.invalidJson');
    expect(parsed.issues[0]?.message).toMatch(/^JSON inválido: /);
  });
});

// --- declaração das origens (parseSpec) ------------------------------------------------

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

describe('mensagens da declaração das origens', () => {
  it.each(ORIGIN_CASES.map((o, i) => [i, o] as const))(
    'caso %i: todo problema tem código e sai na língua da app',
    (_i, origins) => {
      const parsed = parseSpec(specWith(origins));
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      const issues = parsed.issues as readonly SpecIssue[];
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.code, issue.message).toBeDefined();
        locale.value = 'pt-BR';
        expect(messageText(asMessage(issue)), issue.message).toBe(issue.message);
        locale.value = 'en-US';
        const shown = messageText(asMessage(issue));
        expect(withoutParams(shown, issue), `${issue.code}: ${shown}`).not.toMatch(
          PORTUGUESE,
        );
      }
    },
  );
});

// --- catálogo de componentes (o aviso do componente que não carregou) ----------------------

describe('componente que não carregou', () => {
  it('o motivo vira `detail` e sai traduzido; em pt-BR o texto é o de hoje', () => {
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
      expect(messageText(message)).toBe(message.text);
      locale.value = 'en-US';
      const shown = messageText(message);
      expect(withoutParams(shown, { message: '', params: message.params })).not.toMatch(
        PORTUGUESE,
      );
      expect(shown).not.toBe(message.text);
    }
  });
});

// --- o catálogo --------------------------------------------------------------------------

describe('catálogos component, iconsFile e origins', () => {
  const ALL = { ...componentMessages, ...iconsFileMessages, ...originMessages };

  it('os códigos estão no catálogo único do modelo', () => {
    for (const code of Object.keys(ALL))
      expect(MODEL_MESSAGE_TEMPLATES).toHaveProperty(code);
  });

  it('cada modelo do catálogo `component` acha o próprio código pelo texto', () => {
    for (const [code, template] of Object.entries(componentMessages)) {
      const params = Object.fromEntries(
        [...template.matchAll(/\{(\w+)\}/g)].map((m, i) => [m[1], `v${i}`]),
      ) as Record<string, string>;
      const text = fillTemplate(template, params);
      expect(componentCodeForText(text)?.code, text).toBe(code);
    }
  });

  it('nenhum modelo do catálogo é órfão: o texto dele existe no parser', () => {
    const sources: readonly [Readonly<Record<string, string>>, string][] = [
      [componentMessages, 'src/model/components/parseComponent.ts'],
      [iconsFileMessages, 'src/model/components/icons.ts'],
      [originMessages, 'src/model/components/origin.ts'],
    ];
    for (const [catalog, file] of sources) {
      const source = readFileSync(file, 'utf8').replace(/'\s*\+\s*'/g, '');
      for (const [code, template] of Object.entries(catalog)) {
        // O parser monta este com a constante `COMPONENT_FORMAT`; o caso 0 acima o produz.
        if (code === 'component.formatInvalid') continue;
        // Os avisos de desenho (`origins.draw.*`) saem do catálogo por `templateMessage` (MB5), sem o
        // texto no código; `engineMessages.test.ts` os produz.
        if (code.startsWith('origins.draw.')) continue;
        const parts = template
          .split(/\{\w+\}/)
          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp(parts.join('[^\\n]*?'));
        expect(re.test(source), `${code} (${file})`).toBe(true);
      }
    }
  });
});
