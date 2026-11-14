import { describe, expect, it } from 'vitest';
import { applyCsp, buildCsp, cspHash, injectCsp, verifyCsp } from '../../pwa/csp';
import source from '../../index.html?raw';

const REFERRER = /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/i;

/** An index.html like the one vite-plugin-singlefile outputs: embedded JS and CSS. */
const BUILT = `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="no-referrer" />
    <title>App</title>
    <script type="module" crossorigin>console.log("hi")</script>
    <style rel="stylesheet" crossorigin>body{margin:0}</style>
  </head>
  <body><div id="app"></div></body>
</html>
`;

describe('CSP of index.html (build)', () => {
  it('the hash is the base64 SHA-256 of the content, with normalized line breaks', () => {
    // base64 sha256("") is the classic value from the specification.
    expect(cspHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(cspHash('a\r\nb\rc')).toBe(cspHash('a\nb\nc'));
  });

  it('generates the policy with the block hashes and the fixed directives', () => {
    const policy = buildCsp(BUILT, 'app');
    expect(policy).toContain(`script-src ${cspHash('console.log("hi")')}`);
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

  it('app profile: img-src with https: and http:, and Trusted Types required with the default policy', () => {
    const directives = buildCsp(BUILT, 'app').split('; ');
    expect(directives).toContain("img-src 'self' data: blob: https: http:");
    expect(directives).toContain("require-trusted-types-for 'script'");
    expect(directives).toContain('trusted-types default');
  });

  it('static profile: img-src without remote image and without Trusted Types', () => {
    const policy = buildCsp(BUILT, 'static');
    const directives = policy.split('; ');
    expect(directives).toContain("img-src 'self' data: blob:");
    expect(policy).not.toMatch(/trusted-types|https:|http:/);
    expect(directives).toContain("connect-src 'none'");
    expect(verifyCsp(injectCsp(BUILT, 'static'), 'static')).toEqual([]);
  });

  it("the profiles are not mixed up: each one rejects the other's policy", () => {
    // pt-BR kept: messages emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(injectCsp(BUILT, 'static'), 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva img-src'),
        expect.stringContaining('diretiva require-trusted-types-for'),
        expect.stringContaining('diretiva trusted-types'),
      ]),
    );
    // pt-BR kept: messages emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(injectCsp(BUILT, 'app'), 'static')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva img-src'),
        expect.stringContaining('o perfil static não pode ter a diretiva'),
      ]),
    );
  });

  it('app profile: a missing <meta name="referrer"> fails; it is not required in static', () => {
    const noReferrer = BUILT.replace(/\s*<meta name="referrer"[^>]*>/, '');
    expect(noReferrer).not.toContain('referrer');
    expect(verifyCsp(injectCsp(noReferrer, 'app'), 'app')).toEqual([
      expect.stringContaining('referrer'),
    ]);
    expect(() => applyCsp(noReferrer, 'app')).toThrow(/referrer/);
    expect(verifyCsp(injectCsp(noReferrer, 'static'), 'static')).toEqual([]);
  });

  it('the referrer with another value also fails in app', () => {
    const wrong = BUILT.replace('no-referrer', 'origin');
    expect(verifyCsp(injectCsp(wrong, 'app'), 'app')).toEqual([
      expect.stringContaining('referrer'),
    ]);
  });

  it('puts the <meta> right after the charset and is idempotent', () => {
    const html = applyCsp(BUILT, 'app');
    expect(html).toMatch(
      /<meta charset="UTF-8" \/>\s*<meta http-equiv="Content-Security-Policy"/,
    );
    expect(verifyCsp(html, 'app')).toEqual([]);
    expect(applyCsp(html, 'app')).toBe(html);
    expect(html.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('the build fails if the CSP is missing', () => {
    // pt-BR kept: message emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(BUILT, 'app')).toEqual([expect.stringContaining('não tem a CSP')]);
  });

  it('the build fails if an embedded block has no matching hash', () => {
    const html = injectCsp(BUILT, 'app').replace(
      'console.log("hi")',
      'console.log("changed")',
    );
    // pt-BR kept: messages emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(html, 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <script> embutido sem hash'),
        expect.stringContaining('script-src tem um hash sem bloco'),
      ]),
    );
    const css = injectCsp(BUILT, 'app').replace('body{margin:0}', 'body{margin:1px}');
    // pt-BR kept: message emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(css, 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bloco <style> embutido sem hash'),
      ]),
    );
  });

  it('the build fails with a new block (e.g. an extra <script>) outside the policy', () => {
    const html = injectCsp(BUILT, 'app').replace(
      '</head>',
      '<script>alert(1)</script></head>',
    );
    // pt-BR kept: message emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(html, 'app')).toEqual([
      expect.stringContaining('bloco <script> embutido sem hash'),
    ]);
  });

  it("rejects 'unsafe-inline' and 'unsafe-eval'", () => {
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

  it('rejects a changed fixed directive (e.g. open connect-src)', () => {
    const html = injectCsp(BUILT, 'app').replace(
      "connect-src 'none'",
      "connect-src 'self'",
    );
    // pt-BR kept: message emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(html, 'app')).toEqual([
      expect.stringContaining('diretiva connect-src: esperado "\'none\'"'),
    ]);
  });

  it('rejects external script and CSS, style="" and inline handlers', () => {
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
    // pt-BR kept: messages emitted by pwa/csp.ts (outside this phase), asserted verbatim
    expect(verifyCsp(attrs, 'app')).toEqual([
      expect.stringContaining('atributo style'),
      expect.stringContaining('handler inline'),
    ]);
  });

  it('does not mistake text inside the embedded JS for HTML attributes', () => {
    const js = 'const a = `<div style="x" onclick="y">`; </script'.replace(
      '</script',
      '',
    );
    const html = BUILT.replace('console.log("hi")', js);
    expect(verifyCsp(injectCsp(html, 'app'), 'app')).toEqual([]);
  });

  it('the source index.html has the referrer meta before any resource', () => {
    const referrer = source.search(REFERRER);
    expect(referrer).toBeGreaterThanOrEqual(0);
    expect(source.search(/<(link|script)\b/i)).toBeGreaterThan(referrer);
  });

  it('the source index.html has no style="" or inline handlers (the CSP would block them)', () => {
    const tags = source.match(/<[a-z][^>]*>/gi) ?? [];
    expect(tags.filter((tag) => /\sstyle\s*=/i.test(tag))).toEqual([]);
    expect(tags.filter((tag) => /\son[a-z]+\s*=/i.test(tag))).toEqual([]);
  });
});
