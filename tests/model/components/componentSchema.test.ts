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
});
