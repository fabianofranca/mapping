import { realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { isWithin } from './paths';

// Code file check (stage 3b.4): the server only says WHETHER the file exists.
//
// Rule (docs/ARCHITECTURE.md, "mcp/"): the server NEVER reads or writes a code file. This is the only
// `mcp/` module that touches the disk by a code path, and it imports only `realpath` and
// `stat` (metadata). A static test (tests/mcp/noCodeRead.test.ts) guarantees this.
//
// Security: the project's `localPath` may have `..` (the app's repository usually sits above
// the project folder, and therefore above the roots) and the `path` comes from a file that third parties
// can edit. That is why the check stays confined to the client's working directory
// (`Roots.workDir`): the resolved path, and the real one after following symbolic links, must be
// inside it. Whatever escapes gets `exists: null` (without touching the disk) or `false`
// (a symbolic link that leaves), without revealing anything about what exists outside.

/** Where the file of a type's `path` is on the machine of whoever runs the server. */
export interface LocalFile {
  /** Path relative to the client's working directory, with `/`; `null` if it cannot be computed. */
  readonly localFile: string | null;
  /** Does the file exist? `null` = not checked (no `localPath`, or the path leaves the working directory). */
  readonly exists: boolean | null;
  /** Present when the computed path leaves the client's working directory. */
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
   * `relativeToProject` is `codeLocalPath(...)` (relative to the project folder) or `null`.
   * `projectDir` is the real path of the project folder.
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

/** Metadata only: `realpath` (follows links) and `stat`. Any failure or escape counts as `false`. */
async function isFileInside(workDir: string, absolute: string): Promise<boolean> {
  try {
    const real = await realpath(absolute);
    if (!isWithin(workDir, real)) return false;
    return (await stat(real)).isFile();
  } catch {
    return false;
  }
}
