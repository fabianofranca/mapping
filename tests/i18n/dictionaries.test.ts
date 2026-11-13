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

  it.each(entries)(
    '%s: sem crase (markdown não é interpretado na interface)',
    (key, pt) => {
      // Os avisos de `model.versions.*` levam a crase de termo de formato (`code`, `path`, `repo`,
      // `doc`) no pt-BR porque este é igual ao texto do modelo (decisão 3 da etapa #1263).
      if (key.startsWith('model.versions.')) return;
      expect(pt).not.toContain('`');
      expect(enUS[key]).not.toContain('`');
    },
  );

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
      'perspective.count.containers',
      'perspective.count.containersOne',
      'language.en-US',
      'image.dimensions',
      // Só {parâmetros}: o texto vem do parser.
      'model.catalog.invalidProblem',
      'model.components.invalid',
      'model.icons.invalid',
      'marking.pathSeparator',
      'arrow.label',
      'marking.x',
      'marking.y',
      'layer.deleteCount',
      'spec.impact.lossTarget',
      'spec.impact.lossMore',
      'annotation.ownerOption',
      'typed.ownerRoleOption',
      'help.specs.downloads',
      'zoom.value',
      'status.empty',
      'view.containers',
      // CM5-B: "Container" é a mesma palavra nos dois idiomas.
      'citation.group.container',
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
      'ref.fieldValue',
      'ref.fieldValueLayer',
      'repos.platform',
      'spec.platformItem',
      'spec.platformItemLanguage',
      // Só parâmetros e pontuação (o marcador e o popover dos Detalhes na revisão).
      'review.mark.label',
      'review.pop.title',
      // Só parâmetros e a seta ("{from} → {to}", o rótulo de uma seta sem nome na revisão).
      'review.arrow.label',
      // Eixos da posição na revisão de propostas.
      'review.rect.x',
      'review.rect.y',
      'review.placement.x',
      'review.placement.y',
      // "Canvas" é o mesmo nos dois idiomas (o grupo Canvas da revisão).
      'review.level.canvas',
      'review.filter.canvas',
      // O nome do canvas e o rótulo "Container" são iguais nos dois idiomas.
      'canvas.name',
      'crumbs.canvas',
      'marking.container',
      'multi.containers',
      // Palavras iguais nos dois idiomas (biblioteca de componentes, B3).
      'library.container',
      'library.typeSize',
      'image.containerUntitled',
      'diagnostics.fontStyle.normal',
      // Formatos "<texto>: <alvo>" iguais nos dois idiomas (nome acessível, SA1).
      'review.decide.named',
      'library.addType',
      // Palavras e formatos iguais nos dois idiomas (janela Comentários).
      'comments.col.messages',
      'comments.col.status',
      'comments.filter.status',
      'comments.filter.userOption',
      // Rótulos de tecla e marcadores iguais nos dois idiomas (seletor de referência e tabela).
      'ref.keyUp',
      'ref.keyDown',
      'ref.keyEnter',
      'ref.keyCtrlEnter',
      'ref.keyEsc',
      'typed.rowNumber',
      'typed.requiredMark',
      // "{value}x": só parâmetro e o símbolo da escala (3x), iguais nos dois idiomas (densidade).
      'density.value',
      // A seta entre o parâmetro e o valor do código é um símbolo, igual nos dois idiomas.
      'catalog.page.codeParamsArrow',
      // O texto do problema da ficha vem do leitor da ficha e entra inteiro como parâmetro.
      'model.library.signatureInvalid',
      // O nome do produto é "Mapping" nos dois idiomas.
      'app.title',
      'editor.appName',
    ]);
    const same = entries.filter(([key, pt]) => enUS[key] === pt && !allowed.has(key));
    expect(same.map(([key]) => key)).toEqual([]);
  });
});
