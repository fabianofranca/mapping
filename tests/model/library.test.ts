// Validador da biblioteca em três níveis (`validateLibrary`, etapa Biblioteca, fase B1). O
// `loadLibrary` do motor tem o próprio teste em `tests/model/components/library.test.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { M3_FILES } from '../../lab/components/samplesMaterial3';
import {
  type LibraryFile,
  type LibraryInput,
  type LibraryIssue,
  validateLibrary,
} from '../../src/model/library';
import { parseSpec, type Spec } from '../../src/model/spec';

// ---------------------------------------------------------------------------------------
// Um pacote pequeno, válido, montado em memória
// ---------------------------------------------------------------------------------------

const SPEC = 'mini.spec.json';

const FONT = { family: 'Roboto', size: 14, weight: 500, lineHeight: 20 };

const BUTTON_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'mini-button',
  name: 'Botão',
  size: { width: 120, height: 40 },
  minSize: { width: 96, height: 40 },
  preview: { label: 'Salvar', variant: 'primary' },
  template: {
    type: 'frame',
    name: 'button',
    layout: { type: 'row', padding: [0, 16], align: 'center', justify: 'center' },
    fill: { $switch: 'variant', cases: { primary: '#6750A4' }, default: '#FFFFFF' },
    children: [
      {
        type: 'text',
        name: 'label',
        text: { $field: 'label', default: 'Botão' },
        font: FONT,
        color: '#000000',
      },
    ],
  },
};

const CARD_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'mini-card',
  name: 'Cartão',
  size: { width: 200, height: 120 },
  minSize: { width: 120, height: 60 },
  preview: { title: 'Título' },
  template: {
    type: 'frame',
    name: 'card',
    layout: { type: 'none' },
    fill: '#F3EDF7',
    children: [
      {
        type: 'text',
        name: 'title',
        text: { $field: 'title', default: 'Título' },
        font: FONT,
        color: '#000000',
        anchors: { left: 8, top: 8 },
      },
      {
        type: 'slot',
        name: 'content',
        anchors: { left: 8, right: 8, top: 32, bottom: 8 },
        layout: { type: 'column', gap: 4 },
      },
    ],
  },
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'mini',
  name: 'Mini',
  version: 2,
  fonts: [{ family: 'Roboto', file: 'fonts/Roboto-Medium.ttf', weight: 500 }],
  origins: [
    {
      system: 'sdui',
      node: { type: 'type', props: 'props', children: 'children' },
      screen: {
        width: { path: 'screen.width' },
        height: { path: 'screen.height' },
        roots: [{ path: 'content' }],
      },
      examples: [{ name: 'Home', file: 'examples/home.sdui.json' }],
    },
  ],
  layers: [
    {
      id: 'ui',
      name: 'Interface',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'mini-button',
          name: 'Botão',
          labelField: 'label',
          component: 'components/mini-button.json',
          doc: 'docs/mini-button.md',
          examples: [
            { name: 'Primário', values: { label: 'Salvar', variant: 'primary' } },
            { name: 'Texto', values: { label: 'Cancelar', variant: 'text' } },
            { name: 'Nó SDUI', system: 'sdui', file: 'examples/button.sdui.json' },
          ],
          sources: [{ system: 'sdui', name: 'Button' }],
          fields: [
            {
              key: 'label',
              type: 'string',
              required: true,
              sources: [{ system: 'sdui', path: 'text' }],
            },
            {
              key: 'variant',
              type: 'enum',
              options: ['primary', 'text'],
              default: 'primary',
              sources: [{ system: 'sdui', path: 'style' }],
            },
          ],
        },
        {
          id: 'mini-card',
          name: 'Cartão',
          component: 'components/mini-card.json',
          sources: [{ system: 'sdui', name: 'Card', slot: 'content' }],
          fields: [
            {
              key: 'title',
              type: 'string',
              sources: [{ system: 'sdui', path: 'title' }],
            },
          ],
        },
      ],
    },
  ],
};

const HOME_JSON = {
  screen: { width: 360, height: 640 },
  content: {
    type: 'Card',
    props: { title: 'Olá' },
    children: [{ type: 'Button', props: { text: 'Ir', style: 'primary' } }],
  },
};

const BUTTON_NODE_JSON = { type: 'Button', props: { text: 'Salvar', style: 'text' } };

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function miniPackage(): LibraryFile[] {
  return [
    { path: SPEC, text: json(SPEC_JSON) },
    { path: 'components/mini-button.json', text: json(BUTTON_COMPONENT) },
    { path: 'components/mini-card.json', text: json(CARD_COMPONENT) },
    { path: 'docs/mini-button.md', text: '# Botão\n\nAção principal.\n' },
    { path: 'examples/button.sdui.json', text: json(BUTTON_NODE_JSON) },
    { path: 'examples/home.sdui.json', text: json(HOME_JSON) },
    { path: 'fonts/Roboto-Medium.ttf', binary: true },
    { path: 'fonts/LEIA-ME.txt', text: 'Licença da fonte.' },
  ];
}

// ---------------------------------------------------------------------------------------
// Edição dos arquivos do pacote (sem `any`: o JSON é percorrido como `unknown`)
// ---------------------------------------------------------------------------------------

type JsonPath = readonly (string | number)[];

function setIn(root: unknown, path: JsonPath, value: unknown): void {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) node = Reflect.get(Object(node), key);
  const last = path[path.length - 1];
  if (last === undefined) throw new Error('caminho vazio');
  if (value === undefined) Reflect.deleteProperty(Object(node), last);
  else Reflect.set(Object(node), last, value);
}

/** Troca (ou, com `undefined`, apaga) o valor num caminho do JSON de um arquivo do pacote. */
function patch(
  files: readonly LibraryFile[],
  path: string,
  at: JsonPath,
  value: unknown,
): LibraryFile[] {
  return files.map((file) => {
    if (file.path !== path) return file;
    const data: unknown = JSON.parse(file.text ?? 'null');
    setIn(data, at, value);
    return { ...file, text: json(data) };
  });
}

const without = (files: readonly LibraryFile[], path: string): LibraryFile[] =>
  files.filter((f) => f.path !== path);

const withText = (
  files: readonly LibraryFile[],
  path: string,
  text: string,
): LibraryFile[] => files.map((f) => (f.path === path ? { ...f, text } : f));

const TYPE0 = ['layers', 0, 'annotationTypes', 0] as const;
const TYPE1 = ['layers', 0, 'annotationTypes', 1] as const;

const validate = (
  files: readonly LibraryFile[],
  extra: Partial<LibraryInput> = {},
): ReturnType<typeof validateLibrary> => validateLibrary({ files, ...extra });

/** `[severity, file, path, message]` para comparar sem ruído. */
const brief = (issue: LibraryIssue): [string, string, string, string] => [
  issue.severity,
  issue.file,
  issue.path,
  issue.message,
];

// ---------------------------------------------------------------------------------------
// Pacote válido
// ---------------------------------------------------------------------------------------

describe('validateLibrary: pacote válido', () => {
  it('não tem erro nem aviso, e o resumo conta o pacote', () => {
    const report = validate(miniPackage());
    expect(report.issues.map(brief)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.spec?.id).toBe('mini');
    expect(report.summary).toEqual({
      level: 3,
      types: 2,
      components: 2,
      docs: 1,
      examples: 4, // 3 do tipo mini-button + 1 tela de exemplo da origem
      fonts: 1,
    });
  });

  it('acha a especialização sozinha ou pelo specPath, com o pacote numa subpasta', () => {
    const nested = miniPackage().map((f) => ({ ...f, path: `pack/${f.path}` }));
    expect(validate(nested).issues).toEqual([]);
    expect(validate(nested, { specPath: `pack/${SPEC}` }).issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// Um pacote quebrado por regra
// ---------------------------------------------------------------------------------------

describe('validateLibrary: nível 1 (cada arquivo)', () => {
  it('sem especialização no pacote: um erro do pacote e nada mais', () => {
    const report = validate([{ path: 'a.md', text: 'x' }]);
    expect(report.ok).toBe(false);
    expect(report.issues.map(brief)).toEqual([
      [
        'error',
        '',
        '',
        'nenhuma especialização encontrada: o pacote precisa de um arquivo .json com "format": "mapping-spec"',
      ],
    ]);
    expect(report.spec).toBeUndefined();
    expect(report.summary).toEqual({
      level: 1,
      types: 0,
      components: 0,
      docs: 0,
      examples: 0,
      fonts: 0,
    });
  });

  it('duas especializações sem specPath: pede para indicar; com specPath inexistente: erro no arquivo', () => {
    const two = [...miniPackage(), { path: 'outra.spec.json', text: json(SPEC_JSON) }];
    expect(validate(two).issues.map(brief)).toEqual([
      [
        'error',
        '',
        '',
        'há 2 especializações no pacote (mini.spec.json, outra.spec.json): indique qual validar',
      ],
    ]);
    expect(validate(miniPackage(), { specPath: 'nada.json' }).issues.map(brief)).toEqual([
      ['error', 'nada.json', '', 'arquivo da especialização não encontrado: nada.json'],
    ]);
  });

  it('especialização inválida: o erro do parseSpec com o caminho; sem nível 2 nem 3', () => {
    // O componente continua quebrado, mas sem especialização legível ninguém o lê.
    const files = patch(miniPackage(), SPEC, [...TYPE0, 'fields', 0, 'type'], 'texto');
    const report = validate(withText(files, 'components/mini-button.json', '{'));
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({
      file: SPEC,
      path: 'layers[0].annotationTypes[0].fields[0].type',
      severity: 'error',
    });
    expect(report.errors[0]?.message).toContain('"texto" inválido');
    expect(report.spec).toBeUndefined();
    expect(report.summary.level).toBe(1);
  });

  it('especialização com JSON quebrado', () => {
    const report = validate(withText(miniPackage(), SPEC, '{"format": "mapping-spec",'));
    // Não é candidata a especialização: o pacote fica sem nenhuma.
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.message).toContain('nenhuma especialização');
    const named = validate(withText(miniPackage(), SPEC, '{oops'), { specPath: SPEC });
    expect(named.errors).toHaveLength(1);
    expect(named.errors[0]).toMatchObject({ file: SPEC, path: '' });
    expect(named.errors[0]?.message).toContain('JSON inválido');
  });

  it('componente inválido: erros no arquivo dele, com o caminho dentro dele; o outro segue', () => {
    const files = patch(
      miniPackage(),
      'components/mini-button.json',
      ['formatVersion'],
      7,
    );
    const report = validate(files);
    expect(report.ok).toBe(false);
    expect(report.errors.map(brief)).toEqual([
      ['error', 'components/mini-button.json', 'formatVersion', 'esperava 1, 2 ou 3'],
    ]);
    // O botão não passa pelo nível 3, mas a tela de exemplo da origem ainda o usa e avisa.
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        SPEC,
        'origins[0].examples[0].file',
        'tela de exemplo "Home" do sistema "sdui": content.children[0]: tipo sem componente: mini-button',
      ],
    ]);
  });

  it('componente com JSON quebrado', () => {
    const report = validate(
      withText(miniPackage(), 'components/mini-card.json', '{oops'),
    );
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({
      file: 'components/mini-card.json',
      path: '',
    });
    expect(report.errors[0]?.message).toContain('JSON inválido');
  });

  it('component apontando para arquivo que não existe', () => {
    const report = validate(without(miniPackage(), 'components/mini-card.json'));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'layers[0].annotationTypes[1].component',
        'arquivo não encontrado: components/mini-card.json',
      ],
    ]);
  });

  it('doc para arquivo que não existe', () => {
    const report = validate(without(miniPackage(), 'docs/mini-button.md'));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'layers[0].annotationTypes[0].doc',
        'arquivo não encontrado: docs/mini-button.md',
      ],
    ]);
  });

  it('.md vazio é aviso, não erro', () => {
    const report = validate(withText(miniPackage(), 'docs/mini-button.md', '  \n'));
    expect(report.ok).toBe(true);
    expect(report.warnings.map(brief)).toEqual([
      ['warning', 'docs/mini-button.md', '', 'documento vazio'],
    ]);
  });

  it('.json e .md que ninguém referencia são aviso; outros arquivos passam', () => {
    const files = [
      ...miniPackage(),
      { path: 'components/velho.json', text: '{}' },
      { path: 'docs/solto.md', text: '# solto' },
      { path: 'fonts/Outra.ttf', binary: true },
    ];
    const report = validate(files);
    expect(report.ok).toBe(true);
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        'components/velho.json',
        '',
        'arquivo não referenciado pela especialização',
      ],
      ['warning', 'docs/solto.md', '', 'arquivo não referenciado pela especialização'],
    ]);
  });

  it('avisos da especialização (specWarnings) entram como aviso, no caminho dela', () => {
    const files = patch(miniPackage(), SPEC, ['platforms'], [{ id: 'web', name: 'Web' }]);
    const report = validate(files, { level: 1 });
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => [w.file, w.path])).toEqual([
      [SPEC, 'layers[0].annotationTypes[0]'],
      [SPEC, 'layers[0].annotationTypes[1]'],
      [SPEC, 'platforms[0]'],
    ]);
  });
});

describe('validateLibrary: nível 2 (coerência entre arquivos)', () => {
  it('campo citado pelo template que não existe no tipo: erro no componente, no ponto da citação', () => {
    const files = patch(
      miniPackage(),
      'components/mini-button.json',
      ['template', 'children', 0, 'text', '$field'],
      'rotulo',
    );
    const report = validate(files);
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/mini-button.json',
        'template.children[0].text.$field',
        'o desenho usa o campo "rotulo", que o tipo "mini-button" não declara',
      ],
    ]);
    // E o campo que o desenho deixou de usar vira aviso no tipo.
    expect(report.warnings.map(brief)).toContainEqual([
      'warning',
      SPEC,
      'layers[0].annotationTypes[0].fields[0]',
      'o campo "label" do tipo "mini-button" não é usado pelo desenho do componente components/mini-button.json',
    ]);
  });

  it('slot declarado que não existe no componente (e componente sem slot)', () => {
    const wrongName = patch(
      miniPackage(),
      SPEC,
      [...TYPE1, 'sources', 0, 'slot'],
      'itens',
    );
    expect(validate(wrongName).errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'layers[0].annotationTypes[1].sources[0].slot',
        'o slot do componente components/mini-card.json é "content", não "itens"',
      ],
    ]);
    const noSlot = patch(
      miniPackage(),
      SPEC,
      [...TYPE0, 'sources', 0, 'slot'],
      'content',
    );
    expect(validate(noSlot).errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'layers[0].annotationTypes[0].sources[0].slot',
        'o componente components/mini-button.json não tem slot',
      ],
    ]);
  });

  it('exemplo externo com arquivo ausente', () => {
    const report = validate(without(miniPackage(), 'examples/button.sdui.json'));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'layers[0].annotationTypes[0].examples[2].file',
        'arquivo não encontrado: examples/button.sdui.json',
      ],
    ]);
  });

  it('exemplo externo com JSON inválido, também na tela de exemplo da origem', () => {
    const files = withText(
      withText(miniPackage(), 'examples/button.sdui.json', '{"type": '),
      'examples/home.sdui.json',
      'não é json',
    );
    const report = validate(files);
    expect(report.errors.map((e) => [e.file, e.path])).toEqual([
      ['examples/button.sdui.json', ''],
      ['examples/home.sdui.json', ''],
    ]);
    expect(report.errors.every((e) => e.message.startsWith('JSON inválido'))).toBe(true);
  });

  it('tela de exemplo da origem com arquivo ausente', () => {
    const report = validate(without(miniPackage(), 'examples/home.sdui.json'));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'origins[0].examples[0].file',
        'arquivo não encontrado: examples/home.sdui.json',
      ],
    ]);
  });

  it('fonte declarada sem o arquivo é aviso, não erro', () => {
    const report = validate(without(miniPackage(), 'fonts/Roboto-Medium.ttf'));
    expect(report.ok).toBe(true);
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        SPEC,
        'fonts[0].file',
        'arquivo da fonte "Roboto" não encontrado: fonts/Roboto-Medium.ttf; o desenho usa a fonte do sistema',
      ],
    ]);
  });

  it('scrim que não é tipo', () => {
    const files = patch(miniPackage(), SPEC, ['origins', 0, 'screen', 'roots', 1], {
      path: 'modal',
      anchor: 'bottom',
      scrim: 'nao-existe',
    });
    expect(validate(files).errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'origins[0].screen.roots[1].scrim',
        'o tipo "nao-existe" não existe na especialização',
      ],
    ]);
  });

  it('dois tipos no mesmo arquivo de componente: aviso no segundo; campos do arquivo que o outro tipo não tem: erro', () => {
    const files = patch(
      miniPackage(),
      SPEC,
      [...TYPE1, 'component'],
      'components/mini-button.json',
    );
    const report = validate(files, { level: 2 });
    expect(report.warnings.map(brief)).toContainEqual([
      'warning',
      SPEC,
      'layers[0].annotationTypes[1].component',
      'o arquivo components/mini-button.json já é o componente do tipo "mini-button"',
    ]);
    // O cartão não declara `label` nem `variant`, que o desenho do botão usa (e o botão não
    // tem o slot que o cartão declara).
    expect(report.errors.map((e) => [e.file, e.path, e.message])).toEqual([
      [
        SPEC,
        'layers[0].annotationTypes[1].sources[0].slot',
        'o componente components/mini-button.json não tem slot',
      ],
      [
        'components/mini-button.json',
        'template.children[0].text.$field',
        'o desenho usa o campo "label", que o tipo "mini-card" não declara',
      ],
      [
        'components/mini-button.json',
        'template.fill.$switch',
        'o desenho usa o campo "variant", que o tipo "mini-card" não declara',
      ],
    ]);
  });

  it('campo do preview que o tipo não tem é aviso no componente', () => {
    const files = patch(
      miniPackage(),
      'components/mini-card.json',
      ['preview', 'subtitulo'],
      'x',
    );
    expect(validate(files).warnings.map(brief)).toEqual([
      [
        'warning',
        'components/mini-card.json',
        'preview.subtitulo',
        'o tipo "mini-card" não tem o campo "subtitulo"',
      ],
    ]);
  });
});

describe('validateLibrary: contrato de versão (previous)', () => {
  const TYPE2 = ['layers', 0, 'annotationTypes', 2] as const;

  /**
   * A versão anterior do pacote: o `mini` com um terceiro tipo sem componente, `mini-note`, que
   * tem o campo `legado` e a tabela `linhas` de duas colunas.
   */
  function previousSpec(version = 1, note = true): Spec {
    const old: unknown = structuredClone(SPEC_JSON);
    setIn(old, ['version'], version);
    if (note) {
      setIn(old, TYPE2, {
        id: 'mini-note',
        name: 'Nota',
        fields: [
          { key: 'legado', type: 'string' },
          {
            key: 'linhas',
            type: 'table',
            columns: [
              { key: 'a', type: 'string' },
              { key: 'b', type: 'string' },
            ],
          },
        ],
      });
    }
    const parsed = parseSpec(old);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    return parsed.spec;
  }

  /** O pacote novo: `mini-note` sem o campo `legado` e sem a coluna `b` (duas quebras). */
  function nextPackage(): LibraryFile[] {
    return patch(miniPackage(), SPEC, TYPE2, {
      id: 'mini-note',
      name: 'Nota',
      fields: [{ key: 'linhas', type: 'table', columns: [{ key: 'a', type: 'string' }] }],
    });
  }

  it('sem previous o contrato não roda', () => {
    expect(validate(nextPackage()).issues).toEqual([]);
  });

  it('quebra sem migração é erro, com a mensagem e o caminho da quebra', () => {
    const report = validate(nextPackage(), { previous: previousSpec() });
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => [e.file, e.path])).toEqual([
      [SPEC, 'layers[0].annotationTypes[2].fields[0]'],
      [SPEC, 'layers[0].annotationTypes[2].fields[1].columns[1]'],
    ]);
    expect(report.errors[0]?.message).toContain('"legado"');
    expect(report.errors[0]?.message).toContain('remove-field');
    expect(report.errors[1]?.message).toContain('"b"');
  });

  it('migração declarada cobre a quebra, inclusive a coluna de table (tabela.coluna)', () => {
    const files = patch(
      nextPackage(),
      SPEC,
      ['migrations'],
      [
        {
          from: 1,
          to: 2,
          steps: [
            { op: 'remove-field', type: 'mini-note', field: 'legado' },
            { op: 'remove-field', type: 'mini-note', field: 'linhas.b' },
          ],
        },
      ],
    );
    const report = validate(files, { previous: previousSpec() });
    expect(report.issues.map(brief)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('version que não cresceu é erro', () => {
    const report = validate(miniPackage(), { previous: previousSpec(2, false) });
    expect(report.errors.map(brief)).toEqual([
      ['error', SPEC, 'version', 'a versão não cresceu: a anterior é 2 e esta é 2'],
    ]);
  });

  it('versão anterior de outra especialização é erro e não compara mais nada', () => {
    const other: unknown = structuredClone(SPEC_JSON);
    setIn(other, ['id'], 'outra');
    setIn(other, ['version'], 1);
    const parsed = parseSpec(other);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const report = validate(nextPackage(), { previous: parsed.spec });
    expect(report.errors.map(brief)).toEqual([
      ['error', SPEC, 'id', 'a versão anterior é da especialização "outra", não "mini"'],
    ]);
  });

  it('passo da migração que cita o que não existia na versão anterior é aviso', () => {
    const files = patch(
      nextPackage(),
      SPEC,
      ['migrations'],
      [
        {
          from: 1,
          to: 2,
          steps: [
            { op: 'remove-field', type: 'mini-note', field: 'legado' },
            { op: 'remove-field', type: 'mini-note', field: 'linhas.b' },
            { op: 'remove-type', type: 'fantasma', mode: 'delete' },
            { op: 'rename-field', type: 'mini-note', from: 'sumiu', to: 'linhas' },
          ],
        },
      ],
    );
    const report = validate(files, { previous: previousSpec() });
    expect(report.ok).toBe(true);
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        SPEC,
        'migrations[0].steps[2].type',
        'o tipo "fantasma" não existia na versão 1',
      ],
      [
        'warning',
        SPEC,
        'migrations[0].steps[3].from',
        'o campo "sumiu" do tipo "mini-note" não existia na versão 1',
      ],
    ]);
  });
});

describe('validateLibrary: nível 3 (prova de desenho)', () => {
  it('conteúdo que não cabe vira aviso (aproximado), com o caso e o tamanho', () => {
    const files = patch(miniPackage(), 'components/mini-button.json', ['minSize'], {
      width: 20,
      height: 40,
    });
    const report = validate(files);
    expect(report.ok).toBe(true);
    // preview e os dois exemplos de valores, no tamanho mínimo; o tamanho inicial cabe.
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        'components/mini-button.json',
        'preview',
        'tipo "mini-button", o preview, tamanho mínimo 20×40: conteúdo maior que a caixa: button (aproximado)',
      ],
      [
        'warning',
        SPEC,
        'layers[0].annotationTypes[0].examples[0]',
        'tipo "mini-button", o exemplo "Primário", tamanho mínimo 20×40: conteúdo maior que a caixa: button (aproximado)',
      ],
      [
        'warning',
        SPEC,
        'layers[0].annotationTypes[0].examples[1]',
        'tipo "mini-button", o exemplo "Texto", tamanho mínimo 20×40: conteúdo maior que a caixa: button (aproximado)',
      ],
    ]);
  });

  it('exemplo de sistema externo: propriedade desconhecida e tipo sem tipo de anotação são avisos', () => {
    const node = {
      type: 'Button',
      props: { text: 'Salvar', style: 'text', cor: 'vermelho' },
      children: [{ type: 'Desconhecido' }],
    };
    const report = validate(
      withText(miniPackage(), 'examples/button.sdui.json', json(node)),
    );
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => [w.file, w.path])).toEqual([
      [SPEC, 'layers[0].annotationTypes[0].examples[2].file'],
      [SPEC, 'layers[0].annotationTypes[0].examples[2].file'],
    ]);
    expect(report.warnings[0]?.message).toBe(
      'exemplo "Nó SDUI" do sistema "sdui": props.cor: propriedade desconhecida em Button',
    );
    expect(report.warnings[1]?.message).toContain(
      'tipo externo sem tipo de anotação: Desconhecido',
    );
  });

  it('exemplo de sistema externo que é de outro tipo: aviso', () => {
    const report = validate(
      withText(
        miniPackage(),
        'examples/button.sdui.json',
        json({ type: 'Card', props: { title: 'x' } }),
      ),
    );
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        SPEC,
        'layers[0].annotationTypes[0].examples[2].file',
        'exemplo "Nó SDUI" do sistema "sdui": o nó corresponde ao tipo "mini-card", não a "mini-button"',
      ],
    ]);
  });

  it('tela de exemplo da origem que a declaração não lê é erro', () => {
    const report = validate(
      withText(miniPackage(), 'examples/home.sdui.json', json({ screen: {} })),
    );
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        SPEC,
        'origins[0].examples[0].file',
        'tela de exemplo "Home" do sistema "sdui": largura da tela ausente ou inválida (screen.width)',
      ],
    ]);
  });

  it('tela de exemplo da origem com propriedade desconhecida: aviso', () => {
    const home = structuredClone(HOME_JSON);
    Reflect.set(Object(home.content.children[0]?.props), 'extra', 1);
    const report = validate(
      withText(miniPackage(), 'examples/home.sdui.json', json(home)),
    );
    expect(report.ok).toBe(true);
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        SPEC,
        'origins[0].examples[0].file',
        'tela de exemplo "Home" do sistema "sdui": content.children[0].props.extra: propriedade desconhecida em Button',
      ],
    ]);
  });
});

describe('validateLibrary: nível por nível', () => {
  /** Um problema de cada nível: arquivo de componente (1), slot (2) e conteúdo que não cabe (3). */
  function brokenAtEveryLevel(): LibraryFile[] {
    let files = patch(miniPackage(), 'components/mini-card.json', ['formatVersion'], 9);
    files = patch(files, SPEC, [...TYPE0, 'sources', 0, 'slot'], 'content');
    return patch(files, 'components/mini-button.json', ['minSize'], {
      width: 20,
      height: 40,
    });
  }

  it('level 1 só produz issues do nível 1', () => {
    const report = validate(brokenAtEveryLevel(), { level: 1 });
    expect(report.errors.map((e) => [e.file, e.path])).toEqual([
      ['components/mini-card.json', 'formatVersion'],
    ]);
    expect(report.warnings).toEqual([]);
    expect(report.summary.level).toBe(1);
    expect(report.summary.types).toBe(2); // o resumo conta o pacote mesmo parando no nível 1
  });

  it('level 2 acrescenta o nível 2 e não chega ao 3', () => {
    const report = validate(brokenAtEveryLevel(), { level: 2 });
    expect(report.issues.map((i) => [i.severity, i.file])).toEqual([
      ['error', 'components/mini-card.json'],
      ['error', SPEC],
    ]);
    expect(report.summary.level).toBe(2);
  });

  it('level 3 (padrão) mantém a ordem: nível 1, depois 2, depois 3', () => {
    const report = validate(brokenAtEveryLevel());
    expect(report.summary.level).toBe(3);
    expect(report.issues.map((i) => [i.severity, i.file])).toEqual([
      ['error', 'components/mini-card.json'], // 1: componente inválido
      ['error', SPEC], // 2: slot que o componente não tem
      ['warning', 'components/mini-button.json'], // 3: preview no tamanho mínimo
      ['warning', SPEC], // 3: exemplo "Primário"
      ['warning', SPEC], // 3: exemplo "Texto"
      ['warning', SPEC], // 3: a tela de exemplo da origem usa o cartão, que não tem componente
    ]);
    expect(report.errors).toHaveLength(2);
    expect(report.warnings).toHaveLength(4);
    expect(report.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Material 3 inteiro (em memória; o pacote em examples/ é conferido por outro teste)
// ---------------------------------------------------------------------------------------

describe('validateLibrary: Material 3', () => {
  const SDUI_SCREEN = readFileSync(
    join(__dirname, '../../lab/components/sdui/settings.sdui.json'),
    'utf8',
  );

  const m3Files = (fonts: boolean): LibraryFile[] => [
    ...M3_FILES.map((f) => ({ path: f.path, text: f.text })),
    ...(fonts
      ? [
          { path: 'fonts/Roboto-Regular.ttf', binary: true },
          { path: 'fonts/Roboto-Medium.ttf', binary: true },
        ]
      : []),
  ];

  /** Os avisos do preview no tamanho mínimo: o medidor aproximado é folgado no que o navegador mede. */
  const MIN_SIZE_WARNINGS = [
    'components/m3-button.json',
    'components/m3-fab.json',
    'components/m3-text-field.json',
    'components/m3-switch.json',
    'components/m3-chip.json',
    'components/m3-card.json',
    'components/m3-list-item.json',
    'components/m3-navigation-bar.json',
    'components/m3-navigation-bar.json',
    'components/m3-navigation-bar.json',
    'components/m3-bottom-sheet.json',
  ];

  it('zero erros; os avisos são os que o teste lista', () => {
    const report = validate(m3Files(true));
    expect(report.errors.map(brief)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 15,
      components: 15,
      fonts: 2,
    });
    // Nenhum preview cita campo que o tipo não tem: o validador acusou isso nos containers
    // (padding no Box, alignment e arrangement no Row e no Column) e o Material 3 foi corrigido.
    const previews = report.warnings
      .filter((w) => w.path.startsWith('preview.'))
      .map((w) => `${w.file}:${w.path}`);
    expect(previews).toEqual([]);
    const drawing = report.warnings.filter((w) => w.message.endsWith('(aproximado)'));
    expect(drawing.map((w) => w.file)).toEqual(MIN_SIZE_WARNINGS);
    expect(drawing.every((w) => w.message.includes('tamanho mínimo'))).toBe(true);
    // A tela de exemplo do SDUI está no pacote de teste, mas o M3_SPEC não a declara.
    const others = report.warnings.filter(
      (w) => !w.path.startsWith('preview.') && !w.message.endsWith('(aproximado)'),
    );
    expect(others.map(brief)).toEqual([]);
  });

  it('sem os arquivos das fontes: um aviso por fonte, nenhum erro', () => {
    const report = validate(m3Files(false), { level: 2 });
    expect(report.errors).toEqual([]);
    expect(
      report.warnings.filter((w) => w.path.startsWith('fonts[')).map((w) => w.path),
    ).toEqual(['fonts[0].file', 'fonts[1].file']);
  });

  it('com a tela de exemplo do SDUI declarada na origem: nenhum erro, e o aviso de arquivo solto some', () => {
    const files = [
      ...patch(
        m3Files(true),
        'material3.spec.json',
        ['origins', 0, 'examples'],
        [{ name: 'Settings', file: 'examples/settings.sdui.json' }],
      ),
      { path: 'examples/settings.sdui.json', text: SDUI_SCREEN },
    ];
    const report = validate(files);
    expect(report.errors.map(brief)).toEqual([]);
    const screen = report.warnings.filter((w) => w.path.startsWith('origins['));
    expect(screen.map(brief)).toEqual([]);
    expect(report.summary.examples).toBe(1);
  });

  it('a tela de exemplo do SDUI fora da origem é só um arquivo não referenciado (aviso)', () => {
    const files = [
      ...m3Files(true),
      { path: 'examples/settings.sdui.json', text: SDUI_SCREEN },
    ];
    const report = validate(files, { level: 1 });
    expect(report.errors).toEqual([]);
    expect(report.warnings.map(brief)).toEqual([
      [
        'warning',
        'examples/settings.sdui.json',
        '',
        'arquivo não referenciado pela especialização',
      ],
    ]);
  });
});
