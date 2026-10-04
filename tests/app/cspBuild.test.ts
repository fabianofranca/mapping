import { describe, expect, it } from 'vitest';
import { applyCsp, buildCsp, cspHash, injectCsp, verifyCsp } from '../../pwa/csp';
import source from '../../index.html?raw';

/** Um index.html como o que sai do vite-plugin-singlefile: JS e CSS embutidos. */
const BUILT = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
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
    const policy = buildCsp(BUILT);
    expect(policy).toContain(`script-src ${cspHash('console.log("oi")')}`);
    expect(policy).toContain(`style-src ${cspHash('body{margin:0}')}`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("manifest-src 'self'");
    for (const none of ['object-src', 'frame-src', 'form-action', 'base-uri']) {
      expect(policy).toContain(`${none} 'none'`);
    }
    expect(policy).not.toMatch(/unsafe-/);
  });

  it('põe a <meta> logo depois do charset e é idempotente', () => {
    const html = applyCsp(BUILT);
    expect(html).toMatch(
      /<meta charset="UTF-8" \/>\s*<meta http-equiv="Content-Security-Policy"/,
    );
    expect(verifyCsp(html)).toEqual([]);
    expect(applyCsp(html)).toBe(html);
    expect(html.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('o build falha se a CSP faltar', () => {
    expect(verifyCsp(BUILT)).toEqual([expect.stringContaining('não tem a CSP')]);
  });

  it('o build falha se um bloco embutido não tiver o hash correspondente', () => {
    const html = injectCsp(BUILT).replace('console.log("oi")', 'console.log("alterado")');
    expect(verifyCsp(html)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <script> embutido sem hash'),
        expect.stringContaining('script-src tem um hash sem bloco'),
      ]),
    );
    const css = injectCsp(BUILT).replace('body{margin:0}', 'body{margin:1px}');
    expect(verifyCsp(css)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <style> embutido sem hash'),
      ]),
    );
  });

  it('o build falha com um bloco novo (ex.: um <script> a mais) fora da política', () => {
    const html = injectCsp(BUILT).replace('</head>', '<script>alert(1)</script></head>');
    expect(verifyCsp(html)).toEqual([
      expect.stringContaining('bloco <script> embutido sem hash'),
    ]);
  });

  it("rejeita 'unsafe-inline' e 'unsafe-eval'", () => {
    const html = injectCsp(BUILT).replace("style-src '", "style-src 'unsafe-inline' '");
    expect(verifyCsp(html).join('\n')).toContain('unsafe-inline');
    const evalHtml = injectCsp(BUILT).replace("img-src 'self'", "img-src 'unsafe-eval'");
    expect(verifyCsp(evalHtml).join('\n')).toContain('unsafe-eval');
  });

  it('rejeita diretiva fixa alterada (ex.: connect-src aberto)', () => {
    const html = injectCsp(BUILT).replace("connect-src 'none'", "connect-src 'self'");
    expect(verifyCsp(html)).toEqual([
      expect.stringContaining('diretiva connect-src: esperado "\'none\'"'),
    ]);
  });

  it('rejeita script e CSS externos, style="" e handlers inline', () => {
    const external = injectCsp(BUILT).replace(
      '</head>',
      '<script src="./x.js"></script><link rel="stylesheet" href="./x.css" /></head>',
    );
    expect(verifyCsp(external)).toEqual([
      expect.stringContaining('<script src>'),
      expect.stringContaining('<link rel="stylesheet">'),
    ]);
    const attrs = injectCsp(BUILT).replace(
      '<div id="app"></div>',
      '<div id="app" style="color:red" onclick="x()"></div>',
    );
    expect(verifyCsp(attrs)).toEqual([
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
    expect(verifyCsp(injectCsp(html))).toEqual([]);
  });

  it('o index.html de origem não tem style="" nem handlers inline (a CSP os bloquearia)', () => {
    const tags = source.match(/<[a-z][^>]*>/gi) ?? [];
    expect(tags.filter((tag) => /\sstyle\s*=/i.test(tag))).toEqual([]);
    expect(tags.filter((tag) => /\son[a-z]+\s*=/i.test(tag))).toEqual([]);
  });
});
