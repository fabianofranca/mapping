import { describe, expect, it } from 'vitest';
import { applyCsp, buildCsp, cspHash, injectCsp, verifyCsp } from '../../pwa/csp';
import source from '../../index.html?raw';

const REFERRER = /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/i;

/** Um index.html como o que sai do vite-plugin-singlefile: JS e CSS embutidos. */
const BUILT = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="no-referrer" />
    <title>App</title>
    <script type="module" crossorigin>console.log("oi")</script>
    <style rel="stylesheet" crossorigin>body{margin:0}</style>
  </head>
  <body><div id="app"></div></body>
</html>
`;

describe('CSP do index.html (build)', () => {
  it('o hash é o SHA-256 em base64 do conteúdo, com quebras de linha normalizadas', () => {
    // sha256("") em base64 é o valor clássico da especificação.
    expect(cspHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(cspHash('a\r\nb\rc')).toBe(cspHash('a\nb\nc'));
  });

  it('gera a política com os hashes dos blocos e as diretivas fixas', () => {
    const policy = buildCsp(BUILT, 'app');
    expect(policy).toContain(`script-src ${cspHash('console.log("oi")')}`);
    expect(policy).toContain(`style-src ${cspHash('body{margin:0}')}`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("manifest-src 'self'");
    for (const none of ['object-src', 'frame-src', 'form-action', 'base-uri']) {
      expect(policy).toContain(`${none} 'none'`);
    }
    expect(policy).not.toMatch(/unsafe-/);
  });

  it('perfil app: img-src com https: e http:, e Trusted Types exigido com a política default', () => {
    const directives = buildCsp(BUILT, 'app').split('; ');
    expect(directives).toContain("img-src 'self' data: blob: https: http:");
    expect(directives).toContain("require-trusted-types-for 'script'");
    expect(directives).toContain('trusted-types default');
  });

  it('perfil static: img-src sem imagem remota e sem Trusted Types', () => {
    const policy = buildCsp(BUILT, 'static');
    const directives = policy.split('; ');
    expect(directives).toContain("img-src 'self' data: blob:");
    expect(policy).not.toMatch(/trusted-types|https:|http:/);
    expect(directives).toContain("connect-src 'none'");
    expect(verifyCsp(injectCsp(BUILT, 'static'), 'static')).toEqual([]);
  });

  it('os perfis não se confundem: cada um rejeita a política do outro', () => {
    expect(verifyCsp(injectCsp(BUILT, 'static'), 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva img-src'),
        expect.stringContaining('diretiva require-trusted-types-for'),
        expect.stringContaining('diretiva trusted-types'),
      ]),
    );
    expect(verifyCsp(injectCsp(BUILT, 'app'), 'static')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva img-src'),
        expect.stringContaining('o perfil static não pode ter a diretiva'),
      ]),
    );
  });

  it('perfil app: a falta de <meta name="referrer"> falha; no static não é exigida', () => {
    const noReferrer = BUILT.replace(/\s*<meta name="referrer"[^>]*>/, '');
    expect(noReferrer).not.toContain('referrer');
    expect(verifyCsp(injectCsp(noReferrer, 'app'), 'app')).toEqual([
      expect.stringContaining('referrer'),
    ]);
    expect(() => applyCsp(noReferrer, 'app')).toThrow(/referrer/);
    expect(verifyCsp(injectCsp(noReferrer, 'static'), 'static')).toEqual([]);
  });

  it('o referrer com outro valor também falha no app', () => {
    const wrong = BUILT.replace('no-referrer', 'origin');
    expect(verifyCsp(injectCsp(wrong, 'app'), 'app')).toEqual([
      expect.stringContaining('referrer'),
    ]);
  });

  it('põe a <meta> logo depois do charset e é idempotente', () => {
    const html = applyCsp(BUILT, 'app');
    expect(html).toMatch(
      /<meta charset="UTF-8" \/>\s*<meta http-equiv="Content-Security-Policy"/,
    );
    expect(verifyCsp(html, 'app')).toEqual([]);
    expect(applyCsp(html, 'app')).toBe(html);
    expect(html.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('o build falha se a CSP faltar', () => {
    expect(verifyCsp(BUILT, 'app')).toEqual([expect.stringContaining('não tem a CSP')]);
  });

  it('o build falha se um bloco embutido não tiver o hash correspondente', () => {
    const html = injectCsp(BUILT, 'app').replace(
      'console.log("oi")',
      'console.log("alterado")',
    );
    expect(verifyCsp(html, 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <script> embutido sem hash'),
        expect.stringContaining('script-src tem um hash sem bloco'),
      ]),
    );
    const css = injectCsp(BUILT, 'app').replace('body{margin:0}', 'body{margin:1px}');
    expect(verifyCsp(css, 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <style> embutido sem hash'),
      ]),
    );
  });

  it('o build falha com um bloco novo (ex.: um <script> a mais) fora da política', () => {
    const html = injectCsp(BUILT, 'app').replace(
      '</head>',
      '<script>alert(1)</script></head>',
    );
    expect(verifyCsp(html, 'app')).toEqual([
      expect.stringContaining('bloco <script> embutido sem hash'),
    ]);
  });

  it("rejeita 'unsafe-inline' e 'unsafe-eval'", () => {
    const html = injectCsp(BUILT, 'app').replace(
      "style-src '",
      "style-src 'unsafe-inline' '",
    );
    expect(verifyCsp(html, 'app').join('\n')).toContain('unsafe-inline');
    const evalHtml = injectCsp(BUILT, 'app').replace(
      "img-src 'self'",
      "img-src 'unsafe-eval'",
    );
    expect(verifyCsp(evalHtml, 'app').join('\n')).toContain('unsafe-eval');
  });

  it('rejeita diretiva fixa alterada (ex.: connect-src aberto)', () => {
    const html = injectCsp(BUILT, 'app').replace(
      "connect-src 'none'",
      "connect-src 'self'",
    );
    expect(verifyCsp(html, 'app')).toEqual([
      expect.stringContaining('diretiva connect-src: esperado "\'none\'"'),
    ]);
  });

  it('rejeita script e CSS externos, style="" e handlers inline', () => {
    const external = injectCsp(BUILT, 'app').replace(
      '</head>',
      '<script src="./x.js"></script><link rel="stylesheet" href="./x.css" /></head>',
    );
    expect(verifyCsp(external, 'app')).toEqual([
      expect.stringContaining('<script src>'),
      expect.stringContaining('<link rel="stylesheet">'),
    ]);
    const attrs = injectCsp(BUILT, 'app').replace(
      '<div id="app"></div>',
      '<div id="app" style="color:red" onclick="x()"></div>',
    );
    expect(verifyCsp(attrs, 'app')).toEqual([
      expect.stringContaining('atributo style'),
      expect.stringContaining('handler inline'),
    ]);
  });

  it('não confunde texto dentro do JS embutido com atributos do HTML', () => {
    const js = 'const a = `<div style="x" onclick="y">`; </script'.replace(
      '</script',
      '',
    );
    const html = BUILT.replace('console.log("oi")', js);
    expect(verifyCsp(injectCsp(html, 'app'), 'app')).toEqual([]);
  });

  it('o index.html de origem tem a meta de referrer antes de qualquer recurso', () => {
    const referrer = source.search(REFERRER);
    expect(referrer).toBeGreaterThanOrEqual(0);
    expect(source.search(/<(link|script)\b/i)).toBeGreaterThan(referrer);
  });

  it('o index.html de origem não tem style="" nem handlers inline (a CSP os bloquearia)', () => {
    const tags = source.match(/<[a-z][^>]*>/gi) ?? [];
    expect(tags.filter((tag) => /\sstyle\s*=/i.test(tag))).toEqual([]);
    expect(tags.filter((tag) => /\son[a-z]+\s*=/i.test(tag))).toEqual([]);
  });
});
