import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUIA_OUTPUT, guiaHtml } from '../../scripts/guia';
import { verifyCsp } from '../../pwa/csp';
import { SHORTCUT_LABELS } from '../../src/app/shortcuts';
import { ptBR } from '../../src/i18n/pt-BR';
import {
  TOOL_WINDOWS,
  WINDOW_NUMBER,
  type ToolWindowId,
} from '../../src/store/toolWindows';

// O guia interativo (`public/guia/index.html`) sai de `scripts/guia/template.html` e do projeto
// de exemplo. Para gerar de novo: `npm run build:guia`.

const HINT = 'Rode `npm run build:guia` para regerar public/guia/index.html.';
const html = guiaHtml();

/** Os blocos <style> e <script> de um HTML. */
function blocks(source: string, tag: 'style' | 'script'): string[] {
  return [
    ...source.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g')),
  ].map((m) => m[1] ?? '');
}

describe('guia interativo', () => {
  it('public/guia/index.html está em dia com o template e o exemplo', () => {
    expect(readFileSync(GUIA_OUTPUT, 'utf8') === html, HINT).toBe(true);
  });

  it('leva a CSP da app e não usa fonte, script nem rede de fora', () => {
    expect(verifyCsp(html)).toEqual([]);
    expect(html.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)/);
  });

  it('o CSS próprio usa só tokens da app: sem cor, fonte, espaço, raio, opacidade ou duração literais', () => {
    const [tokens, own] = blocks(html, 'style')[0]!.split('Guia: roteiro à esquerda');
    expect(tokens).toContain('--color-bg');
    expect(own).toBeDefined();
    const css = own!.replaceAll(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
    // As mesmas categorias de tests/theme/tokenLiterals.test.ts. O `1px` fino (respiro de um
    // rótulo, largura de borda) e o `0px` do `env()` não são valores de design.
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

  it('segue o tema escolhido na app (chave mapping.theme) e o do sistema', () => {
    expect(html).toContain("'mapping.theme'");
    expect(html).toContain("[data-theme='dark']");
  });

  it('lê a chave de tema do canal: preview:mapping.theme em /preview/guia/', () => {
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
    expect(themeAt('/preview/guia/', store)).toBe('dark');
    expect(themeAt('/preview/guia/index.html', store)).toBe('dark');
    expect(themeAt('/guia/', store)).toBe('light');
    expect(themeAt('/mapping/guia/', store)).toBe('light');
    expect(themeAt('/preview/guia/', { 'mapping.theme': 'light' })).toBeNull();
  });

  it('os atalhos do guia são os da app', () => {
    const titles: Record<ToolWindowId, string> = {
      tree: ptBR['panel.tree'],
      layers: ptBR['layer.title'],
      details: ptBR['panel.details'],
      list: '',
      incomplete: ptBR['incomplete.title'],
      diagnostics: ptBR['diagnostics.title'],
      proposals: ptBR['proposals.title'],
      catalog: ptBR['catalog.window.title'],
    };
    const known = new Set<string>(Object.values(SHORTCUT_LABELS));
    const byCombo = new Map<string, string>();
    for (const id of TOOL_WINDOWS) {
      const combo = `Ctrl+Shift+${WINDOW_NUMBER[id]}`;
      known.add(combo);
      byCombo.set(combo, titles[id]);
    }
    byCombo.set(SHORTCUT_LABELS.arrange, ptBR['shortcuts.arrange']);
    const rows = [...html.matchAll(/<td><kbd>([^<]+)<\/kbd><\/td>\s*<td>([^<]+)<\/td>/g)];
    const expected = [1, 2, 3, 5, 6, 7, 9].map((n) => `Ctrl+Shift+${n}`);
    expect(rows.map((m) => m[1]).sort()).toEqual([...expected, 'Alt+Shift+A'].sort());
    for (const [, combo, label] of rows) {
      const title = byCombo.get(combo ?? '');
      expect(title, `${combo} não existe na app`).toBeTruthy();
      expect(label, combo).toContain(title);
    }
    // Todo <kbd> do texto (roteiro e cabeçalho) também existe na app.
    for (const m of html.matchAll(/<kbd>([^<]+)<\/kbd>/g)) {
      expect(known.has(m[1] ?? ''), `${m[1]} não é um atalho da app`).toBe(true);
    }
  });

  it('traz os dados do exemplo: 4 telas, 31 marcações, 41 anotações e 8 camadas', () => {
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
    expect(data.layers).toHaveLength(8);
    expect(Object.keys(data.files)).toEqual(['images/cadastro.png', 'images/login.png']);
  });
});
