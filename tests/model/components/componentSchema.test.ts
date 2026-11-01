// docs/component.schema.json contra os componentes reais e contra o parser.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_COMPONENTS } from '../../../lab/components/samples';
import { M3_COMPONENTS } from '../../../lab/components/samplesMaterial3';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

const all = [...M3_COMPONENTS, ...SAMPLE_COMPONENTS];

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(M3_COMPONENTS[0])) as Record<string, unknown>;
}

describe('component.schema.json', () => {
  it('cobre os quinze componentes do Material 3 e os de exemplo do laboratório', () => {
    expect(M3_COMPONENTS).toHaveLength(15);
    expect(SAMPLE_COMPONENTS.length).toBeGreaterThan(0);
  });

  it.each(all.map((c) => [c.id, c] as const))('aceita %s', (_id, component) => {
    expect(checkSchema(schema, component)).toEqual([]);
  });

  it('todo componente aceito pelo schema é aceito por parseComponent', () => {
    for (const component of all) {
      if (checkSchema(schema, component).length === 0)
        expect(parseComponent(component).ok, component.id).toBe(true);
    }
  });

  it('recusa chave desconhecida na raiz e em nó', () => {
    const root = { ...clone(), extra: 1 };
    expect(checkSchema(schema, root).join('\n')).toContain('$.extra: chave desconhecida');
    const node = clone();
    (node.template as Record<string, unknown>).bogus = true;
    expect(checkSchema(schema, node).length).toBeGreaterThan(0);
  });

  it('recusa type de nó inválido', () => {
    const c = clone();
    (c.template as { children: Record<string, unknown>[] }).children[0] = {
      type: 'polygon',
    };
    expect(checkSchema(schema, c).length).toBeGreaterThan(0);
  });

  it('recusa componente sem size', () => {
    const c = clone();
    delete c.size;
    expect(checkSchema(schema, c)).toContain('$.size: obrigatório');
  });

  it('recusa id fora do padrão', () => {
    expect(checkSchema(schema, { ...clone(), id: 'Ruim' }).length).toBeGreaterThan(0);
  });

  describe('nó image (formatVersion 3)', () => {
    const image = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      type: 'image',
      src: { $field: 'foto' },
      fit: 'cover',
      width: 40,
      height: 40,
      cornerRadius: 20,
      ...extra,
    });
    const v3 = (children: Record<string, unknown>[]): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 3,
      id: 'avatar',
      name: 'Avatar',
      size: { width: 200, height: 56 },
      template: { type: 'frame', layout: { type: 'row', gap: 8 }, children },
    });
    const withImage = (node: Record<string, unknown>): Record<string, unknown> =>
      v3([node]);

    it('aceita image com $field e com literal https, e o parseComponent também', () => {
      for (const node of [image(), image({ src: 'https://exemplo.invalid/a.png' })]) {
        const c = withImage(node);
        expect(checkSchema(schema, c)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
    });

    it('aceita image dentro de repeat', () => {
      const c = v3([
        {
          type: 'repeat',
          field: 'pessoas',
          template: { type: 'frame', children: [image({ src: { $field: 'foto' } })] },
        },
      ]);
      expect(checkSchema(schema, c)).toEqual([]);
      expect(parseComponent(c).ok).toBe(true);
    });

    it('recusa image sem src', () => {
      const node = image();
      delete node.src;
      expect(checkSchema(schema, withImage(node)).length).toBeGreaterThan(0);
    });

    it('recusa src com $concat, com default e literal que não é https', () => {
      for (const src of [
        { $concat: ['https://', { $field: 'host' }] },
        { $field: 'foto', default: 'https://exemplo.invalid/a.png' },
        'http://exemplo.invalid/a.png',
        'a.png',
      ])
        expect(
          checkSchema(schema, withImage(image({ src }))).length,
          JSON.stringify(src),
        ).toBeGreaterThan(0);
    });

    it('recusa fit inválido e hug em width ou height', () => {
      expect(
        checkSchema(schema, withImage(image({ fit: 'stretch' }))).length,
      ).toBeGreaterThan(0);
      for (const key of ['width', 'height'])
        expect(
          checkSchema(schema, withImage(image({ [key]: 'hug' }))).length,
          key,
        ).toBeGreaterThan(0);
      expect(
        checkSchema(schema, withImage(image({ width: 'fill', height: '50%' }))),
      ).toEqual([]);
    });
  });
});
