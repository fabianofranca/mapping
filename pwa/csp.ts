// Content Security Policy of the final `index.html` (stage 2.4; used by vite.config.ts).
//
// The policy is generated at build time, AFTER vite-plugin-singlefile inlines the JS and CSS,
// because the hashes are computed over the final content of each `<script>` and
// `<style>` block. There is no `'unsafe-inline'` or `'unsafe-eval'`. This module is pure (only
// `node:crypto`), so it can be tested without running Vite.
import { createHash } from 'node:crypto';

/**
 * Policy profile. `app` is the app's `index.html`: it accepts remote images (`https:`/`http:`;
 * the `http:` switch belongs to the app, not to the CSP) and requires Trusted Types. `static` is the guide and the
 * viewer demo: the guide builds the panel with non-empty `innerHTML` and the demo does not
 * load the `default` policy; neither shows a remote image, so an outbound image
 * stays blocked by the CSP in them.
 */
export type CspProfile = 'app' | 'static';

type Directive = readonly [name: string, value: string];

/** Fixed directives; `script-src` and `style-src` come from the hashes of the inlined blocks. */
const STATIC_DIRECTIVES: ReadonlyArray<Directive> = [
  ['default-src', "'none'"],
  // Project images (blob:), icons and images inlined in the CSS (data:), app icons ('self').
  ['img-src', "'self' data: blob:"],
  // No network request made by the page's code (fetch, XHR, WebSocket, SSE).
  ['connect-src', "'none'"],
  ['worker-src', "'self'"],
  ['manifest-src', "'self'"],
  ['object-src', "'none'"],
  ['frame-src', "'none'"],
  ['form-action', "'none'"],
  ['base-uri', "'none'"],
];

/** Remote images (only in the `app` profile). */
const APP_IMG_SRC = "'self' data: blob: https: http:";
/** Trusted Types (only in the `app` profile): the `default` policy lives in `src/app/trustedTypes.ts`. */
const TRUSTED_TYPES_DIRECTIVES: ReadonlyArray<Directive> = [
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', 'default'],
];
const REFERRER_META =
  /<meta\s+name=["']referrer["']\s+content=["']no-referrer["'][^>]*>/i;

/** The profile's fixed directives. */
function fixedDirectives(profile: CspProfile): Directive[] {
  if (profile === 'static') return [...STATIC_DIRECTIVES];
  return [
    ...STATIC_DIRECTIVES.map(([name, value]): Directive => [
      name,
      name === 'img-src' ? APP_IMG_SRC : value,
    ]),
    ...TRUSTED_TYPES_DIRECTIVES,
  ];
}

const CSP_META = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i;
/** The CSP <meta> with the line break and indentation before it (to replace it without leftovers). */
const OLD_CSP_LINE = new RegExp(`\\n?[ \\t]*${CSP_META.source}`, 'i');
const INLINE_BLOCK = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

interface InlineBlock {
  readonly tag: 'script' | 'style';
  readonly attributes: string;
  readonly content: string;
}

function inlineBlocks(html: string): InlineBlock[] {
  return [...html.matchAll(INLINE_BLOCK)].map((m) => ({
    tag: (m[1] ?? '').toLowerCase() as 'script' | 'style',
    attributes: m[2] ?? '',
    content: m[3] ?? '',
  }));
}

/** The browser normalizes line breaks (CRLF/CR → LF) before computing the hash. */
export function cspHash(content: string): string {
  const text = content.replace(/\r\n?/g, '\n');
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

function hashesOf(html: string, tag: 'script' | 'style'): string[] {
  const hashes = inlineBlocks(html)
    .filter((b) => b.tag === tag && !/\ssrc\s*=/i.test(b.attributes))
    .map((b) => cspHash(b.content));
  return [...new Set(hashes)];
}

/** The policy for this HTML (already with the inlined blocks). */
export function buildCsp(html: string, profile: CspProfile): string {
  const scripts = hashesOf(html, 'script');
  const styles = hashesOf(html, 'style');
  const sources = (hashes: string[]) => (hashes.length > 0 ? hashes.join(' ') : "'none'");
  const [defaultSrc, ...rest] = fixedDirectives(profile);
  const directives: Array<readonly [string, string]> = [
    ...(defaultSrc ? [defaultSrc] : []),
    ['script-src', sources(scripts)],
    ['style-src', sources(styles)],
    ...rest,
  ];
  return directives.map(([name, value]) => `${name} ${value}`).join('; ');
}

/**
 * Puts the CSP in a `<meta>` right after the `charset` (the policy only applies to what comes
 * after it). Idempotent: a previous CSP is replaced.
 */
export function injectCsp(html: string, profile: CspProfile): string {
  const withoutOld = html.replace(OLD_CSP_LINE, '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(withoutOld, profile)}" />`;
  const charset = /<meta\s+charset=[^>]*>/i.exec(withoutOld);
  if (charset) {
    const end = charset.index + charset[0].length;
    return `${withoutOld.slice(0, end)}\n    ${meta}${withoutOld.slice(end)}`;
  }
  const head = /<head[^>]*>/i.exec(withoutOld);
  if (!head) throw new Error('index.html has no <head>: nowhere to put the CSP');
  const end = head.index + head[0].length;
  return `${withoutOld.slice(0, end)}\n    ${meta}${withoutOld.slice(end)}`;
}

function parseDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), values);
  }
  return directives;
}

/**
 * Checks the final `index.html` and returns the problems (empty list = ok):
 * missing CSP, altered fixed directives (per profile), missing referrer in `app`, `unsafe-*`, inlined block without hash,
 * hash without block, external resources and `style=""`/inline handlers, which the CSP would block.
 */
export function verifyCsp(html: string, profile: CspProfile): string[] {
  const problems: string[] = [];
  const meta = CSP_META.exec(html);
  if (!meta) return ['o index.html não tem a CSP em <meta http-equiv>'];
  const content = /\scontent=(?:"([^"]*)"|'([^']*)')/i.exec(meta[0]);
  const policy = content?.[1] ?? content?.[2];
  if (policy === undefined) return ['the CSP of the index.html has no content attribute'];
  const directives = parseDirectives(policy);

  for (const [name, expected] of fixedDirectives(profile)) {
    const actual = (directives.get(name) ?? []).join(' ');
    if (actual !== expected) {
      problems.push(`diretiva ${name}: esperado "${expected}", encontrado "${actual}"`);
    }
  }
  if (profile === 'static') {
    for (const name of ['require-trusted-types-for', 'trusted-types']) {
      if (directives.has(name)) {
        problems.push(`o perfil static não pode ter a diretiva ${name}`);
      }
    }
  } else if (!REFERRER_META.test(html)) {
    problems.push(
      'o perfil app exige <meta name="referrer" content="no-referrer"> no <head>',
    );
  }
  if (/'unsafe-(inline|eval|hashes)'|'strict-dynamic'/i.test(policy)) {
    problems.push(
      "the CSP must not have 'unsafe-inline', 'unsafe-eval' or 'unsafe-hashes'",
    );
  }

  const body = html.replace(CSP_META, '');
  for (const tag of ['script', 'style'] as const) {
    const allowed = directives.get(`${tag}-src`) ?? [];
    const expected = hashesOf(body, tag);
    for (const hash of expected) {
      if (!allowed.includes(hash)) {
        problems.push(`bloco <${tag}> embutido sem hash correspondente na CSP: ${hash}`);
      }
    }
    for (const hash of allowed) {
      if (hash !== "'none'" && !expected.includes(hash)) {
        problems.push(`${tag}-src tem um hash sem bloco <${tag}>: ${hash}`);
      }
    }
  }

  // Resources the policy would block.
  const markup = body.replace(INLINE_BLOCK, (all, tag: string, attrs: string) =>
    /\ssrc\s*=/i.test(attrs) ? all : `<${tag}${attrs}></${tag}>`,
  );
  if (/<script\b[^>]*\ssrc\s*=/i.test(markup)) {
    problems.push('there is an external <script src>: the JS must be embedded');
  }
  if (/<link\b[^>]*\brel=["']?stylesheet/i.test(markup)) {
    problems.push(
      'there is an external <link rel="stylesheet">: the CSS must be embedded',
    );
  }
  const tags = markup.match(/<[a-z][^>]*>/gi) ?? [];
  if (tags.some((tag) => /\sstyle\s*=/i.test(tag))) {
    problems.push(
      'there is an atributo style="" in the HTML (use classes and the embedded CSS)',
    );
  }
  if (tags.some((tag) => /\son[a-z]+\s*=/i.test(tag))) {
    problems.push('there is a handler inline (onclick etc.) in the HTML');
  }
  return problems;
}

/** Generates the CSP and checks the result; throws (and the build fails) if anything does not match. */
export function applyCsp(html: string, profile: CspProfile): string {
  const result = injectCsp(html, profile);
  const problems = verifyCsp(result, profile);
  if (problems.length > 0) {
    throw new Error(`Invalid CSP in the index.html:\n- ${problems.join('\n- ')}`);
  }
  return result;
}
