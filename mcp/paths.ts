import { randomBytes } from 'node:crypto';
import { realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { ToolError } from './errors';

// Segurança de caminhos: o servidor só lê e grava dentro das raízes configuradas.
// Rejeita `..`, caminhos absolutos fora das raízes e links simbólicos que levam para fora.

/** `child` é `parent` ou está dentro dele (comparação léxica de caminhos absolutos). */
export function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Algum segmento é `..`. Barras invertidas contam como separador (Windows). */
export function hasParentSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment === '..');
}

function isNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Caminho como o usuário digitou, validado só na forma (sem tocar no disco). */
function assertPlainPath(input: string): void {
  if (input === '' || input.includes('\0')) {
    throw new ToolError('invalid-path', 'caminho vazio ou inválido');
  }
  if (hasParentSegment(input)) {
    throw new ToolError('outside-roots', `caminho com ".." recusado: ${input}`, {
      path: input,
    });
  }
}

/** Um caminho real (sem links simbólicos) dentro de uma das raízes. */
export interface InsideRoot {
  /** Caminho real do que foi pedido. */
  readonly real: string;
  /** Raiz como configurada (absoluta). */
  readonly root: string;
  /** Caminho real da raiz. */
  readonly realRoot: string;
}

export class Roots {
  /**
   * `roots` já resolvidas (absolutas). `workDir` é o diretório de trabalho do cliente (o do
   * processo do servidor): os caminhos relativos das raízes valem a partir dele, e é o limite
   * da conferência de arquivos de código (`codeFiles.ts`).
   */
  constructor(
    readonly roots: readonly string[],
    readonly workDir: string = process.cwd(),
  ) {}

  /** Caminho real de cada raiz; `null` para a que não existe (ela pode ser criada depois da partida). */
  realRoots(): Promise<readonly (string | null)[]> {
    return Promise.all(this.roots.map((root) => realpath(root).catch(() => null)));
  }

  /** O caminho real está dentro de alguma raiz? Devolve qual. */
  async locate(real: string): Promise<InsideRoot | null> {
    const reals = await this.realRoots();
    for (const [index, realRoot] of reals.entries()) {
      if (realRoot !== null && isWithin(realRoot, real)) {
        return { real, root: this.roots[index]!, realRoot };
      }
    }
    return null;
  }

  /** Falha com `outside-roots` se o caminho real não estiver dentro de uma raiz. */
  async assertInside(real: string, shown: string = real): Promise<InsideRoot> {
    const found = await this.locate(real);
    if (!found) {
      throw new ToolError(
        'outside-roots',
        `o caminho aponta para fora das raízes configuradas: ${shown}`,
        { path: shown },
      );
    }
    return found;
  }

  /**
   * Resolve um caminho existente informado pelo agente: relativo a uma raiz ou absoluto
   * dentro de uma. Recusa `..`, absolutos fora das raízes e links simbólicos que saem delas.
   */
  async resolveExisting(input: string): Promise<InsideRoot> {
    assertPlainPath(input);
    const candidates = await this.candidates(input);
    let leftRoots = false;
    for (const candidate of candidates) {
      let real: string;
      try {
        real = await realpath(candidate);
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      const found = await this.locate(real);
      if (found) return found;
      leftRoots = true;
    }
    if (leftRoots) {
      throw new ToolError(
        'outside-roots',
        `o caminho aponta para fora das raízes configuradas: ${input}`,
        { path: input },
      );
    }
    throw new ToolError('path-not-found', `caminho não encontrado: ${input}`, {
      path: input,
    });
  }

  /**
   * Resolve um caminho que ainda pode não existir (criação): o caminho léxico precisa estar
   * dentro de uma raiz e o ancestral existente mais próximo não pode sair dela por link simbólico.
   * Devolve o caminho absoluto a criar.
   */
  async resolveNew(input: string, rootHint?: string): Promise<string> {
    assertPlainPath(input);
    const target = await this.newTarget(input, rootHint);
    let existing = target;
    for (;;) {
      try {
        const real = await realpath(existing);
        await this.assertInside(real, input);
        return target;
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const parent = dirname(existing);
        if (parent === existing) {
          throw new ToolError('outside-roots', `caminho fora das raízes: ${input}`, {
            path: input,
          });
        }
        existing = parent;
      }
    }
  }

  private async candidates(input: string): Promise<string[]> {
    if (isAbsolute(input)) {
      const reals = (await this.realRoots()).filter((r): r is string => r !== null);
      const inside = [...this.roots, ...reals].some((root) => isWithin(root, input));
      if (!inside) {
        throw new ToolError(
          'outside-roots',
          `caminho absoluto fora das raízes configuradas: ${input}`,
          { path: input },
        );
      }
      return [input];
    }
    return this.roots.map((root) => join(root, input));
  }

  private async newTarget(input: string, rootHint?: string): Promise<string> {
    if (isAbsolute(input)) {
      const [candidate] = await this.candidates(input);
      return candidate!;
    }
    if (rootHint !== undefined) {
      const root = await this.resolveRoot(rootHint);
      return join(root, input);
    }
    if (this.roots.length === 1) return join(this.roots[0]!, input);
    throw new ToolError(
      'root-required',
      'há mais de uma raiz: informe `root` ou um caminho absoluto dentro de uma delas',
      { roots: this.roots },
    );
  }

  /** `root` informado pelo agente: o caminho de uma das raízes (como listado) ou o seu nome. */
  private async resolveRoot(hint: string): Promise<string> {
    const reals = await this.realRoots();
    for (const [index, root] of this.roots.entries()) {
      if (root === hint || reals[index] === hint || basename(root) === hint) return root;
    }
    throw new ToolError('unknown-root', `raiz desconhecida: ${hint}`, {
      roots: this.roots,
    });
  }
}

/**
 * Caminho de um arquivo citado dentro do projeto (`images/foto.png`, `specs/sdui.json`):
 * relativo, sem `..`, sem barra invertida e, depois de resolvidos os links simbólicos,
 * dentro das raízes. `null` se o caminho for inválido ou o arquivo não existir.
 */
export async function resolveProjectFile(
  roots: Roots,
  projectDir: string,
  file: string,
): Promise<string | null> {
  if (file === '' || file.includes('\0') || file.includes('\\') || isAbsolute(file)) {
    return null;
  }
  if (hasParentSegment(file)) return null;
  try {
    const real = await realpath(join(projectDir, file));
    return (await roots.locate(real)) ? real : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Grava de forma atômica: arquivo temporário na mesma pasta e renomear por cima. */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temp, data, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
