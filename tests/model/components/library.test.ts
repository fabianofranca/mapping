// Laboratório Componentes: a especialização aponta para um arquivo por componente.
import { describe, expect, it } from 'vitest';
import { findSlot } from '../../../src/model/components/arrange';
import {
  type TextFile,
  initialValues,
  instanceLabel,
  loadLibrary,
  resolvePath,
} from '../../../src/model/components/library';
import {
  SAMPLE_COMPONENTS,
  SAMPLE_FILES,
  SAMPLE_SPEC,
} from '../../../lab/components/samples';

describe('library', () => {
  it('resolve caminhos relativos ao arquivo da especialização', () => {
    expect(resolvePath('spec.json', 'components/button.json')).toBe(
      'components/button.json',
    );
    expect(resolvePath('design/spec.json', './components/button.json')).toBe(
      'design/components/button.json',
    );
    expect(resolvePath('design/specs/spec.json', '../components/x.json')).toBe(
      'design/components/x.json',
    );
  });

  it('carrega os exemplos: todo tipo com componente válido e sem problemas', () => {
    const lib = loadLibrary(SAMPLE_FILES);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(SAMPLE_COMPONENTS.length);
    for (const type of lib.types) {
      expect(type.component?.id, type.id).toBe(type.id);
      expect(type.componentPath).toBe(`components/${type.id}.json`);
    }
    const button = lib.types.find((t) => t.id === 'button');
    expect(button?.fields.map((f) => f.key)).toEqual([
      'label',
      'variant',
      'icon',
      'disabled',
      'action',
    ]);
    expect(initialValues(button!)).toEqual({
      label: 'Entrar',
      variant: 'primary',
      icon: 'não',
      disabled: 'não',
      action: null,
    });
    expect(instanceLabel(button!, { label: 'Salvar' })).toBe('Salvar');
    expect(instanceLabel(button!, { label: '  ' })).toBe('Botão');
  });

  it('registra arquivo ausente, componente inválido e JSON quebrado como problemas, sem derrubar o resto', () => {
    const files = SAMPLE_FILES.filter((f) => !f.path.endsWith('avatar.json')).map((f) =>
      f.path.endsWith('card.json') ? { ...f, text: '{"format":"mapping-component"}' } : f,
    );
    files.push({ path: 'components/quebrado.json', text: '{oops' });
    const lib = loadLibrary(files);
    expect(
      lib.problems.some((p) => p.includes('avatar') && p.includes('não encontrado')),
    ).toBe(true);
    expect(
      lib.problems.some((p) => p.endsWith('card.json: formatVersion: esperava 1')),
    ).toBe(true);
    // um problema por issue, cada um com o caminho do arquivo
    expect(lib.problems.filter((p) => p.includes('card.json: ')).length).toBeGreaterThan(
      1,
    );
    expect(
      lib.problems.some(
        (p) => p.includes('quebrado.json') && p.includes('JSON inválido'),
      ),
    ).toBe(true);
    expect(lib.types.find((t) => t.id === 'button')?.component).toBeDefined();
    expect(lib.types.find((t) => t.id === 'avatar')?.component).toBeUndefined();
  });

  it('sem especialização, lança; com duas, usa a primeira e avisa', () => {
    expect(() => loadLibrary([{ path: 'a.json', text: '{}' }])).toThrow(/mapping-spec/);
    const twice = [
      ...SAMPLE_FILES,
      { path: 'outra.json', text: JSON.stringify({ ...SAMPLE_SPEC, id: 'outra' }) },
    ];
    const lib = loadLibrary(twice);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems[0]).toMatch(/2 especializações/);
  });

  describe('origens e sources', () => {
    const originOf = (overrides: Record<string, unknown> = {}) => ({
      system: 'sdui',
      node: { type: 'type', props: 'props', children: 'children' },
      screen: {
        width: { path: 'w' },
        height: { path: 'h' },
        roots: [{ path: 'content' }],
      },
      ...overrides,
    });
    const specWith = (
      type: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ): TextFile[] => {
      const cardFile = SAMPLE_FILES.find((f) => f.path.endsWith('card.json'))!;
      const spec = {
        format: 'mapping-spec',
        formatVersion: 4,
        id: 's',
        name: 'S',
        version: 1,
        ...extra,
        layers: [
          {
            id: 'l',
            name: 'L',
            annotationTypes: [
              { id: 'card', name: 'Card', component: 'components/card.json', ...type },
            ],
          },
        ],
      };
      return [{ path: 'spec.json', text: JSON.stringify(spec) }, cardFile];
    };

    it('lê origins e sources (inclusive de outros sistemas) sem problemas', () => {
      const lib = loadLibrary(
        specWith(
          {
            sources: [
              { system: 'figma', id: '1:2', name: 'DS/Card' },
              { system: 'sdui', name: 'Card', slot: 'content', ignore: ['a'] },
            ],
            fields: [
              {
                key: 'k',
                type: 'enum',
                options: ['a', 'b'],
                sources: [
                  { system: 'figma', name: 'Kind', values: { A: 'a' } },
                  { system: 'sdui', name: 'x.y[0]', values: { '0': 'b' } },
                ],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.origins.map((o) => o.system)).toEqual(['sdui']);
      const card = lib.types[0]!;
      expect(card.sources).toEqual([
        { system: 'figma', id: '1:2', name: 'DS/Card' },
        { system: 'sdui', name: 'Card', slot: 'content', ignore: ['a'] },
      ]);
      expect(card.fields[0]!.sources).toHaveLength(2);
      expect(lib.problems.filter((p) => !p.includes('slot'))).toEqual([]);
    });

    it('sem origins nem sources: listas vazias', () => {
      const lib = loadLibrary(SAMPLE_FILES);
      expect(lib.origins).toEqual([]);
      for (const type of lib.types) {
        expect(type.sources).toEqual([]);
        for (const field of type.fields) expect(field.sources).toEqual([]);
      }
    });

    it('problemas de origins aparecem em library.problems, com caminho', () => {
      const lib = loadLibrary(
        specWith({}, { origins: [originOf({ extra: 1, node: { type: 'type' } })] }),
      );
      expect(lib.origins).toEqual([]);
      expect(lib.problems.some((p) => p.startsWith('origins[0].extra:'))).toBe(true);
      expect(lib.problems.some((p) => p.startsWith('origins[0].node.props:'))).toBe(true);
    });

    it('scrim que não é tipo da especialização é problema', () => {
      const lib = loadLibrary(
        specWith(
          {},
          {
            origins: [
              originOf({
                screen: {
                  width: 10,
                  height: 20,
                  roots: [{ path: 'm', scrim: 'nao-existe' }],
                },
              }),
            ],
          },
        ),
      );
      expect(lib.problems).toContain(
        'origins[0].screen.roots[0].scrim: tipo inexistente: nao-existe',
      );
    });

    it('slot do tipo precisa ser o nome do slot do componente', () => {
      const slotName = (() => {
        const lib = loadLibrary(SAMPLE_FILES);
        const card = lib.types.find((t) => t.id === 'card')!;
        return findSlot(card.component!)?.name;
      })();
      expect(slotName).toBeDefined();
      const ok = loadLibrary(
        specWith({ sources: [{ system: 'sdui', name: 'Card', slot: slotName }] }),
      );
      expect(ok.problems).toEqual([]);
      const wrong = loadLibrary(
        specWith({ sources: [{ system: 'sdui', name: 'Card', slot: 'outro' }] }),
      );
      expect(wrong.problems).toEqual([
        `card.sources[0].slot: o slot do componente é "${slotName}", não "outro"`,
      ]);
      // Componente sem slot: o botão.
      const buttonFile = SAMPLE_FILES.find((f) => f.path.endsWith('button.json'))!;
      const noSlot = loadLibrary([
        {
          path: 'spec.json',
          text: JSON.stringify({
            format: 'mapping-spec',
            formatVersion: 4,
            id: 's',
            name: 'S',
            version: 1,
            layers: [
              {
                id: 'l',
                name: 'L',
                annotationTypes: [
                  {
                    id: 'button',
                    name: 'B',
                    component: 'components/button.json',
                    sources: [{ system: 'sdui', name: 'B', slot: 'x' }],
                    fields: [],
                  },
                ],
              },
            ],
          }),
        },
        buttonFile,
      ]);
      expect(noSlot.problems).toEqual([
        'button.sources[0].slot: o componente não tem slot',
      ]);
    });

    it('values só em campo enum e com destinos dentro de options', () => {
      const lib = loadLibrary(
        specWith({
          fields: [
            {
              key: 'texto',
              type: 'string',
              sources: [{ system: 'sdui', name: 'a', values: { x: 'y' } }],
            },
            {
              key: 'modo',
              type: 'enum',
              options: ['a', 'b'],
              sources: [{ system: 'figma', name: 'M', values: { X: 'a', Y: 'zzz' } }],
            },
          ],
        }),
      );
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].values: só vale em campo enum',
        'card.fields[1].sources[0].values.Y: destino fora de options: zzz',
      ]);
    });

    it('fonte malformada de tipo ou de campo vira problema e é descartada', () => {
      const lib = loadLibrary(
        specWith({
          sources: [
            { system: 'sdui' },
            { name: 'X' },
            { system: 'sdui', name: 'X', extra: 1 },
            { system: 'sdui', name: 'Ok', ignore: 'a' },
            { system: 'sdui', name: 'Certo' },
          ],
          fields: [
            {
              key: 'a',
              type: 'string',
              sources: [{ system: 'sdui' }, { system: 'sdui', name: 'ok' }, 3],
            },
          ],
        }),
      );
      expect(lib.types[0]!.sources).toEqual([{ system: 'sdui', name: 'Certo' }]);
      expect(lib.types[0]!.fields[0]!.sources).toEqual([{ system: 'sdui', name: 'ok' }]);
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].name: esperava texto não vazio',
        'card.fields[0].sources[2]: esperava um objeto',
        'card.sources[0]: precisa de id ou name',
        'card.sources[1].system: esperava texto não vazio',
        'card.sources[2].extra: chave desconhecida: extra',
        'card.sources[3].ignore: esperava uma lista de textos',
      ]);
    });

    it('o name de um campo, numa origem executável, é um caminho válido sem [*]', () => {
      const lib = loadLibrary(
        specWith(
          {
            fields: [
              {
                key: 'a',
                type: 'string',
                sources: [
                  { system: 'sdui', name: 'a..b' },
                  { system: 'sdui', name: 'a[*]' },
                  { system: 'figma', name: 'qualquer coisa..' },
                ],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].name: caminho inválido "a..b"',
        'card.fields[0].sources[1].name: caminho inválido "a[*]"',
      ]);
    });
  });
});
