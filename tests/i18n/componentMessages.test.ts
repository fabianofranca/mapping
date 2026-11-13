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
  // `$lines` e `sizing` por expressão (MC2).
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
  // Quebra de fileira (MC4): `lineGap`, `maxPerLine` e `maxLines` sem `wrap`.
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

// Os textos de `parseOrigins(raw).problems` (`${path}: ${message}`) ficam fixados em literais: a
// refatoração dos problemas como dado (#1589, RM1) não muda letra nenhuma, nem para a biblioteca dos
// componentes, que os mostra neste formato.
// Os mesmos casos de `ORIGIN_CASES`, mais uma origem repetida e uma âncora inválida válidas de resto.
const ORIGIN_TEXT_CASES: readonly (readonly [unknown, readonly string[]])[] = [
  [ORIGIN_CASES[0], ['origins: esperava uma lista']],
  [
    ORIGIN_CASES[1],
    [
      'origins[0]: esperava um objeto',
      'origins[1].system: esperava texto não vazio',
      'origins[1].node: esperava um objeto com type, props e children',
      'origins[1].screen: obrigatório',
      'origins[2].kind: esperava um de: tree, measured',
    ],
  ],
  [
    ORIGIN_CASES[2],
    [
      'origins[0].node: esperava um objeto com type, props e children',
      'origins[0].screen: obrigatório',
      'origins[1].node: esperava um objeto com type, props e children',
      'origins[1].screen: obrigatório',
    ],
  ],
  [
    ORIGIN_CASES[3],
    [
      'origins[0].node.type: obrigatório (nome da chave, texto não vazio)',
      'origins[0].node.props: obrigatório (nome da chave, texto não vazio)',
      'origins[0].node.children: obrigatório (nome da chave, texto não vazio)',
      'origins[0].screen.anchor: chave desconhecida: anchor',
      'origins[0].screen.margin: chave desconhecida: margin',
      'origins[0].screen.scrim: chave desconhecida: scrim',
      'origins[0].screen.width.path: esperava um caminho (texto não vazio)',
      'origins[0].screen.height.path: caminho inválido "a[" (faltou "]")',
      'origins[0].screen.roots: esperava uma lista com pelo menos uma raiz',
      'origins[0].booleans: esperava { "true": texto, "false": texto }',
      'origins[0].examples[0]: esperava um objeto',
      'origins[0].examples[1].name: esperava texto não vazio',
      'origins[0].examples[1].file: esperava o caminho de um arquivo .json do pacote',
      'origins[0].examples[2].file: extensão inválida: esperava .json',
      'origins[0].examples[3].name: nome "x" repetido',
    ],
  ],
  [ORIGIN_CASES[4], ['origins[0].screen: obrigatório']],
  // A chave desconhecida com `": "` no nome e a âncora com `"; use "` (o defeito da RM1).
  [
    [{ system: 'a', 'x: y': 1 }],
    [
      'origins[0].x: y: chave desconhecida: x: y',
      'origins[0].node: esperava um objeto com type, props e children',
      'origins[0].screen: obrigatório',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('a; use b')],
    [
      'origins[0].screen.roots[0].anchor: âncora inválida: a; use b; use top-start, top, top-end, start, center, end, bottom-start, bottom, bottom-end',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('zz')],
    [
      'origins[0].screen.roots[0].anchor: âncora inválida: zz; use top-start, top, top-end, start, center, end, bottom-start, bottom, bottom-end',
    ],
  ],
  [
    [ORIGIN_VALID_WITH_ANCHOR('top'), ORIGIN_VALID_WITH_ANCHOR('top')],
    ['origins[1].system: origem repetida: a'],
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
      'origins[0].screen.roots[0].margin: margin só vale com anchor',
      'origins[0].screen.roots[1].path: caminho inválido "a[x]" (índice inválido: [x])',
      'origins[0].screen.roots[2].path: caminho inválido "a..b" (segmento vazio)',
      'origins[0].screen.roots[3].path: esperava um caminho (texto não vazio)',
    ],
  ],
  [
    [
      {
        ...ORIGIN_VALID_WITH_ANCHOR('top'),
        screen: { width: { path: 'a[*]' }, height: 1, roots: [{ path: 'a' }] },
      },
    ],
    ['origins[0].screen.width.path: "[*]" só vale em roots[].path'],
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
      'origins[0].screen.width.path: caminho inválido "a]b" (caractere inesperado: ])',
      'origins[0].examples[0].file: caminho inválido: use um caminho relativo à pasta da especialização, com "/", sem "." nem ".." e sem unidade (ex: components/button.json)',
    ],
  ],
];

function ORIGIN_VALID_WITH_ANCHOR(anchor: string): Raw {
  return {
    system: 'a',
    node: { type: 't', props: 'p', children: 'c' },
    screen: { width: 1, height: 1, roots: [{ path: 'a', anchor }] },
  };
}

describe('textos dos problemas das origens (parseOrigins)', () => {
  it.each(ORIGIN_TEXT_CASES.map((c, i) => [i, c[0], c[1]] as const))(
    'caso %i: o texto de cada problema não muda',
    (_i, origins, texts) => {
      expect(parseOrigins(origins).problems.map(originProblemText)).toEqual(texts);
    },
  );
});

describe('origem com valor do usuário no nome da chave ou na âncora (defeito da RM1)', () => {
  it('a chave desconhecida com ": " no nome sai no caminho certo, com o código no emissor', () => {
    const parsed = parseSpec(specWith([{ system: 'a', 'x: y': 1 }]));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const issue = (parsed.issues as readonly SpecIssue[]).find((i) =>
      i.message.includes('chave desconhecida'),
    );
    expect(issue).toEqual({
      path: 'origins[0].x: y',
      message: 'chave desconhecida: x: y',
      code: 'spec.tokenKeyUnknown',
      params: { key: 'x: y' },
    });
    locale.value = 'en-US';
    expect(messageText(asMessage(issue as Coded))).not.toMatch(PORTUGUESE);
  });

  it('a âncora com "; use " no valor mantém os parâmetros de origins.anchorInvalid', () => {
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

const ORIGIN_CODED_PROBLEMS: ReadonlySet<string> = new Set([
  'origins.anchorInvalid',
  'origins.expectedKind',
  'origins.systemRepeated',
]);

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
    // Os erros das variáveis (`let`/`$var`) nascem em `variables.ts`, que o `parseComponent` chama.
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
        // O parser monta este com a constante `COMPONENT_FORMAT`; o caso 0 acima o produz.
        if (code === 'component.formatInvalid') continue;
        // Os avisos de desenho (`origins.draw.*`) saem do catálogo por `templateMessage` (MB5), sem o
        // texto no código; `engineMessages.test.ts` os produz.
        // Os erros da tradução (`origins.error.*`, guarda da MB6) também.
        if (code.startsWith('origins.draw.') || code.startsWith('origins.error.'))
          continue;
        // Os três problemas com valor do usuário saem do catálogo por `codedProblem` (#1589), sem o
        // texto no `origin.ts`; os literais de "textos dos problemas das origens" os produzem.
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
