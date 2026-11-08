// Decisões da estável do MCP (etapa #920): o YAML só junta os dados (tags, versão, arquivos
// mudados) e chama este script. Só Node, sem dependências.
//   decide --version-file <mcp/version.ts> --sha <sha> [--tags-file <arquivo>] [--output <arquivo>]
//     Job `decide` do `mcp-release.yml` (push na main): a tag `mcp-v<versão>` existe? Sem
//     `--tags-file`, lê as tags do remoto (`git ls-remote --tags origin`). Escreve `tag`, `sha` e
//     `publish` em `--output` (o `$GITHUB_OUTPUT`) e imprime o aviso quando pula.
//   epic --version-file <mcp/version.ts>
//     Passo "Versão do MCP" do job `epic` do `ci.yml`: sai com 1 e `::error::` se o épico muda
//     entrada da release e mantém a versão que já tem estável (ou se a versão nova não é maior).
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { releaseInputsIn } from './releaseInputs.mjs';

export const STABLE_TAG = /^mcp-v(\d+)\.(\d+)\.(\d+)$/;
const MAX_LISTED = 5;

/** Nomes de tag de um texto: `git ls-remote --tags` (`<sha>\trefs/tags/<tag>`) ou `git tag -l`. */
export function parseTags(text) {
  const tags = [];
  for (const line of text.split('\n')) {
    const last = line.trim().split(/\s+/).pop() ?? '';
    const tag = last.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
    if (tag !== '' && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/** `SERVER_VERSION` do texto de `mcp/version.ts`. */
export function readServerVersion(source) {
  const match = /SERVER_VERSION = '([^']*)';/.exec(source);
  if (!match) throw new Error('SERVER_VERSION não encontrada em mcp/version.ts.');
  return match[1];
}

function parts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Versão inválida: "${version}" (esperado x.y.z).`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negativo se `a < b`, 0 se iguais, positivo se `a > b` (semver x.y.z). */
export function compareVersions(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** A maior versão estável entre as tags (rc e snapshot não contam), ou `null`. */
export function latestStable(tags) {
  let best = null;
  for (const tag of tags) {
    const match = STABLE_TAG.exec(tag);
    if (!match) continue;
    const version = `${match[1]}.${match[2]}.${match[3]}`;
    if (best === null || compareVersions(version, best) > 0) best = version;
  }
  return best;
}

/** Job `decide`: publica só se a tag estável da versão ainda não existe. */
export function decideRelease({ version, tags }) {
  parts(version);
  const tag = `mcp-v${version}`;
  if (tags.includes(tag)) {
    return {
      publish: false,
      tag,
      level: 'notice',
      message: `${tag} já publicada; nada a fazer`,
    };
  }
  return { publish: true, tag, level: 'notice', message: `${tag} é nova; publicando.` };
}

function listFiles(files) {
  const shown = files.slice(0, MAX_LISTED).join(', ');
  const rest = files.length - MAX_LISTED;
  return rest > 0 ? `${shown} e mais ${rest}` : shown;
}

/** Passo "Versão do MCP" do job `epic`. `changed` só é lido quando a tag da versão existe. */
export function checkEpicVersion({ version, tags, changed }) {
  parts(version);
  const tag = `mcp-v${version}`;
  if (!tags.includes(tag)) {
    const last = latestStable(tags);
    if (last !== null && compareVersions(version, last) <= 0) {
      return {
        ok: false,
        level: 'error',
        message: `A versão ${version} em mcp/version.ts é menor ou igual à última estável (${last}). Suba SERVER_VERSION para uma versão maior que ${last}.`,
      };
    }
    return {
      ok: true,
      level: 'notice',
      message: `Versão ${version} nova: o merge na main publica a estável ${tag}.`,
    };
  }
  const touched = releaseInputsIn(changed);
  if (touched.length > 0) {
    return {
      ok: false,
      level: 'error',
      message: `O épico muda o que vai na release do MCP (${listFiles(touched)}) e mantém a versão ${version}, que já tem a estável ${tag}. Suba SERVER_VERSION em mcp/version.ts (e os docs que a citam).`,
    };
  }
  return {
    ok: true,
    level: 'notice',
    message: `Nada do que vai na release do MCP mudou e a versão ${version} já tem a estável ${tag}: o merge não publica estável.`,
  };
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} falhou: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

function tagsFrom(argv) {
  const file = option(argv, '--tags-file');
  const text = file ? readFileSync(file, 'utf8') : git('ls-remote', '--tags', 'origin');
  return parseTags(text).filter((tag) => tag.startsWith('mcp-v'));
}

function annotate(level, message) {
  process.stdout.write(`::${level}::${message}\n`);
}

function runDecide(argv, version) {
  const decision = decideRelease({ version, tags: tagsFrom(argv) });
  if (!decision.publish) annotate(decision.level, decision.message);
  const output = option(argv, '--output');
  if (output) {
    const sha = option(argv, '--sha') ?? '';
    appendFileSync(
      output,
      `tag=${decision.tag}\nsha=${sha}\npublish=${decision.publish}\n`,
    );
  }
  return 0;
}

function runEpic(version) {
  const tags = parseTags(git('tag', '-l', 'mcp-v*'));
  const tag = `mcp-v${version}`;
  const changed = tags.includes(tag)
    ? git('diff', '--name-only', tag, 'HEAD').split('\n').filter(Boolean)
    : [];
  const verdict = checkEpicVersion({ version, tags, changed });
  annotate(verdict.level, verdict.message);
  return verdict.ok ? 0 : 1;
}

function main(argv) {
  const command = argv[0];
  const versionFile = option(argv, '--version-file');
  if ((command !== 'decide' && command !== 'epic') || !versionFile) {
    throw new Error(
      'Uso: node scripts/release/stableRelease.mjs <decide|epic> --version-file <mcp/version.ts> [...]',
    );
  }
  const version = readServerVersion(readFileSync(versionFile, 'utf8'));
  return command === 'decide' ? runDecide(argv, version) : runEpic(version);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
