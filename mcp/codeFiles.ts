import { realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { isWithin } from './paths';

// Conferência de arquivos de código (etapa 3b.4): o servidor só diz SE o arquivo existe.
//
// Regra (PLAN.md, decisão 7): o servidor NUNCA lê nem grava arquivo de código. Este é o único
// módulo do `mcp/` que toca o disco por caminho de código, e ele importa apenas `realpath` e
// `stat` (metadados). Um teste estático (tests/mcp/noCodeRead.test.ts) garante isso.
//
// Segurança: o `localPath` do projeto pode ter `..` (o repositório do app costuma ficar acima
// da pasta do projeto, e portanto acima das raízes) e o `path` vem de um arquivo que terceiros
// podem editar. Por isso a conferência fica confinada ao diretório de trabalho do cliente
// (`Roots.workDir`): o caminho resolvido, e o real depois de seguir links simbólicos, precisa
// estar dentro dele. O que escapa recebe `exists: null` (sem tocar no disco) ou `false`
// (link simbólico que sai), sem revelar nada sobre o que existe fora.

/** Onde o arquivo de uma entrada de `codeRef` está na máquina de quem roda o servidor. */
export interface LocalFile {
  /** Caminho relativo ao diretório de trabalho do cliente, com `/`; `null` se não dá para calcular. */
  readonly localFile: string | null;
  /** O arquivo existe? `null` = não conferido (sem `localPath`, ou o caminho sai do diretório de trabalho). */
  readonly exists: boolean | null;
  /** Presente quando o caminho calculado sai do diretório de trabalho do cliente. */
  readonly problem?: 'outside-workdir';
}

const UNKNOWN: LocalFile = { localFile: null, exists: null };

export class LocalFileChecker {
  private realWorkDir: Promise<string> | null = null;
  private readonly cache = new Map<string, Promise<LocalFile>>();

  constructor(private readonly workDir: string) {}

  private real(): Promise<string> {
    this.realWorkDir ??= realpath(this.workDir).catch(() => resolve(this.workDir));
    return this.realWorkDir;
  }

  /**
   * `relativeToProject` é `codeLocalPath(...)` (relativo à pasta do projeto) ou `null`.
   * `projectDir` é o caminho real da pasta do projeto.
   */
  check(projectDir: string, relativeToProject: string | null): Promise<LocalFile> {
    if (relativeToProject === null) return Promise.resolve(UNKNOWN);
    const absolute = resolve(projectDir, relativeToProject);
    let found = this.cache.get(absolute);
    if (!found) {
      found = this.inspect(absolute);
      this.cache.set(absolute, found);
    }
    return found;
  }

  private async inspect(absolute: string): Promise<LocalFile> {
    const workDir = await this.real();
    if (!isWithin(workDir, absolute)) {
      return { localFile: null, exists: null, problem: 'outside-workdir' };
    }
    const localFile = relative(workDir, absolute).split(sep).join('/');
    return { localFile, exists: await isFileInside(workDir, absolute) };
  }
}

/** Só metadados: `realpath` (segue links) e `stat`. Qualquer falha ou fuga vale `false`. */
async function isFileInside(workDir: string, absolute: string): Promise<boolean> {
  try {
    const real = await realpath(absolute);
    if (!isWithin(workDir, real)) return false;
    return (await stat(real)).isFile();
  } catch {
    return false;
  }
}
