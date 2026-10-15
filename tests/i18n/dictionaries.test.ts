import { describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import type { AppErrorCode } from '../../src/app/appResult';

/**
 * Etapa 8 (8.4): todo código de erro da abertura tem texto (`Home` mostra `t('error.<code>')`).
 * Um `Record` com todos os códigos: um código novo sem entrada aqui quebra o typecheck.
 */
const APP_ERROR_CODES: Record<AppErrorCode, true> = {
  'invalid-json': true,
  'invalid-schema': true,
  'unsupported-version': true,
  'missing-migration': true,
  'invariant-violation': true,
  'invalid-zip': true,
  'missing-mapping': true,
  'not-found': true,
  'storage-failed': true,
};

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const entries = Object.entries(ptBR) as [keyof typeof ptBR, string][];

describe('dicionários', () => {
  it('têm exatamente as mesmas chaves', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it.each(entries)('%s: sem texto vazio e com os mesmos {parâmetros}', (key, pt) => {
    const en = enUS[key];
    expect(pt.trim()).not.toBe('');
    expect(en.trim()).not.toBe('');
    expect(placeholders(en)).toEqual(placeholders(pt));
  });

  it.each(Object.keys(APP_ERROR_CODES))(
    'error.%s existe nos dois dicionários',
    (code) => {
      expect(Reflect.get(ptBR, `error.${code}`)).toEqual(expect.any(String));
      expect(Reflect.get(enUS, `error.${code}`)).toEqual(expect.any(String));
    },
  );

  it('en-US não deixou texto em português (copiado sem traduzir)', () => {
    // Iguais nos dois idiomas só por serem nomes próprios, unidades ou palavras idênticas.
    const allowed = new Set<string>([
      'language.pt-BR',
      'language.en-US',
      'image.dimensions',
      'marking.pathSeparator',
      'marking.x',
      'marking.y',
      'layer.deleteCount',
      'annotation.ownerOption',
      'help.specs.downloads',
      'zoom.value',
      'status.empty',
      'status.schema',
      'pwa.previewBadge',
      'shortcuts.group.view',
      'marking.rectSummary',
      'details.summary',
      'details.summarySeparator',
      'issue.item',
      'inconsistent.item',
      'inconsistent.named',
      'inconsistent.other',
      'ref.fieldButton',
      'repos.platform',
      'spec.platformItem',
      'spec.platformItemLanguage',
      // Só parâmetros e pontuação (o marcador e o popover dos Detalhes na revisão).
      'review.mark.label',
      'review.pop.title',
      // Eixos da posição na revisão de propostas.
      'review.rect.x',
      'review.rect.y',
      'review.placement.x',
      'review.placement.y',
      // O nome do produto é "Mapping" nos dois idiomas.
      'app.title',
      'editor.appName',
    ]);
    const same = entries.filter(([key, pt]) => enUS[key] === pt && !allowed.has(key));
    expect(same.map(([key]) => key)).toEqual([]);
  });
});
