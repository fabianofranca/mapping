import { describe, expect, it } from 'vitest';
import { applyCsp, buildCsp, cspHash, injectCsp, verifyCsp } from '../../pwa/csp';
import {
  SANDBOX_BOOTSTRAP,
  SANDBOX_BOOTSTRAP_HASH,
  SANDBOX_SRCDOC,
} from '../../src/app/formatSandbox';
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
        expect.stringContaining('não pode ter a diretiva'),
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
    expect(verifyCsp(attrs, 'app')).toEqual([
      expect.stringContaining('style="" attribute'),
      expect.stringContaining('inline handler'),
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

  it("app profile: worker-src allows blob: and script-src has the hash of the sandbox's bootstrap", () => {
    const directives = buildCsp(BUILT, 'app').split('; ');
    expect(directives).toContain("worker-src 'self' blob:");
    const scriptSrc = directives.find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc.split(' ')).toContain(cspHash(SANDBOX_BOOTSTRAP));
    expect(scriptSrc.split(' ')).toContain(cspHash('console.log("hi")'));
  });

  it("the constant hash of the sandbox's bootstrap is the one the build computes (stage #2059, decision 5)", () => {
    expect(SANDBOX_BOOTSTRAP_HASH).toBe(cspHash(SANDBOX_BOOTSTRAP));
    const scriptSrc =
      buildCsp(BUILT, 'app')
        .split('; ')
        .find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc.split(' ')).toContain(SANDBOX_BOOTSTRAP_HASH);
  });

  it("the sandbox document carries its own CSP in a <meta> before the script, narrowing the host's", () => {
    const meta = SANDBOX_SRCDOC.match(
      /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/,
    );
    expect(meta).not.toBeNull();
    expect(meta![1]).toBe(
      `default-src 'none'; script-src ${SANDBOX_BOOTSTRAP_HASH} blob:; worker-src blob:; connect-src 'none'`,
    );
    expect(SANDBOX_SRCDOC.indexOf('Content-Security-Policy')).toBeLessThan(
      SANDBOX_SRCDOC.indexOf('<script>'),
    );
  });

  it('app profile: verifyCsp accepts the bootstrap hash with no inline block, and wants it', () => {
    const html = applyCsp(BUILT, 'app');
    expect(verifyCsp(html, 'app')).toEqual([]);
    expect(html).not.toContain('SANDBOX');
    const without = html.replace(` ${cspHash(SANDBOX_BOOTSTRAP)}`, '');
    expect(without).not.toBe(html);
    expect(verifyCsp(without, 'app')).toEqual([
      expect.stringContaining('sandbox bootstrap'),
    ]);
    const blob = html.replace("worker-src 'self' blob:", "worker-src 'self'");
    expect(verifyCsp(blob, 'app')).toEqual([
      expect.stringContaining('diretiva worker-src'),
    ]);
  });

  it('static profile: no blob: worker and no bootstrap hash (it does not change)', () => {
    const policy = buildCsp(BUILT, 'static');
    expect(policy.split('; ')).toContain("worker-src 'self'");
    expect(policy).not.toContain(cspHash(SANDBOX_BOOTSTRAP));
    expect(policy).not.toContain('blob: ');
    const html = injectCsp(BUILT, 'static');
    expect(verifyCsp(html, 'static')).toEqual([]);
    const withHash = html.replace(
      'script-src ',
      `script-src ${cspHash(SANDBOX_BOOTSTRAP)} `,
    );
    expect(verifyCsp(withHash, 'static')).toEqual([
      expect.stringContaining('script-src tem um hash sem bloco'),
    ]);
  });

  it("viewer profile: static plus the sandbox's worker-src blob: and bootstrap hash, no Trusted Types (stage #2059, decision 14)", () => {
    const policy = buildCsp(BUILT, 'viewer');
    const directives = policy.split('; ');
    expect(directives).toContain("worker-src 'self' blob:");
    expect(directives).toContain("img-src 'self' data: blob:");
    expect(directives).toContain("connect-src 'none'");
    const scriptSrc = directives.find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc.split(' ')).toContain(SANDBOX_BOOTSTRAP_HASH);
    expect(scriptSrc.split(' ')).toContain(cspHash('console.log("hi")'));
    expect(policy).not.toMatch(/trusted-types|https:|http:/);
    expect(verifyCsp(injectCsp(BUILT, 'viewer'), 'viewer')).toEqual([]);
    expect(() => applyCsp(BUILT, 'viewer')).not.toThrow();
  });

  it('viewer profile: verifyCsp wants the bootstrap hash and the blob: worker, and rejects Trusted Types', () => {
    const html = injectCsp(BUILT, 'viewer');
    const without = html.replace(` ${cspHash(SANDBOX_BOOTSTRAP)}`, '');
    expect(without).not.toBe(html);
    expect(verifyCsp(without, 'viewer')).toEqual([
      expect.stringContaining('sandbox bootstrap'),
    ]);
    const noBlob = html.replace("worker-src 'self' blob:", "worker-src 'self'");
    expect(verifyCsp(noBlob, 'viewer')).toEqual([
      expect.stringContaining('diretiva worker-src'),
    ]);
    const withTrusted = html.replace(
      "base-uri 'none'",
      "base-uri 'none'; require-trusted-types-for 'script'",
    );
    expect(verifyCsp(withTrusted, 'viewer')).toEqual([
      expect.stringContaining('não pode ter a diretiva'),
    ]);
  });

  it('viewer profile: the referrer meta is not required, and the other profiles do not accept its policy', () => {
    const noReferrer = BUILT.replace(/\s*<meta name="referrer"[^>]*>/, '');
    expect(verifyCsp(injectCsp(noReferrer, 'viewer'), 'viewer')).toEqual([]);
    expect(verifyCsp(injectCsp(BUILT, 'viewer'), 'static')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva worker-src'),
        expect.stringContaining('script-src tem um hash sem bloco'),
      ]),
    );
    expect(verifyCsp(injectCsp(BUILT, 'viewer'), 'app')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva img-src'),
        expect.stringContaining('diretiva require-trusted-types-for'),
      ]),
    );
    expect(verifyCsp(injectCsp(BUILT, 'static'), 'viewer')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('diretiva worker-src'),
        expect.stringContaining('sandbox bootstrap'),
      ]),
    );
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
