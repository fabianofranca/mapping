import { afterEach, describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import { locale } from '../../src/store/settings';
import { modelMessage, rawMessage, type ModelMessage } from '../../src/model';
import { parseComponent } from '../../src/model/components/parseComponent';
import { messageText } from '../../src/ui/modelMessage';

// Mensagens do modelo traduzidas pela interface (#945, itens 1 e 41): o pt-BR de cada código
// é igual ao `text` que o modelo devolve (e que o MCP segue emitindo), e o en-US traduz.

afterEach(() => {
  locale.value = 'pt-BR';
});

const PREFIX = 'model.';
const keys = Object.keys(ptBR).filter((k) => k.startsWith(PREFIX));

/** Preenche cada {parâmetro} do texto com um valor reconhecível. */
function sampleParams(text: string): Record<string, string> {
  return Object.fromEntries(
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => [m[1] as string, `<${m[1]}>`]),
  );
}

describe('mensagens do modelo', () => {
  it('existem códigos', () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it.each(keys)('%s: é um código conhecido pela interface, nos dois idiomas', (key) => {
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

  it('raw e código desconhecido seguem em texto, em qualquer idioma', () => {
    locale.value = 'en-US';
    expect(messageText(rawMessage('texto do motor'))).toBe('texto do motor');
    expect(messageText(modelMessage('nao.existe', {}, 'texto'))).toBe('texto');
  });

  it('o pt-BR do código é o `text` do modelo (cada mensagem montada pelo modelo)', () => {
    const samples: ModelMessage[] = [
      modelMessage('catalog.fileMissing', { path: 'a.json' }, 'arquivo ausente (a.json)'),
      modelMessage(
        'arrange.overflow',
        { label: 'X' },
        'X: conteúdo maior que o container',
      ),
      modelMessage('arrange.outside', { label: 'X', where: 'Y' }, 'X: não cabe em Y'),
      modelMessage('value.refBroken', { key: 'k' }, 'referência quebrada: k'),
      modelMessage('value.refCycle', { key: 'k' }, 'referência em ciclo: k'),
      modelMessage('value.refDeep', { key: 'k' }, 'referência em mais de um nível: k'),
      modelMessage(
        'catalog.typeOutside',
        { typeId: 't' },
        'tipo "t" fora da especialização',
      ),
      modelMessage('catalog.typeNoComponent', { typeId: 't' }, 'tipo "t" sem componente'),
    ];
    locale.value = 'pt-BR';
    for (const m of samples) expect(messageText(m)).toBe(m.text);
  });
});

// Variáveis do componente (etapa #1504): cada erro novo sai com código e params e tem en-US.
describe('mensagens das variáveis do componente', () => {
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

  const cases: [string, unknown, string, string][] = [
    [
      'component.variableUndefined',
      lets({}, { $var: 'gap' }),
      'variável não definida: gap',
      'undefined variable: gap',
    ],
    [
      'component.variableCycle',
      lets({ a: { $var: 'b' }, b: { $var: 'a' } }, { $var: 'a' }),
      'ciclo de variáveis: a → b → a',
      'variable cycle: a → b → a',
    ],
    [
      'component.expectedVariableName',
      lets({ Gap: 1 }, 1),
      'esperava nome de variável ([a-z][a-zA-Z0-9]*)',
      'expected a variable name ([a-z][a-zA-Z0-9]*)',
    ],
    [
      'component.variablesTooBig',
      lets(big, { $var: 'v20' }),
      'expansão das variáveis grande demais (mais de 100000 nós)',
      'variable expansion too large (more than 100000 nodes)',
    ],
  ];

  it.each(cases)('%s: código, params e en-US', (code, input, pt, en) => {
    const result = parseComponent(input);
    expect(result.ok).toBe(false);
    const issue = !result.ok ? result.issues.find((i) => i.message === pt) : undefined;
    expect(issue?.code).toBe(code);
    const message = modelMessage(
      issue?.code as string,
      (issue?.params ?? {}) as Record<string, string>,
      pt,
    );
    locale.value = 'pt-BR';
    expect(messageText(message)).toBe(pt);
    locale.value = 'en-US';
    expect(messageText(message)).toBe(en);
  });
});
