import { afterEach, describe, expect, it } from 'vitest';
import { modelMessage } from '../../src/model/modelMessage';
import { MODEL_MESSAGE_TEMPLATES } from '../../src/model/messages';
import { parseSpec, type SpecIssue } from '../../src/model/spec';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';

// CL2 R-4 (#1785): toda mensagem da `formatVersion` 16 de `specSignature.ts` sai com código do
// catálogo `spec` e, em en-US, sem palavra em português fora dos parâmetros.

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function base(): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 16,
    id: 's',
    name: 'S',
    version: 1,
    platforms: [{ id: 'compose', name: 'Compose', language: 'kotlin' }],
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 't',
            name: 'T',
            fields: [{ key: 'k', type: 'string' }],
            code: { compose: { symbol: 'S' } },
          },
        ],
      },
    ],
  };
}

const models = (s: Raw, value: unknown): void => {
  s.fieldModels = { compose: { X: value } };
};

const CASES: [string, (s: Raw) => void][] = [
  ['fieldModels não é objeto', (s) => (s.fieldModels = 3)],
  ['fieldModels.<alvo> não é objeto', (s) => (s.fieldModels = { compose: 3 })],
  ['modelo não é objeto', (s) => models(s, 3)],
  ['like não é texto', (s) => models(s, { like: 3 })],
  ['like de campo inexistente', (s) => models(s, { like: 'zz.k' })],
  ['format sem {value}', (s) => models(s, { type: 'number', format: 'x' })],
  ['type inválido', (s) => models(s, { type: 'zz' })],
  ['options vazio', (s) => models(s, { type: 'enum', options: [] })],
  ['options fora de enum', (s) => models(s, { type: 'string', options: ['a'] })],
  ['enum sem options', (s) => models(s, { type: 'enum' })],
  ['expand não é objeto', (s) => models(s, { expand: 3 })],
  ['expand sem params', (s) => models(s, { expand: { call: 'c' } })],
  [
    'expand com tipo vazio',
    (s) => models(s, { expand: { call: 'c', params: { a: '' } } }),
  ],
  ['modelo sem forma', (s) => models(s, {})],
  ['modelo com duas formas', (s) => models(s, { like: 't.k', ignore: true })],
  ['ignore diferente de true', (s) => models(s, { ignore: false })],
  [
    'caminho em params sem a chamada em calls',
    (s) => (s.layers[0].annotationTypes[0].code.compose.params = { k: 'border.color' }),
  ],
  [
    'formats de campo inexistente',
    (s) => (s.layers[0].annotationTypes[0].code.compose.formats = { zz: '{value}' }),
  ],
  [
    'formats sem {value}',
    (s) => (s.layers[0].annotationTypes[0].code.compose.formats = { k: 'x' }),
  ],
  [
    'ignore repetido',
    (s) => (s.layers[0].annotationTypes[0].code.compose.ignore = ['a', 'a']),
  ],
  ['chaves novas antes da 16', (s) => ((s.formatVersion = 15), (s.fieldModels = {}))],
];

function issuesOf(mutate: (s: Raw) => void): SpecIssue[] {
  const spec = base();
  mutate(spec);
  const parsed = parseSpec(spec);
  if (parsed.ok) throw new Error('a especialização devia ser inválida');
  return parsed.issues;
}

const PORTUGUESE = /[ãõçáéíóúâêô]/i;

function shown(issue: SpecIssue): string {
  let out = messageText(
    modelMessage(issue.code ?? 'raw', issue.params ?? {}, issue.message),
  );
  for (const value of Object.values(issue.params ?? {}))
    out = out.replace(`${value}`, '');
  return out;
}

describe('mensagens da formatVersion 16 (specSignature) no catálogo', () => {
  it.each(CASES.map(([name, mutate]) => [name, mutate] as const))(
    'tem código do catálogo e en-US sem português: %s',
    (_name, mutate) => {
      const issues = issuesOf(mutate);
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.code, issue.message).toBeDefined();
        expect(MODEL_MESSAGE_TEMPLATES, issue.message).toHaveProperty(issue.code!);
        locale.value = 'en-US';
        expect(shown(issue), issue.message).not.toMatch(PORTUGUESE);
        locale.value = 'pt-BR';
      }
    },
  );

  it('pt-BR: o texto mostrado é o `message`', () => {
    for (const [, mutate] of CASES) {
      for (const issue of issuesOf(mutate)) {
        expect(shown(issue)).toBe(
          Object.values(issue.params ?? {}).reduce<string>(
            (acc, v) => acc.replace(`${v}`, ''),
            issue.message,
          ),
        );
      }
    }
  });
});
