// Content Security Policy do `index.html` final (etapa 2.4; usada por vite.config.ts).
//
// A política é gerada no build, DEPOIS de o vite-plugin-singlefile embutir o JS e o CSS,
// porque os hashes são calculados sobre o conteúdo final de cada bloco `<script>` e
// `<style>`. Não há `'unsafe-inline'` nem `'unsafe-eval'`. Este módulo é puro (só
// `node:crypto`), para ser testado sem rodar o Vite.
import { createHash } from 'node:crypto';

/**
 * Perfil da política. `app` é o `index.html` da app: aceita imagem remota (`https:`/`http:`;
 * o interruptor de `http:` é da app, não da CSP) e exige Trusted Types. `static` é o guia e as
 * páginas do laboratório: o guia monta o painel com `innerHTML` não vazio e o laboratório não
 * carrega a política `default`; nenhum dos dois mostra imagem remota, então a imagem para fora
 * continua barrada pela CSP neles.
 */
export type CspProfile = 'app' | 'static';

type Directive = readonly [name: string, value: string];

/** Diretivas fixas; `script-src` e `style-src` saem dos hashes dos blocos embutidos. */
const STATIC_DIRECTIVES: ReadonlyArray<Directive> = [
  ['default-src', "'none'"],
  // Imagens do projeto (blob:), ícones e embutidas no CSS (data:), ícones da app ('self').
  ['img-src', "'self' data: blob:"],
  // Nenhuma requisição de rede feita pelo código da página (fetch, XHR, WebSocket, SSE).
  ['connect-src', "'none'"],
  ['worker-src', "'self'"],
  ['manifest-src', "'self'"],
  ['object-src', "'none'"],
  ['frame-src', "'none'"],
  ['form-action', "'none'"],
  ['base-uri', "'none'"],
];

/** Imagens remotas (só no perfil `app`). */
const APP_IMG_SRC = "'self' data: blob: https: http:";
/** Trusted Types (só no perfil `app`): a política `default` fica em `src/app/trustedTypes.ts`. */
const TRUSTED_TYPES_DIRECTIVES: ReadonlyArray<Directive> = [
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', 'default'],
];
const REFERRER_META =
  /<meta\s+name=["']referrer["']\s+content=["']no-referrer["'][^>]*>/i;

/** As diretivas fixas do perfil. */
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
/** A <meta> da CSP com a quebra de linha e o recuo antes dela (para trocá-la sem sobras). */
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

/** O navegador normaliza quebras de linha (CRLF/CR → LF) antes de calcular o hash. */
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

/** A política para este HTML (já com os blocos embutidos). */
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
 * Coloca a CSP num `<meta>` logo depois do `charset` (a política só vale para o que vem
 * depois dela). Idempotente: uma CSP anterior é substituída.
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
  if (!head) throw new Error('index.html sem <head>: não há onde colocar a CSP');
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
 * Confere o `index.html` final e devolve os problemas (lista vazia = ok):
 * CSP ausente, diretivas fixas alteradas (por perfil), referrer ausente no `app`, `unsafe-*`, bloco embutido sem hash,
 * hash sem bloco, recursos externos e `style=""`/handlers inline, que a CSP bloquearia.
 */
export function verifyCsp(html: string, profile: CspProfile): string[] {
  const problems: string[] = [];
  const meta = CSP_META.exec(html);
  if (!meta) return ['o index.html não tem a CSP em <meta http-equiv>'];
  const content = /\scontent=(?:"([^"]*)"|'([^']*)')/i.exec(meta[0]);
  const policy = content?.[1] ?? content?.[2];
  if (policy === undefined) return ['a CSP do index.html não tem o atributo content'];
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
      "a CSP não pode ter 'unsafe-inline', 'unsafe-eval' nem 'unsafe-hashes'",
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

  // Recursos que a política bloquearia.
  const markup = body.replace(INLINE_BLOCK, (all, tag: string, attrs: string) =>
    /\ssrc\s*=/i.test(attrs) ? all : `<${tag}${attrs}></${tag}>`,
  );
  if (/<script\b[^>]*\ssrc\s*=/i.test(markup)) {
    problems.push('há <script src> externo: o JS precisa estar embutido');
  }
  if (/<link\b[^>]*\brel=["']?stylesheet/i.test(markup)) {
    problems.push('há <link rel="stylesheet"> externo: o CSS precisa estar embutido');
  }
  const tags = markup.match(/<[a-z][^>]*>/gi) ?? [];
  if (tags.some((tag) => /\sstyle\s*=/i.test(tag))) {
    problems.push('há atributo style="" no HTML (use classes e o CSS embutido)');
  }
  if (tags.some((tag) => /\son[a-z]+\s*=/i.test(tag))) {
    problems.push('há handler inline (onclick etc.) no HTML');
  }
  return problems;
}

/** Gera a CSP e confere o resultado; lança (e o build falha) se algo não bater. */
export function applyCsp(html: string, profile: CspProfile): string {
  const result = injectCsp(html, profile);
  const problems = verifyCsp(result, profile);
  if (problems.length > 0) {
    throw new Error(`CSP inválida no index.html:\n- ${problems.join('\n- ')}`);
  }
  return result;
}
