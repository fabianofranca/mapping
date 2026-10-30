// Validador da biblioteca com o nó `image` (componente `formatVersion` 3): o campo ligado ao
// `src` é `string` (campo do tipo ou coluna da `table` dentro de um `repeat`); nenhuma origem é
// declarada; o literal de forma inválida chega como erro do nível 1.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'avatar.spec.json';

const image = (src: unknown): Raw => ({ type: 'image', src, width: 24, height: 24 });
const text = (field: string): Raw => ({ type: 'text', text: { $field: field } });

function component(children: Raw[]): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 3,
    id: 'avatar',
    name: 'Avatar',
    size: { width: 200, height: 60 },
    minSize: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'row', gap: 8 }, children },
  };
}

function repeatOf(src: unknown): Raw {
  return {
    type: 'repeat',
    field: 'fotos',
    template: { type: 'frame', layout: { type: 'row' }, children: [image(src)] },
  };
}

function spec(): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'avatar',
    name: 'Avatar',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'avatar',
            name: 'Avatar',
            component: 'components/avatar.json',
            fields: [
              { key: 'nome', type: 'string' },
              { key: 'foto', type: 'string' },
              { key: 'idade', type: 'number' },
              { key: 'papel', type: 'enum', options: ['a', 'b'] },
              { key: 'desde', type: 'date' },
              {
                key: 'fotos',
                type: 'table',
                columns: [
                  { key: 'url', type: 'string' },
                  { key: 'tamanho', type: 'number' },
                  { key: 'foto', type: 'number' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function validate(comp: Raw) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec()) },
      { path: 'components/avatar.json', text: JSON.stringify(comp) },
    ],
  });
}

const brief = (i: LibraryIssue) => [i.severity, i.file, i.path, i.message];

describe('validateLibrary com image', () => {
  it('o src ligado a um campo string passa, sem declarar origem', () => {
    const report = validate(component([image({ $field: 'foto' }), text('nome')]));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('o src literal https:// passa', () => {
    const report = validate(
      component([image('https://cdn.exemplo.com/a.png'), text('nome')]),
    );
    expect(report.errors).toEqual([]);
  });

  it.each(['number', 'enum', 'date', 'table'])(
    'o src ligado a um campo %s é erro, no caminho do src.$field',
    (kind) => {
      const key = { number: 'idade', enum: 'papel', date: 'desde', table: 'fotos' }[kind];
      const report = validate(component([image({ $field: key })]));
      expect(report.errors.map(brief)).toContainEqual([
        'error',
        'components/avatar.json',
        'template.children[0].src.$field',
        `o src da imagem lê "${key}", que é um campo ${kind} do tipo "avatar", não string`,
      ]);
    },
  );

  it('campo inexistente é apontado uma só vez, pela conferência de campos', () => {
    const report = validate(component([image({ $field: 'inexistente' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].src.$field',
        'o desenho usa o campo "inexistente", que o tipo "avatar" não declara',
      ],
    ]);
  });

  it('dentro de um repeat, a coluna string passa', () => {
    const report = validate(component([repeatOf({ $field: 'url' })]));
    expect(report.errors).toEqual([]);
  });

  it('dentro de um repeat, a coluna number é erro', () => {
    const report = validate(component([repeatOf({ $field: 'tamanho' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].template.children[0].src.$field',
        'o src da imagem lê a coluna "tamanho" da table "fotos" do tipo "avatar", que é number, não string',
      ],
    ]);
  });

  it('a coluna sombreia o campo do tipo de mesmo nome', () => {
    // `foto` é string no tipo, mas number como coluna: vale a coluna.
    const report = validate(component([repeatOf({ $field: 'foto' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].template.children[0].src.$field',
        'o src da imagem lê a coluna "foto" da table "fotos" do tipo "avatar", que é number, não string',
      ],
    ]);
  });

  it('dentro de um repeat, o que não é coluna cai no campo do tipo', () => {
    expect(validate(component([repeatOf({ $field: 'nome' })])).errors).toEqual([]);
    const report = validate(component([repeatOf({ $field: 'idade' })]));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/avatar.json',
      'template.children[0].template.children[0].src.$field',
      'o src da imagem lê "idade", que é um campo number do tipo "avatar", não string',
    ]);
  });

  it.each([
    ['relativo', 'imagens/a.png'],
    ['http:', 'http://cdn.exemplo.com/a.png'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['com credenciais', 'https://u:p@cdn.exemplo.com/a.png'],
  ])('o src literal %s chega como erro do nível 1', (_name, src) => {
    const report = validate(component([image(src), text('nome')]));
    expect(report.errors.map((e) => [e.file, e.path])).toEqual([
      ['components/avatar.json', 'template.children[0].src'],
    ]);
    expect(report.errors[0]?.message).toContain('esperava URL https:// absoluta');
  });
});
