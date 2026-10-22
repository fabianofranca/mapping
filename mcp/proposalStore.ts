import { randomBytes } from 'node:crypto';
import {
  link,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  PROPOSALS_DIR,
  PROPOSAL_FILE,
  PROPOSAL_ID_RE,
  parseProposalText,
  proposalDir,
  proposalFilePath,
  proposalImagePath,
  changeImageFile,
  packageDirOf,
  serializeProposal,
  type Proposal,
  type ProposalStatus,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, hasParentSegment, resolveProjectFile, writeFileAtomic } from './paths';
import type { ProjectLocation } from './projects';

// Propostas em disco (etapa 4.2): `proposals/<id>/proposal.json` e `proposals/<id>/images/…`.
// O servidor só grava aqui; o `mapping.json` é da sessão da app. O arquivo da proposta tem
// `revision` própria, com a mesma conferência do `mapping.json`: quem grava confere o que
// está no disco imediatamente antes e grava `revision + 1`.

/** `proposal.json` maior que isto é recusado, para não esgotar a memória. */
const MAX_PROPOSAL_BYTES = 64 * 1024 * 1024;
/** Tentativas de uma atualização quando o arquivo muda entre a leitura e a gravação. */
const MAX_ATTEMPTS = 3;

export interface StoredProposal {
  /** Nome da pasta (igual ao `proposal.id`). */
  readonly id: string;
  readonly proposal: Proposal;
  /** Texto do arquivo como estava no disco. */
  readonly text: string;
  /** Avisos da leitura (ex.: `inherit` de uma proposta antiga, ignorado). */
  readonly warnings?: readonly string[];
}

export interface BrokenProposal {
  readonly id: string;
  readonly error: string;
}

export interface StoredProposals {
  readonly proposals: readonly StoredProposal[];
  readonly broken: readonly BrokenProposal[];
}

async function readProposalText(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<{ real: string; text: string } | null> {
  const real = await resolveProjectFile(roots, location.dir, proposalFilePath(id));
  if (real === null) return null;
  if ((await stat(real)).size > MAX_PROPOSAL_BYTES) {
    throw new ToolError('file-too-large', `proposal.json grande demais: ${id}`);
  }
  return { real, text: await readFile(real, 'utf8') };
}

function parseStored(id: string, text: string): StoredProposal | BrokenProposal {
  const parsed = parseProposalText(text);
  if (!parsed.ok) {
    const shown = parsed.errors.slice(0, 5).join('; ');
    const more = parsed.errors.length - 5;
    return { id, error: more > 0 ? `${shown}; …(+${more} erro(s))` : shown };
  }
  if (parsed.proposal.id !== id) {
    return {
      id,
      error: `o id do arquivo ("${parsed.proposal.id}") não bate com o da pasta ("${id}")`,
    };
  }
  return {
    id,
    proposal: parsed.proposal,
    text,
    ...(parsed.warnings.length > 0 ? { warnings: parsed.warnings } : {}),
  };
}

/** Todas as propostas da pasta do projeto, na ordem de criação; as ilegíveis vêm em `broken`. */
export async function listStored(
  roots: Roots,
  location: ProjectLocation,
): Promise<StoredProposals> {
  let names: string[];
  try {
    const entries = await readdir(join(location.dir, PROPOSALS_DIR), {
      withFileTypes: true,
    });
    // `isDirectory()` é falso para links simbólicos: nunca são seguidos.
    names = entries
      .filter((entry) => entry.isDirectory() && PROPOSAL_ID_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { proposals: [], broken: [] };
  }
  const proposals: StoredProposal[] = [];
  const broken: BrokenProposal[] = [];
  for (const id of names) {
    const read = await readProposalText(roots, location, id);
    if (read === null) {
      broken.push({ id, error: `sem ${PROPOSAL_FILE}` });
      continue;
    }
    const stored = parseStored(id, read.text);
    if ('proposal' in stored) proposals.push(stored);
    else broken.push(stored);
  }
  proposals.sort((a, b) =>
    a.proposal.createdAt === b.proposal.createdAt
      ? a.id < b.id
        ? -1
        : 1
      : a.proposal.createdAt < b.proposal.createdAt
        ? -1
        : 1,
  );
  return { proposals, broken };
}

/**
 * Arquivos de `images/` que a proposta ainda reserva: os das mudanças de imagem (criação ou
 * troca do arquivo, `changeImageFile`) que ainda podem ser aplicadas. Numa `open`, as não
 * aplicadas e não rejeitadas; numa `superseded`, só as aceitas e não aplicadas (as pendentes
 * não podem mais ser decididas nem aplicadas: PROPOSAL-FORMAT.md, "Estados"); nas demais,
 * nenhuma. `status` é o estado a considerar: o `propose` passa `superseded` para a anterior de
 * um `supersedes`, que ainda está aberta no disco mas deixa de estar nesta chamada.
 */
export function reservedImages(p: Proposal, status: ProposalStatus = p.status): string[] {
  if (status !== 'open' && status !== 'superseded') return [];
  const files: string[] = [];
  for (const c of p.changes) {
    if (Object.hasOwn(p.applied, c.id)) continue;
    const state = p.decisions[c.id]?.state;
    if (status === 'open' ? state === 'rejected' : state !== 'accepted') continue;
    const file = changeImageFile(c);
    if (file !== null) files.push(file);
  }
  return files;
}

/**
 * Códigos com que `link` falha num sistema de arquivos sem hard link (exFAT de pendrive ou HD
 * externo, alguns compartilhamentos de rede e pastas sincronizadas).
 */
const NO_HARD_LINK: ReadonlySet<string> = new Set([
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'ENOSYS',
  'EXDEV',
]);

const errnoCode = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | null)?.code;

/**
 * Apaga o temporário em melhor esforço: numa pasta montada ou com antivírus (Windows), o
 * sistema pode recusar (`EPERM`, `EBUSY`) depois de o arquivo estar gravado. A limpeza nunca
 * decide o resultado: o erro vira um aviso no stderr e o temporário fica (ninguém o lê; pode
 * ser apagado à mão). Sem isso, o agente recebia `internal-error` com a proposta já gravada e
 * a reenviava, duplicando-a (devolução do portão, 0.3.4).
 */
async function removeTemp(temp: string): Promise<void> {
  try {
    await rm(temp, { force: true });
  } catch (error) {
    const code =
      errnoCode(error) ?? (error instanceof Error ? error.message : String(error));
    process.stderr.write(
      `mapping-mcp: aviso: não foi possível apagar o temporário ${temp} (${code}); ele pode ser apagado à mão\n`,
    );
  }
}

/**
 * Grava um arquivo novo sem nunca sobrescrever: temporário + `link` (falha com `EEXIST` se o
 * destino já existe). Sem hard link, grava direto com `wx`, que também falha se o destino
 * existe; perde só a atomicidade, e a pasta da proposta é removida inteira se algo falha. Nos
 * dois caminhos, o temporário é apagado no fim, em melhor esforço (`removeTemp`).
 */
async function writeNewFile(path: string, data: Uint8Array | string): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temp, data, { flag: 'wx' });
    try {
      await link(temp, path);
    } catch (error) {
      if (!NO_HARD_LINK.has(errnoCode(error) ?? '')) throw error;
      await writeFile(path, data, { flag: 'wx' });
    }
  } finally {
    await removeTemp(temp);
  }
}

/**
 * Caminho do arquivo de um pacote de biblioteca na pasta da proposta: o caminho definitivo
 * (`specs/<pasta>/<relativo>`) sob `proposals/<id>/`. Recusa o que não é de uma pasta de pacote
 * ou tenta sair dela.
 */
function packageFilePath(proposalId: string, file: string): string {
  if (
    packageDirOf(file) === null ||
    file.includes('\0') ||
    file.includes('\\') ||
    hasParentSegment(file)
  ) {
    throw new Error(`arquivo de pacote com caminho inválido: ${file}`);
  }
  return `${proposalDir(proposalId)}/${file}`;
}

/**
 * Grava uma proposta nova: a pasta `proposals/<id>/`, as imagens novas ou trocadas em
 * `proposals/<id>/images/`, os arquivos dos pacotes de biblioteca em
 * `proposals/<id>/specs/<pasta>/…` (a mesma regra das imagens: o caminho definitivo sob a
 * pasta da proposta) e, por último, o `proposal.json` (uma pasta sem ele nunca parece uma
 * proposta pronta). Nenhum arquivo é sobrescrito. Se algo falha, a pasta criada é removida.
 */
export async function writeNewProposal(
  roots: Roots,
  location: ProjectLocation,
  proposal: Proposal,
  images: ReadonlyMap<string, Uint8Array>,
  packageFiles: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<{ written: string[]; writtenPackage: string[] }> {
  const parent = join(location.dir, PROPOSALS_DIR);
  await mkdir(parent, { recursive: true });
  await roots.assertInside(await realpath(parent), PROPOSALS_DIR);
  const dir = join(location.dir, proposalDir(proposal.id));
  // Sem `recursive`: falha se a pasta já existe (o id é novo).
  await mkdir(dir);
  const written: string[] = [];
  const writtenPackage: string[] = [];
  const put = async (relative: string, data: Uint8Array, into: string[]) => {
    await mkdir(dirname(join(location.dir, relative)), { recursive: true });
    try {
      await writeNewFile(join(location.dir, relative), data);
    } catch (error) {
      if (errnoCode(error) !== 'EEXIST') throw error;
      throw new ToolError('image-exists', `já existe um arquivo em ${relative}`, {
        file: relative,
      });
    }
    into.push(relative);
  };
  try {
    await roots.assertInside(await realpath(dir), proposalDir(proposal.id));
    for (const [file, data] of images) {
      await put(proposalImagePath(proposal.id, file), data, written);
    }
    for (const [file, data] of packageFiles) {
      await put(packageFilePath(proposal.id, file), data, writtenPackage);
    }
    await writeNewFile(join(dir, PROPOSAL_FILE), serializeProposal(proposal));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { written, writtenPackage };
}

/**
 * Atualiza uma proposta existente (estado, decisões…): lê o arquivo, aplica `transform` e
 * grava com `revision + 1`, depois de conferir que o arquivo continua como foi lido (a app
 * ou outra pessoa pode estar decidindo ao mesmo tempo). Se mudou, relê e tenta de novo; sem
 * sucesso em `MAX_ATTEMPTS`, recusa com `revision-conflict`. `transform` que devolve a mesma
 * proposta não grava nada.
 */
export async function updateStored(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  transform: (p: Proposal) => Proposal,
): Promise<Proposal> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readProposalText(roots, location, id);
    if (read === null) {
      throw new ToolError('proposal-not-found', `proposta não encontrada: ${id}`);
    }
    const stored = parseStored(id, read.text);
    if (!('proposal' in stored)) {
      throw new ToolError('invalid-proposal', `proposta ilegível: ${stored.error}`, {
        proposal: id,
      });
    }
    const next = transform(stored.proposal);
    if (next === stored.proposal) return next;
    const updated: Proposal = { ...next, revision: stored.proposal.revision + 1 };
    // Confere de novo imediatamente antes de gravar.
    const again = await readProposalText(roots, location, id);
    if (again === null || again.text !== read.text) continue;
    await writeFileAtomic(read.real, serializeProposal(updated));
    return updated;
  }
  throw new ToolError(
    'revision-conflict',
    'a proposta foi alterada por outro processo enquanto era atualizada; releia e tente de novo',
    { proposal: id },
  );
}
