import { describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import { catalogEnUS, catalogPtBR } from '../../src/i18n/catalog';
import { modelMessagesEnUS, modelMessagesPtBR } from '../../src/i18n/modelMessages';
import { perspectivesEnUS, perspectivesPtBR } from '../../src/i18n/perspectives';
import { reviewEnUS, reviewPtBR } from '../../src/i18n/review';
import type { AppErrorCode } from '../../src/app/appResult';

/**
 * Stage 8 (8.4): every opening error code has a text (`Home` shows `t('error.<code>')`).
 * A `Record` with all the codes: a new code without an entry here breaks the typecheck.
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
const entries = Object.entries(enUS) as [keyof typeof enUS, string][];

/**
 * The modules that feed the dictionaries (`catalog`, `review`, `perspectives`, `modelMessages`)
 * are checked one by one, not only after the spread into the full dictionaries: a key missing in
 * one language of a module shows up under the module's name.
 */
const MODULES: readonly (readonly [
  string,
  Record<string, string>,
  Record<string, string>,
])[] = [
  ['catalog', catalogEnUS, catalogPtBR],
  ['review', reviewEnUS, reviewPtBR],
  ['perspectives', perspectivesEnUS, perspectivesPtBR],
  ['modelMessages', modelMessagesEnUS, modelMessagesPtBR],
];

describe('bilingual modules', () => {
  it.each(MODULES)('%s: same keys in en-US and pt-BR', (_name, en, pt) => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(MODULES)('%s: same {parameters} in en-US and pt-BR', (_name, en, pt) => {
    const mismatched = Object.entries(en)
      .filter(([key, text]) => {
        const other = pt[key];
        return (
          other === undefined || placeholders(other).join() !== placeholders(text).join()
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

describe('dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it.each(entries)('%s: no empty text and the same {parameters}', (key, en) => {
    const pt = ptBR[key];
    expect(pt.trim()).not.toBe('');
    expect(en.trim()).not.toBe('');
    expect(placeholders(en)).toEqual(placeholders(pt));
  });

  it.each(entries)(
    '%s: no backtick (markdown is not interpreted in the interface)',
    (key, en) => {
      // The `model.versions.*` notices carry the backtick of a format term (`code`, `path`, `repo`,
      // `doc`) in pt-BR because it is the same as the model's text (decision 3 of stage #1263).
      if (key.startsWith('model.versions.')) return;
      expect(en).not.toContain('`');
      expect(ptBR[key]).not.toContain('`');
    },
  );

  it.each(Object.keys(APP_ERROR_CODES))(
    'error.%s exists in both dictionaries',
    (code) => {
      expect(Reflect.get(ptBR, `error.${code}`)).toEqual(expect.any(String));
      expect(Reflect.get(enUS, `error.${code}`)).toEqual(expect.any(String));
    },
  );

  it('en-US has no Portuguese text left (copied without translating)', () => {
    // Equal in both languages only because they are proper names, units or identical words.
    const allowed = new Set<string>([
      'language.pt-BR',
      'perspective.count.containers',
      'perspective.count.containersOne',
      'language.en-US',
      'image.dimensions',
      // Only {parameters}: the text comes from the parser.
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
      // CM5-B: "Container" is the same word in both languages.
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
      // Only parameters and punctuation (the marker and the popover of the Details in the review).
      'review.mark.label',
      'review.pop.title',
      // Only parameters and the arrow ("{from} → {to}", the label of an unnamed arrow in the review).
      'review.arrow.label',
      // Position axes in the proposal review.
      'review.rect.x',
      'review.rect.y',
      'review.placement.x',
      'review.placement.y',
      // "Canvas" is the same in both languages (the Canvas group of the review).
      'review.level.canvas',
      'review.filter.canvas',
      // The canvas name and the "Container" label are the same in both languages.
      'canvas.name',
      'crumbs.canvas',
      'marking.container',
      'multi.containers',
      // Words that are the same in both languages (component library, B3).
      'library.container',
      'library.typeSize',
      'image.containerUntitled',
      'diagnostics.fontStyle.normal',
      // "<text>: <target>" formats that are the same in both languages (accessible name, SA1).
      'review.decide.named',
      'library.addType',
      // Words and formats that are the same in both languages (Comments window).
      'comments.col.messages',
      'comments.col.status',
      'comments.filter.status',
      'comments.filter.userOption',
      // Key labels and markers that are the same in both languages (reference picker and table).
      'ref.keyUp',
      'ref.keyDown',
      'ref.keyEnter',
      'ref.keyCtrlEnter',
      'ref.keyEsc',
      'typed.rowNumber',
      'typed.requiredMark',
      // "{value}x": only a parameter and the scale symbol (3x), the same in both languages (density).
      'density.value',
      // The arrow between the parameter and the code value is a symbol, the same in both languages.
      'catalog.page.codeParamsArrow',
      // The text of the sheet problem comes from the sheet reader and enters whole as a parameter.
      'model.library.signatureInvalid',
      // The product name is "Mapping" in both languages.
      'app.title',
      'editor.appName',
    ]);
    const same = entries.filter(([key, en]) => ptBR[key] === en && !allowed.has(key));
    expect(same.map(([key]) => key)).toEqual([]);
  });
});
