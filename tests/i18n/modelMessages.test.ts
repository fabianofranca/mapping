import { afterEach, describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import { locale } from '../../src/store/settings';
import { modelMessage, rawMessage, type ModelMessage } from '../../src/model';
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
