// Guia da rodada (etapa #421, decisão 7): gera o docs/TESTING.md só com os roteiros pedidos.
//
// Uso:
//   node scripts/testing/round-guide.mjs <roteiro…> [--out <arquivo>]   (ex.: R0 R2 R4 R11; `all` = R0 a R17)
//
// Tira do guia os roteiros não pedidos, os "Roteiros sob demanda (manuais)", a seção 9 e o
// "Registro do marco Uso real"; mantém o resto na ordem do guia ("Comece aqui", seções 1 a 7, a
// introdução da seção 8, o template do relato e os apêndices A e B). A granularidade é o roteiro
// inteiro. Roteiro inexistente: erro com a lista dos que existem (código de saída 2).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const GUIDE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'TESTING.md',
);

/** Parte o Markdown em trechos por cabeçalho `##`/`###` fora de bloco de código. */
function splitSections(markdown) {
  const sections = [{ level: 0, title: '', lines: [] }];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    const heading = fence || marker ? null : /^(#{2,3}) (.*)$/.exec(line);
    if (heading) {
      sections.push({ level: heading[1].length, title: heading[2], lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

const ROTEIRO = /^(R\d+)\b/;

/** Ids dos roteiros (`R0`, `R1`, …) que o guia tem, na ordem em que aparecem. */
export function listRoteiros(markdown) {
  return splitSections(markdown)
    .filter((section) => section.level === 3 && ROTEIRO.test(section.title))
    .map((section) => ROTEIRO.exec(section.title)[1]);
}

/** O guia sem os roteiros não pedidos, os sob demanda, a seção 9 e o registro do Uso real. */
export function buildRoundGuide(markdown, roteiros, { commit = 'desconhecido' } = {}) {
  const existing = listRoteiros(markdown);
  const wanted = new Set(
    roteiros.includes('all') ? existing : roteiros.map((r) => r.toUpperCase()),
  );
  for (const id of wanted) {
    if (!existing.includes(id)) {
      throw new Error(`Roteiro inexistente: ${id}. Existem: ${existing.join(', ')}.`);
    }
  }
  let dropParent = false;
  const kept = [];
  for (const section of splitSections(markdown)) {
    if (section.level === 2) {
      dropParent = /^9\./.test(section.title);
    }
    const roteiro = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    const drop =
      (section.level === 2 && dropParent) ||
      (section.level === 3 &&
        (dropParent ||
          (roteiro && !wanted.has(roteiro)) ||
          /^Roteiros sob demanda/.test(section.title) ||
          /^Registro do marco/.test(section.title)));
    if (!drop) kept.push(section.lines.join('\n'));
  }
  const ids = existing.filter((id) => wanted.has(id));
  const note = `> Guia da rodada (commit ${commit}): roteiros ${ids.join(', ')}. O guia inteiro é o docs/TESTING.md; consulte-o por trecho (Grep) para o que faltar aqui.`;
  return `${note}\n\n${kept.join('\n')}`;
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'desconhecido';
  }
}

function runCli(argv) {
  const roteiros = [];
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[(i += 1)];
    } else {
      roteiros.push(argv[i]);
    }
  }
  if (roteiros.length === 0 || (argv.includes('--out') && !out)) {
    console.error(
      'Uso: node scripts/testing/round-guide.mjs <roteiro…|all> [--out <arquivo>]',
    );
    process.exitCode = 2;
    return;
  }
  const markdown = fs.readFileSync(GUIDE_FILE, 'utf8');
  let guide;
  try {
    guide = buildRoundGuide(markdown, roteiros, { commit: currentCommit() });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  const percent = Math.round(
    (Buffer.byteLength(guide) / Buffer.byteLength(markdown)) * 100,
  );
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, guide);
    console.error(
      `${out}: ${Buffer.byteLength(guide)} bytes (${percent}% do docs/TESTING.md)`,
    );
  } else {
    process.stdout.write(`${guide}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
