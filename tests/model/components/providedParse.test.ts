// MF3: cor herdada (`provide` no slot e `$provided` na filha, formato 4) — validador.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'só é permitido com formatVersion 4';

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

const slot = (extra: Record<string, unknown> = {}) => ({ type: 'slot', ...extra });
const text = (color: unknown) => ({ type: 'text', text: 'x', color });

describe('provide no slot (decisão 8)', () => {
  it('vale no slot, na v4, com texto, número ou expressão', () => {
    const provide = {
      'content-color': { $token: 'on-primary' },
      size: 12,
      label: { $field: 'ink', default: '#111' },
      mixed: { $concat: ['a', 1] },
    };
    expect(validateComponent(withChild(slot({ provide })))).toEqual([]);
  });

  it('numa v1 a v3 é só permitido com formatVersion 4, no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(slot({ provide: { ink: '#fff' } }), version)),
      ).toEqual([`template.children[0].provide: ${V4}`]);
  });

  it('só o slot oferece: em outro nó é chave desconhecida', () => {
    expect(
      validateComponent(withChild({ type: 'frame', provide: { ink: '#fff' } })),
    ).toEqual(['template.children[0].provide: chave desconhecida: provide']);
  });

  it('nome vazio é erro; o valor é conferido no caminho dele', () => {
    expect(validateComponent(withChild(slot({ provide: { '': '#fff' } })))).toEqual([
      'template.children[0].provide: nome vazio',
    ]);
    expect(validateComponent(withChild(slot({ provide: { ink: true } })))).toEqual([
      'template.children[0].provide.ink: esperava texto ou número',
    ]);
    expect(validateComponent(withChild(slot({ provide: 'ink' })))).toEqual([
      'template.children[0].provide: esperava objeto',
    ]);
  });
});

describe('$provided na filha (decisão 8)', () => {
  it('vale onde vale uma Expr, com default (que também é Expr)', () => {
    const read = { $provided: 'content-color', default: { $token: 'on-surface' } };
    expect(validateComponent(withChild(text(read)))).toEqual([]);
    expect(
      validateComponent(
        withChild({ type: 'rect', fill: read, opacity: { $provided: 'o', default: 1 } }),
      ),
    ).toEqual([]);
  });

  it('sem nome (ou vazio) é erro', () => {
    const msg = 'esperava nome da cor oferecida (texto não vazio)';
    expect(validateComponent(withChild(text({ $provided: '' })))).toEqual([
      `template.children[0].color.$provided: ${msg}`,
    ]);
    expect(validateComponent(withChild(text({ default: '#fff' })))).not.toEqual([]);
    expect(validateComponent(withChild(text({ $provided: 3 })))).toEqual([
      `template.children[0].color.$provided: ${msg}`,
    ]);
  });

  it('chave desconhecida junto é erro', () => {
    expect(validateComponent(withChild(text({ $provided: 'a', outra: 1 })))).toEqual([
      'template.children[0].color.outra: chave desconhecida: outra',
    ]);
  });

  it('o src da imagem continua restrito', () => {
    expect(
      validateComponent(withChild({ type: 'image', src: { $provided: 'a' } })),
    ).toEqual([
      'template.children[0].src: src só aceita texto literal ou { "$field": "<campo>" }',
    ]);
  });

  it('numa v1 a v3 é só permitido com formatVersion 4, no caminho da chave', () => {
    for (const version of [1, 2, 3]) {
      const issues = validateComponent(
        withChild(text({ $provided: 'a', default: '#fff' }), version),
      );
      expect(issues).toContain(`template.children[0].color.$provided: ${V4}`);
    }
  });
});
