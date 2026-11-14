import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type Plugin, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSecurityPolicy, serviceWorker } from '../../pwa/buildPlugins';
import { verifyCsp } from '../../pwa/csp';

type Bundle = Rollup.OutputBundle;

/** Embeds the chunks and the CSS in index.html, like vite-plugin-singlefile. */
function inline(bundle: Bundle): void {
  const html = bundle['index.html'];
  if (html?.type !== 'asset') throw new Error('index.html missing');
  let source = String(html.source);
  for (const [name, file] of Object.entries(bundle)) {
    if (name === 'index.html') continue;
    const re = new RegExp(
      `<(script|link)[^>]*${name.replace('.', '\\.')}[^>]*>(</script>)?`,
    );
    if (file.type === 'chunk') {
      source = source.replace(
        re,
        () => `<script type="module" crossorigin>${file.code}</script>`,
      );
    } else {
      source = source.replace(
        re,
        () => `<style rel="stylesheet" crossorigin>${String(file.source)}</style>`,
      );
    }
    delete bundle[name];
  }
  html.source = source;
}

/** Simulates vite-plugin-singlefile: 2.3.3 embeds in the normal phase; 2.3.4, in `order: 'post'`. */
function fakeSingleFile(version: '2.3.3' | '2.3.4'): Plugin {
  const hook = (_o: unknown, bundle: Bundle) => inline(bundle);
  return {
    name: 'fake-singlefile',
    enforce: 'post',
    apply: 'build',
    generateBundle:
      version === '2.3.3' ? { handler: hook } : { order: 'post', handler: hook },
  };
}

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'plugin-order-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta name="referrer" content="no-referrer" /></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>',
  );
  writeFileSync(join(root, 'src/main.js'), "import './style.css';\nconsole.log('hi');\n");
  writeFileSync(join(root, 'src/style.css'), 'body{margin:0}\n');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function runBuild(version: '2.3.3' | '2.3.4'): Promise<Map<string, string>> {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    base: './',
    // Same list as vite.config.ts: singlefile, CSP, sw.
    plugins: [fakeSingleFile(version), contentSecurityPolicy(), serviceWorker('main')],
    build: { write: false, minify: false, cssCodeSplit: false },
  });
  const outputs = Array.isArray(result) ? result : [result as Rollup.RollupOutput];
  const files = new Map<string, string>();
  for (const { output } of outputs) {
    for (const item of output) {
      files.set(item.fileName, item.type === 'chunk' ? item.code : String(item.source));
    }
  }
  return files;
}

describe.each(['2.3.3', '2.3.4'] as const)(
  'build plugin order with singlefile %s',
  (version) => {
    it('the final index.html has embedded JS and CSS and the CSP over them, and sw.js carries the hash of that HTML', async () => {
      const files = await runBuild(version);
      const html = files.get('index.html') ?? '';
      expect(html).not.toMatch(/<script[^>]*\ssrc=/);
      expect(html).not.toMatch(/<link[^>]*rel="stylesheet"/);
      expect(html).toMatch(/console\.log\(["']hi["']\)/);
      expect(html).toContain('body{margin:0}');
      expect(html).toContain('Content-Security-Policy');
      expect(html).not.toContain('unsafe-inline');
      expect(verifyCsp(html, 'app')).toEqual([]);
      const sw = files.get('sw.js') ?? '';
      expect(sw).not.toContain('__BUILD_ID__');
      expect(files.has('manifest.webmanifest')).toBe(true);
    });
  },
);

describe('sw.js hash', () => {
  it('is the same in both singlefile versions', async () => {
    const [a, b] = [await runBuild('2.3.3'), await runBuild('2.3.4')];
    expect(a.get('index.html')).toBe(b.get('index.html'));
    expect(a.get('sw.js')).toBe(b.get('sw.js'));
  });
});
