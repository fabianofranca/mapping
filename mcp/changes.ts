import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { basename, dirname, isAbsolute, join } from 'node:path';
import {
  BACKUPS_DIR,
  SPECS_DIR,
  backupFileName,
  readRevision,
  serialize,
  specFiles,
  touchProject,
  type ItemKind,
  type Project,
} from '../src/model';
import {
  changeCounts,
  issueChanges,
  runBatch,
  type BatchIo,
  type BatchResult,
} from './batch';
import { ToolError } from './errors';
import { Refs } from './items';
import type { Operation } from './operations';
import { Roots, resolveProjectFile, writeFileAtomic } from './paths';
import {
  MAPPING_FILE,
  findProject,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';

// Escrita em lote com prévia (etapa 3a.5): `plan_changes` valida tudo e guarda o resultado em
// memória; `apply_changes` grava de uma vez, se o `mapping.json` ainda for o mesmo do plano.

/** Validade de um plano. */
export const PLAN_TTL_MS = 10 * 60 * 1000;
/** Planos guardados ao mesmo tempo (os mais antigos saem primeiro): limita a memória. */
const MAX_PLANS = 20;
/** Imagem ou especialização lida pelo lote maior que isto é recusada. */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const IMAGES_DIR = 'images';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

interface Plan {
  readonly id: string;
  readonly location: ProjectLocation;
  /** Hash do `mapping.json` lido: qualquer mudança no arquivo invalida o plano. */
  readonly baseHash: string;
  readonly baseText: string;
  readonly baseRevision: number;
  readonly migratedFrom: number | null;
  readonly result: BatchResult;
  readonly expiresAt: number;
}

/** Lê o `mapping.json` como está no disco (para a conferência antes de gravar). */
async function readMapping(roots: Roots, dir: string): Promise<string | null> {
  const real = await resolveProjectFile(roots, dir, MAPPING_FILE);
  return real === null ? null : readFile(real, 'utf8');
}

/** Lê um arquivo citado numa operação: relativo à pasta do projeto, a uma raiz, ou absoluto. */
async function readSource(
  roots: Roots,
  projectDir: string,
  path: string,
): Promise<{ bytes: Uint8Array; name: string }> {
  let real: string | null = null;
  if (!isAbsolute(path)) real = await resolveProjectFile(roots, projectDir, path);
  if (real === null) real = (await roots.resolveExisting(path)).real;
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `não é um arquivo: ${path}`, { path });
  }
  if (info.size > MAX_SOURCE_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${path}`, { path });
  }
  return { bytes: new Uint8Array(await readFile(real)), name: basename(real) };
}

async function takenImageFiles(dir: string): Promise<Set<string>> {
  try {
    const names = await readdir(join(dir, IMAGES_DIR));
    return new Set(names.map((name) => `${IMAGES_DIR}/${name}`));
  } catch {
    return new Set();
  }
}

function conflictError(plan: Plan, text: string | null): ToolError {
  return new ToolError(
    'revision-conflict',
    'o projeto foi alterado por outro processo; releia e gere um novo plano',
    {
      planRevision: plan.baseRevision,
      ...(text !== null ? { diskRevision: readRevision(text) } : { missing: true }),
    },
  );
}

/** Grava um arquivo novo sem sobrescrever: temporário + `link` (falha se o destino já existe). */
async function writeNewFile(path: string, data: Uint8Array): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temp, data, { flag: 'wx' });
    await link(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

/** Referências dos itens criados, com o apelido de cada um. */
function createdRefs(refs: Refs, result: BatchResult): Record<string, unknown>[] {
  const project = refs.project;
  const exists = {
    layer: (id: string) => project.layers.some((l) => l.id === id),
    i: (id: string) => project.images.some((i) => i.id === id),
    m: (id: string) => project.markings.some((m) => m.id === id),
    a: (id: string) => project.annotations.some((a) => a.id === id),
  };
  return result.created
    .filter((item) => exists[item.kind](item.id))
    .map((item) => {
      const base = { op: item.index, ...(item.alias ? { alias: item.alias } : {}) };
      if (item.kind === 'layer') {
        const layer = project.layers.find((l) => l.id === item.id)!;
        return { ...base, kind: 'layer', id: layer.id, name: layer.name };
      }
      const kind = item.kind as ItemKind;
      return {
        ...base,
        kind: { m: 'marking', i: 'image', a: 'annotation' }[kind],
        ref: refs.ref(kind, item.id),
      };
    });
}

export class ChangePlans {
  private readonly plans = new Map<string, Plan>();

  constructor(
    private readonly roots: Roots,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(): void {
    const now = this.now();
    for (const [id, plan] of this.plans) if (plan.expiresAt <= now) this.plans.delete(id);
    while (this.plans.size > MAX_PLANS) {
      this.plans.delete(this.plans.keys().next().value!);
    }
  }

  /** Valida o lote (sem gravar nada) e, se tudo estiver certo, guarda o plano. */
  async plan(
    projectQuery: string,
    operations: readonly Operation[],
  ): Promise<Record<string, unknown>> {
    this.prune();
    const location = await findProject(this.roots, projectQuery);
    const baseText = await readMapping(this.roots, location.dir);
    if (baseText === null) {
      throw new ToolError('invalid-project', `não foi possível ler ${MAPPING_FILE}`);
    }
    const loaded: LoadedProject = await loadProject(this.roots, location);
    if (loaded.readOnly) {
      throw new ToolError(
        'read-only',
        'o mapping.json é de uma versão mais nova do que este servidor entende: atualize o mapping-mcp.js',
      );
    }
    const io: BatchIo = {
      readSource: (path) => readSource(this.roots, location.dir, path),
      takenImageFiles: await takenImageFiles(location.dir),
      now: () => new Date(this.now()),
    };
    const result = await runBatch(loaded, operations, io);
    const refs = new Refs({ ...loaded, project: result.project });
    const valid = result.errors.length === 0 && result.invariantIssues.length === 0;
    const response: Record<string, unknown> = {
      valid,
      project: { name: location.name, path: location.path },
      revision: loaded.project.revision,
      operations: operations.length,
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
      ...(result.invariantIssues.length > 0
        ? { invariantIssues: result.invariantIssues }
        : {}),
      summary: result.steps.map((s) => `${s.index}. ${s.description}`),
      changes: changeCounts(result.before, result.project),
      issues: issueChanges(refs, result.before),
      created: createdRefs(refs, result),
    };
    if (!valid) {
      return {
        ...response,
        hint: 'nada foi guardado: corrija as operações com erro e chame plan_changes de novo com o lote inteiro',
      };
    }
    const plan: Plan = {
      id: randomUUID(),
      location,
      baseHash: sha256(baseText),
      baseText,
      baseRevision: loaded.project.revision,
      migratedFrom: loaded.migratedFrom,
      result,
      expiresAt: this.now() + PLAN_TTL_MS,
    };
    this.plans.set(plan.id, plan);
    this.prune();
    return {
      ...response,
      planId: plan.id,
      expiresAt: new Date(plan.expiresAt).toISOString(),
      hint: 'confira o resumo e chame apply_changes com o planId para gravar',
    };
  }

  /** Grava o plano: imagens e `specs/` novos, o `mapping.json` (revision + 1) e só então remove o que saiu. */
  async apply(planId: string): Promise<Record<string, unknown>> {
    this.prune();
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new ToolError(
        'plan-not-found',
        'plano inexistente, já aplicado ou expirado (vale 10 min): gere outro com plan_changes',
        { planId },
      );
    }
    // Um plano só pode ser aplicado uma vez, dê certo ou não.
    this.plans.delete(planId);
    const { location, result } = plan;
    const dir = location.dir;
    const assertUnchanged = async () => {
      const text = await readMapping(this.roots, dir);
      if (text === null || sha256(text) !== plan.baseHash)
        throw conflictError(plan, text);
    };
    await assertUnchanged();

    const before = result.before;
    const after: Project = {
      ...touchProject(result.project, new Date(this.now()).toISOString()),
      revision: plan.baseRevision + 1,
    };
    const referenced = new Set(after.images.map((i) => i.file));
    const written: string[] = [];
    try {
      if (plan.migratedFrom !== null) {
        // Como a app: o original pré-migração é guardado antes de ser sobrescrito.
        await mkdir(join(dir, BACKUPS_DIR), { recursive: true });
        const name = backupFileName(plan.migratedFrom, new Date(this.now()));
        await writeNewFile(join(dir, BACKUPS_DIR, name), Buffer.from(plan.baseText));
      }
      const newImages = [...result.imageFiles].filter(([file]) => referenced.has(file));
      if (newImages.length > 0) {
        await mkdir(join(dir, IMAGES_DIR), { recursive: true });
        await this.roots.assertInside(await realpath(join(dir, IMAGES_DIR)), IMAGES_DIR);
      }
      for (const [file, data] of newImages) {
        await writeNewFile(join(dir, file), data);
        written.push(file);
      }
      const oldSpecs = specFiles(before);
      const newSpecs = specFiles(after);
      for (const [file, text] of newSpecs) {
        if (oldSpecs.get(file) === text) continue;
        await mkdir(join(dir, SPECS_DIR), { recursive: true });
        await this.roots.assertInside(await realpath(join(dir, SPECS_DIR)), SPECS_DIR);
        await writeFileAtomic(join(dir, file), text);
      }
      // As gravações acima levam tempo: confere de novo antes de sobrescrever o arquivo.
      await assertUnchanged();
      await writeFileAtomic(join(dir, MAPPING_FILE), serialize(after));
    } catch (error) {
      // Nada foi gravado no mapping.json: as imagens novas não ficam órfãs.
      for (const file of written) await rm(join(dir, file), { force: true });
      throw error;
    }

    // Só depois do mapping.json: remove os arquivos que ninguém mais cita.
    const removed: string[] = [];
    const leftovers = [
      ...before.images.map((i) => i.file).filter((file) => !referenced.has(file)),
      ...before.specializations
        .map((s) => s.file)
        .filter((file) => !after.specializations.some((s) => s.file === file)),
    ];
    for (const file of new Set(leftovers)) {
      const real = await resolveProjectFile(this.roots, dir, file);
      if (real === null) continue;
      try {
        await rm(real);
        removed.push(file);
      } catch {
        // Não remover um arquivo que sobrou não desfaz a gravação: só fica para trás.
      }
    }

    const refs = new Refs({
      location,
      project: after,
      readOnly: false,
      migratedFrom: null,
      specWarnings: [],
    });
    return {
      applied: true,
      project: { name: location.name, path: location.path },
      revision: after.revision,
      ...(plan.migratedFrom !== null ? { migratedFrom: plan.migratedFrom } : {}),
      changes: changeCounts(before, after),
      created: createdRefs(refs, result),
      files: { written, removed },
    };
  }
}
