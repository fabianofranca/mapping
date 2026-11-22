import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GUIDE_OUTPUT,
  GUIDE_REDIRECT_OUTPUT,
  guideHtml,
  guideRedirectHtml,
  missingUiKeys,
  resolveText,
  uiKeys,
} from '../../scripts/guide';
import { GUIDE_MESSAGES, type GuideMessages } from '../../scripts/guide/messages';
import { verifyCsp } from '../../pwa/csp';
import { SHORTCUT_LABELS } from '../../src/app/shortcuts';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import {
  TOOL_WINDOWS,
  WINDOW_NUMBER,
  type ToolWindowId,
} from '../../src/store/toolWindows';

// The interactive guide (`public/guide/index.html`, en-US and pt-BR) comes from
// `scripts/guide/template.html`, `scripts/guide/messages.ts` and the example project. To regenerate:
// `npm run build:guide`.

const HINT =
  'Run `npm run build:guide` to regenerate public/guide/index.html and public/guia/index.html.';
const html = guideHtml();
const LOCALES = ['en-US', 'pt-BR'] as const;
const DICTIONARIES = { 'en-US': enUS, 'pt-BR': ptBR } as const;

/** The texts of the page, resolved, for a language (what the page's script carries). */
function pageTexts(source: string): {
  messages: Record<(typeof LOCALES)[number], GuideMessages>;
} {
  const script = blocks(source, 'script').find((b) => b.includes('const D =')) ?? '';
  const json = /const GUIDE = (\{.*\});\n/.exec(script)?.[1];
  expect(json, 'the page has no GUIDE texts').toBeDefined();
  return JSON.parse(json ?? '{}');
}

/** The text of a guide message, without HTML tags. */
function plain(text: string): string {
  return text.replaceAll(/<[^>]+>/g, '');
}

/** The <style> and <script> blocks of an HTML. */
function blocks(source: string, tag: 'style' | 'script'): string[] {
  return [
    ...source.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g')),
  ].map((m) => m[1] ?? '');
}

describe('interactive guide', () => {
  it('public/guide/index.html is up to date with the template and the example', () => {
    expect(readFileSync(GUIDE_OUTPUT, 'utf8') === html, HINT).toBe(true);
  });

  it('public/guia/index.html (the old address) redirects to guide/ and is up to date', () => {
    const redirect = guideRedirectHtml();
    expect(readFileSync(GUIDE_REDIRECT_OUTPUT, 'utf8') === redirect, HINT).toBe(true);
    expect(redirect).toContain(
      '<meta http-equiv="refresh" content="0; url=../guide/" />',
    );
    expect(redirect).toContain('<a href="../guide/">');
    expect(verifyCsp(redirect, 'static')).toEqual([]);
    expect(redirect).not.toMatch(/style=|<script/);
  });

  it('carries the CSP (static profile) and uses no font, script or network from outside', () => {
    expect(verifyCsp(html, 'static')).toEqual([]);
    expect(html.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)/);
  });

  it('the own CSS uses only app tokens: no literal color, font, spacing, radius, opacity or duration', () => {
    const [tokens, own] = blocks(html, 'style')[0]!.split(
      'Guide: walkthrough on the left',
    );
    expect(tokens).toContain('--color-bg');
    expect(own).toBeDefined();
    const css = own!.replaceAll(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
    // The same categories as tests/theme/tokenLiterals.test.ts. The thin `1px` (breathing room of a
    // label, border width) and the `0px` of `env()` are not design values.
    const categories: readonly [RegExp, RegExp][] = [
      [
        /^(padding|margin|gap|row-gap|column-gap|top|right|bottom|left|inset)(-[a-z]+)?$/,
        /(?<![\w.-])-?\d*\.?\d+(px|rem|em)\b/,
      ],
      [/^border(-[a-z]+)*-radius$/, /(?<![\w.-])-?\d*\.?\d+(px|rem|em)\b/],
      [/^(font|font-size|font-family|line-height)$/, /^(?!var\(--).*/],
      [/^opacity$/, /\d/],
      [/^(transition|animation)(-duration|-delay)?$/, /(?<![\w.-])\d*\.?\d+m?s\b/],
      [/^z-index$/, /^-?\d+$/],
    ];
    const offenders: string[] = [];
    for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      const value = (m[2] ?? '')
        .replaceAll(/env\([^)]*\)/g, '')
        .replaceAll(/(?<![\w.-])1px\b/g, '')
        .trim();
      for (const [property, literal] of categories) {
        if (property.test(m[1] ?? '') && literal.test(value)) offenders.push(m[0]);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('specId and typeId go through esc() before entering the innerHTML (item 64)', () => {
    const script = blocks(html, 'script').find((b) => b.includes('const D =')) ?? '';
    expect(script).not.toMatch(/\+\s*a\.type\.specId\s*\+/);
    expect(script).not.toMatch(/\+\s*a\.type\.typeId\b(?!\s*:)/);
    expect(script).toContain('esc(a.type.specId)');
    expect(script).toContain('esc(a.type.typeId)');
  });

  it('the SVG with focusable buttons is a group, not an image (item 65), labeled in both languages', () => {
    const svg = html.match(/<svg id="svg"[^>]*>/)?.[0] ?? '';
    expect(svg).toContain('role="group"');
    expect(svg).not.toContain('role="img"');
    expect(svg).toContain('data-i18n-aria="svgLabel"');
    const { messages } = pageTexts(html);
    expect(messages['en-US'].svgLabel).toBe('Container with markings');
    expect(messages['pt-BR'].svgLabel).toBe('Container com marcações');
  });

  it('the shortcut table is generated from WINDOW_NUMBER, not written by hand (item 67)', () => {
    const template = readFileSync('scripts/guide/template.html', 'utf8');
    expect(template).not.toMatch(/<td><kbd>Ctrl\+Shift\+\d<\/kbd><\/td>/);
    expect(template).toContain('<!--__SHORTCUT_ROWS__-->');
    expect(html).not.toContain('__SHORTCUT_ROWS__');
  });

  it('scripts/guide.ts writes the line separators as escapes, not as characters (item 68)', () => {
    const source = readFileSync('scripts/guide.ts', 'utf8');
    expect(source).not.toMatch(/[\u2028\u2029]/);
    expect(source).toContain("replaceAll('\\u2028', '\\\\u2028')");
  });

  it('follows the theme chosen in the app (key mapping.theme) and the system one', () => {
    expect(html).toContain("'mapping.theme'");
    expect(html).toContain("[data-theme='dark']");
  });

  it('reads the theme key of the channel: preview:mapping.theme in /preview/guide/', () => {
    const script = blocks(html, 'script').find((b) => b.includes('mapping.theme')) ?? '';
    function themeAt(pathname: string, store: Record<string, string>): string | null {
      let applied: string | null = null;
      new Function('location', 'localStorage', 'document', script)(
        { pathname },
        { getItem: (k: string) => store[k] ?? null },
        { documentElement: { setAttribute: (_: string, v: string) => (applied = v) } },
      );
      return applied;
    }
    const store = { 'mapping.theme': 'light', 'preview:mapping.theme': 'dark' };
    expect(themeAt('/preview/guide/', store)).toBe('dark');
    expect(themeAt('/preview/guide/index.html', store)).toBe('dark');
    expect(themeAt('/guide/', store)).toBe('light');
    expect(themeAt('/mapping/guide/', store)).toBe('light');
    expect(themeAt('/preview/guide/', { 'mapping.theme': 'light' })).toBeNull();
  });

  it('explains the window shortcut with the focus outside and inside it, in both languages', () => {
    const { messages } = pageTexts(html);
    expect(html).toContain('<p class="shortcut-note" data-i18n="shortcutNote">');
    const en = messages['en-US'].shortcutNote;
    expect(en).toMatch(/focus outside/i);
    expect(en).toMatch(/moves the focus/i);
    expect(en).toMatch(/opens/i);
    expect(en).toMatch(/focus inside/i);
    expect(en).toMatch(/hides/i);
    const pt = messages['pt-BR'].shortcutNote;
    expect(pt).toMatch(/foco fora/i);
    expect(pt).toMatch(/leva o foco/i);
    expect(pt).toMatch(/abre/i);
    expect(pt).toMatch(/foco dentro/i);
    expect(pt).toMatch(/esconde/i);
  });

  it("the guide's shortcuts are the app's, in each language", () => {
    const known = new Set<string>(Object.values(SHORTCUT_LABELS));
    const combos = TOOL_WINDOWS.filter((id) => WINDOW_NUMBER[id] !== null).map(
      (id) => `Ctrl+Shift+${WINDOW_NUMBER[id]}`,
    );
    combos.forEach((combo) => known.add(combo));
    const titlesOf = (dict: Record<string, string>): Record<ToolWindowId, string> => ({
      tree: dict['panel.tree']!,
      layers: dict['layer.title']!,
      details: dict['panel.details']!,
      list: dict['view.list']!,
      incomplete: dict['incomplete.title']!,
      notices: dict['notices.title']!,
      comments: dict['comments.title']!,
      diagnostics: dict['diagnostics.title']!,
      proposals: dict['proposals.title']!,
      catalog: dict['catalog.window.title']!,
      conversation: dict['conversation.title']!,
    });
    const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Ctrl+Shift+${n}`);
    for (const locale of LOCALES) {
      const dict = DICTIONARIES[locale] as Record<string, string>;
      const titles = titlesOf(dict);
      const byCombo = new Map<string, string>();
      for (const id of TOOL_WINDOWS) {
        if (WINDOW_NUMBER[id] === null) continue;
        byCombo.set(`Ctrl+Shift+${WINDOW_NUMBER[id]}`, titles[id]);
      }
      byCombo.set(SHORTCUT_LABELS.arrange, dict['shortcuts.arrange']!);
      const rows = [
        ...html.matchAll(
          new RegExp(
            `<tr data-locale="${locale}"><td><kbd>([^<]+)</kbd></td>\\s*<td>([^<]+)</td>`,
            'g',
          ),
        ),
      ];
      expect(rows.map((m) => m[1]).sort(), locale).toEqual(
        [...expected, 'Alt+Shift+A'].sort(),
      );
      for (const [, combo, label] of rows) {
        const title = byCombo.get(combo ?? '');
        expect(title, `${locale}: ${combo} does not exist in the app`).toBeTruthy();
        expect(label, `${locale} ${combo}`).toBe(title);
      }
    }
    // Every <kbd> of the text (walkthrough and header) also exists in the app.
    const { messages } = pageTexts(html);
    for (const locale of LOCALES) {
      const texts = JSON.stringify(messages[locale]);
      for (const m of texts.matchAll(/<kbd>([^<]+)<\/kbd>/g)) {
        expect(known.has(m[1] ?? ''), `${m[1]} is not a shortcut of the app`).toBe(true);
      }
    }
  });

  it('every UI term the guide quotes exists in the dictionary of its language', () => {
    for (const locale of LOCALES) {
      const dict = DICTIONARIES[locale] as Record<string, string>;
      expect(missingUiKeys(GUIDE_MESSAGES[locale], dict), locale).toEqual([]);
      // The text of the page has the dictionary's exact text where the term is quoted.
      const { messages } = pageTexts(html);
      const texts = JSON.stringify(messages[locale]);
      const keys = new Set<string>();
      const walk = (v: unknown): void => {
        if (typeof v === 'string') uiKeys(v).forEach((k) => keys.add(k));
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(GUIDE_MESSAGES[locale]);
      expect(keys.size, locale).toBeGreaterThan(20);
      for (const key of keys) {
        const term = (dict[key] ?? '').replace(/\{\w+\}.*$/, '').trim();
        expect(texts, `${locale}: ${key}`).toContain(
          term.replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
        );
      }
      expect(texts).not.toContain('{ui:');
    }
  });

  it('fails when a quoted UI term stops existing in the dictionary', () => {
    const dict = { ...(enUS as Record<string, string>) };
    delete dict['panel.tree'];
    expect(missingUiKeys(GUIDE_MESSAGES['en-US'], dict)).toEqual(['panel.tree']);
    expect(() => resolveText('the <b>{ui:panel.tree}</b> window', dict)).toThrow(
      /panel\.tree/,
    );
    expect(resolveText('the {ui:panel.tree}', enUS as Record<string, string>)).toBe(
      `the ${enUS['panel.tree']}`,
    );
    // The two languages quote the same keys: a term quoted in one is quoted in the other.
    expect(
      missingUiKeys(GUIDE_MESSAGES['pt-BR'], ptBR as Record<string, string>),
    ).toEqual([]);
  });

  it('the page texts are in English and in pt-BR, with the same walkthrough', () => {
    const { messages } = pageTexts(html);
    expect(messages['en-US'].pageTitle).toBe('Mapping guide');
    expect(messages['pt-BR'].pageTitle).toBe('Guia do Mapping');
    expect(messages['en-US'].steps).toHaveLength(messages['pt-BR'].steps.length);
    expect(messages['en-US'].steps[0]?.t).toBe('Containers and markings');
    expect(messages['pt-BR'].steps[0]?.t).toBe('Containers e marcações');
    // No Portuguese left in the English texts (the example names are the project's data).
    for (const step of messages['en-US'].steps) {
      expect(plain(step.p + step.try)).not.toMatch(/\b(você|clique|camada|marcação)\b/i);
    }
  });

  it('carries the example data: 4 screens, 31 markings, 41 annotations and 10 layers', () => {
    const script = blocks(html, 'script').find((s) => s.includes('const D ='));
    const json = /const D = (\{.*\});\n/.exec(script ?? '')?.[1];
    expect(json).toBeDefined();
    const data = JSON.parse(json ?? '{}') as {
      images: unknown[];
      markings: unknown[];
      annotations: unknown[];
      layers: unknown[];
      files: Record<string, string>;
    };
    expect(data.images).toHaveLength(4);
    expect(data.markings).toHaveLength(31);
    expect(data.annotations).toHaveLength(41);
    expect(data.layers).toHaveLength(10); // the Notes layer stays in the list; the floating note and its annotation do not go to the guide
    expect(Object.keys(data.files)).toEqual(['images/signup.png', 'images/login.png']);
  });

  it('carries the perspectives and arrivals of mapping.json, never written by hand in the template', () => {
    const script = blocks(html, 'script').find((s) => s.includes('const D ='));
    const json = /const D = (\{.*\});\n/.exec(script ?? '')?.[1];
    const data = JSON.parse(json ?? '{}') as {
      images: { id: string; name: string }[];
      layers: { id: string; name: string }[];
      perspectives: { name: string; containers: string[]; hiddenLayers: string[] }[];
      arrivals: { name: string; fromName: string }[];
    };
    const imageName = (id: string) => data.images.find((i) => i.id === id)?.name;
    const layerName = (id: string) => data.layers.find((l) => l.id === id)?.name;
    expect(data.perspectives.map((p) => p.name)).toEqual(['Data', 'Material 3']);
    const [dataPerspective, material] = data.perspectives;
    expect(dataPerspective?.containers.map(imageName)).toEqual(['Sign up', 'Login']);
    expect(dataPerspective?.hiddenLayers.map(layerName).sort()).toEqual([
      'Components',
      'Events',
      'Questions',
    ]);
    expect(material?.containers.map(imageName)).toEqual(['Settings', 'Order details']);
    expect(material?.hiddenLayers).toEqual([]);
    expect(data.arrivals).toEqual([{ name: 'Sign up', fromName: 'Data' }]);
    // The template does not repeat the perspective names: they come from D.perspectives.
    const template = readFileSync('scripts/guide/template.html', 'utf8');
    expect(template).not.toMatch(/Material 3<\/option>|'Material 3'/);
  });

  it('the perspective picker is a select with a label, built by the DOM (CSP)', () => {
    expect(html).toMatch(
      /<label[^>]*for="persp"[^>]*data-i18n="perspectiveLabel"><\/label>/,
    );
    expect(html).toMatch(/<select[^>]*id="persp"/);
    const { messages } = pageTexts(html);
    expect(messages['en-US'].perspectiveLabel).toBe('Perspective');
    expect(messages['pt-BR'].perspectiveLabel).toBe('Perspectiva');
  });

  it('chooses the language like the app: saved mapping.locale, else the browser language', () => {
    const script =
      blocks(html, 'script').find((b) => b.includes('pickLocale(saved')) ?? '';
    expect(script).toContain("'mapping.locale'");
    expect(script).toContain("'preview:mapping.locale'");
    function chosen(
      pathname: string,
      store: Record<string, string>,
      language: string,
    ): { locale: string | null; lang: string | null } {
      const attrs: Record<string, string> = {};
      new Function('location', 'localStorage', 'navigator', 'document', script)(
        { pathname },
        { getItem: (k: string) => store[k] ?? null },
        { language },
        {
          documentElement: {
            setAttribute: (name: string, value: string) => (attrs[name] = value),
          },
        },
      );
      return { locale: attrs['data-locale'] ?? null, lang: attrs['lang'] ?? null };
    }
    expect(chosen('/guide/', {}, 'en-GB')).toEqual({ locale: 'en-US', lang: 'en' });
    expect(chosen('/guide/', {}, 'pt-PT')).toEqual({ locale: 'pt-BR', lang: 'pt-BR' });
    expect(chosen('/guide/', { 'mapping.locale': 'pt-BR' }, 'en-US').locale).toBe(
      'pt-BR',
    );
    expect(chosen('/guide/', { 'mapping.locale': 'en-US' }, 'pt-BR').locale).toBe(
      'en-US',
    );
    expect(chosen('/guide/', { 'mapping.locale': 'fr' }, 'pt-BR').locale).toBe('pt-BR');
    const store = { 'mapping.locale': 'en-US', 'preview:mapping.locale': 'pt-BR' };
    expect(chosen('/preview/guide/', store, 'en-US').locale).toBe('pt-BR');
    expect(chosen('/guide/', store, 'pt-BR').locale).toBe('en-US');
  });
});
