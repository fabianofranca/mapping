import { afterEach, describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import { locale } from '../../src/store/settings';
import { modelMessage, rawMessage, type ModelMessage } from '../../src/model';
import { parseComponent } from '../../src/model/components/parseComponent';
import { messageText } from '../../src/ui/modelMessage';

// Model messages translated by the interface (#945, items 1 and 41): the `text` the model returns
// (and that the MCP keeps emitting) is English and equals the en-US rendering; pt-BR is the template.

afterEach(() => {
  locale.value = 'pt-BR';
});

const PREFIX = 'model.';
const keys = Object.keys(ptBR).filter((k) => k.startsWith(PREFIX));

/** Fills each {parameter} of the text with a recognizable value. */
function sampleParams(text: string): Record<string, string> {
  return Object.fromEntries(
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => [m[1] as string, `<${m[1]}>`]),
  );
}

describe('model messages', () => {
  it('codes exist', () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it.each(keys)('%s: is a code known to the interface, in both languages', (key) => {
    const code = key.slice(PREFIX.length);
    const pt = ptBR[key as keyof typeof ptBR];
    const params = sampleParams(pt);
    const message = modelMessage(code, params, 'SEM TRADUÇÃO');
    locale.value = 'pt-BR';
    expect(messageText(message)).not.toBe('SEM TRADUÇÃO');
    locale.value = 'en-US';
    const en = messageText(message);
    expect(en).not.toBe('SEM TRADUÇÃO');
    expect(en).toBe(enUS[key as keyof typeof enUS].replace(/\{(\w+)\}/g, '<$1>'));
  });

  it('raw and unknown code stay as text, in any language', () => {
    locale.value = 'en-US';
    expect(messageText(rawMessage('texto do motor'))).toBe('texto do motor');
    expect(messageText(modelMessage('does.not.exist', {}, 'text'))).toBe('text');
  });

  it("the code's en-US is the model's English `text` and pt-BR the hand-written Portuguese (each message built by the model)", () => {
    const samples: readonly (readonly [ModelMessage, string])[] = [
      [
        modelMessage('catalog.fileMissing', { path: 'a.json' }, 'missing file (a.json)'),
        'arquivo ausente (a.json)',
      ],
      [
        modelMessage(
          'arrange.overflow',
          { label: 'X' },
          'X: content is larger than the container',
        ),
        'X: conteúdo maior que o container',
      ],
      [
        modelMessage(
          'arrange.outside',
          { label: 'X', where: 'Y' },
          'X: does not fit in Y',
        ),
        'X: não cabe em Y',
      ],
      [
        modelMessage('value.refBroken', { key: 'k' }, 'broken reference: k'),
        'referência quebrada: k',
      ],
      [
        modelMessage('value.refCycle', { key: 'k' }, 'reference cycle: k'),
        'referência em ciclo: k',
      ],
      [
        modelMessage(
          'value.refDeep',
          { key: 'k' },
          'reference through more than one level: k',
        ),
        'referência em mais de um nível: k',
      ],
      [
        modelMessage(
          'catalog.typeOutside',
          { typeId: 't' },
          'type "t" is outside the specialization',
        ),
        'tipo "t" fora da especialização',
      ],
      [
        modelMessage(
          'catalog.typeNoComponent',
          { typeId: 't' },
          'type "t" has no component',
        ),
        'tipo "t" sem componente',
      ],
    ];
    for (const [m, pt] of samples) {
      locale.value = 'pt-BR';
      expect(messageText(m)).toBe(pt);
      locale.value = 'en-US';
      expect(messageText(m)).toBe(m.text);
    }
  });
});

// Component variables (stage #1504): each new error comes out with a code and params and has en-US.
describe('component variable messages', () => {
  const frame = (extra: Record<string, unknown>) => ({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'v',
    name: 'V',
    size: { width: 10, height: 10 },
    template: { type: 'frame', ...extra },
  });
  const rect = (width: unknown) => ({ type: 'rect', width, height: 4 });
  const lets = (vars: Record<string, unknown>, width: unknown) =>
    frame({ let: vars, children: [rect(width)] });
  const big: Record<string, unknown> = { v0: 1 };
  for (let i = 1; i <= 20; i++)
    big[`v${i}`] = { $add: [{ $var: `v${i - 1}` }, { $var: `v${i - 1}` }] };

  // [code, input, the model text (English, equal to en-US), the pt-BR rendering]
  const cases: [string, unknown, string, string][] = [
    [
      'component.variableUndefined',
      lets({}, { $var: 'gap' }),
      'undefined variable: gap',
      'variável não definida: gap',
    ],
    [
      'component.variableCycle',
      lets({ a: { $var: 'b' }, b: { $var: 'a' } }, { $var: 'a' }),
      'variable cycle: a → b → a',
      'ciclo de variáveis: a → b → a',
    ],
    [
      'component.expectedVariableName',
      lets({ Gap: 1 }, 1),
      'expected a variable name ([a-z][a-zA-Z0-9]*)',
      'esperava nome de variável ([a-z][a-zA-Z0-9]*)',
    ],
    [
      'component.variablesTooBig',
      lets(big, { $var: 'v20' }),
      'variable expansion too large (more than 100000 nodes)',
      'expansão das variáveis grande demais (mais de 100000 nós)',
    ],
  ];

  it.each(cases)('%s: code, params and en-US', (code, input, en, pt) => {
    const result = parseComponent(input);
    expect(result.ok).toBe(false);
    const issue = !result.ok ? result.issues.find((i) => i.message === en) : undefined;
    expect(issue?.code).toBe(code);
    const message = modelMessage(
      issue?.code as string,
      (issue?.params ?? {}) as Record<string, string>,
      en,
    );
    locale.value = 'pt-BR';
    expect(messageText(message)).toBe(pt);
    locale.value = 'en-US';
    expect(messageText(message)).toBe(en);
  });
});
