import {
  deserialize,
  migrations,
  referencedSpecFiles,
  type DeserializeError,
  type InvariantIssue,
  type Project,
  type RepairedLoad,
} from '../model';
import { reportError } from '../utils/report';
import type { ProjectStorage } from './types';

export type LoadProjectResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** Versão mais nova que a da app: abre só para leitura. */
      readonly readOnly: boolean;
      /** Versão de origem, se o arquivo foi migrado. */
      readonly migratedFrom: number | null;
      /** O `mapping.json` como estava no armazenamento. */
      readonly text: string;
    }
  | {
      readonly ok: false;
      readonly error: DeserializeError['code'] | 'not-found';
      /** Em `invariant-violation`: a lista de problemas e o reparo possível. */
      readonly inconsistent?: InconsistentLoad;
    };

/** `mapping.json` com dados inconsistentes, como lido (nada foi gravado). */
export interface InconsistentLoad {
  readonly issues: readonly InvariantIssue[];
  readonly repair: RepairedLoad;
  /** O `mapping.json` original: vai para `backups/` se o reparo for aceito. */
  readonly text: string;
}

/**
 * Lê o `mapping.json` e as cópias de `specs/` que ele cita e valida tudo. Usado ao
 * abrir um projeto e ao recarregá-lo depois de uma alteração externa.
 */
export async function loadProject(storage: ProjectStorage): Promise<LoadProjectResult> {
  const text = await storage.loadMapping();
  if (text === null) return { ok: false, error: 'not-found' };
  const specs = new Map<string, string>();
  for (const file of referencedSpecFiles(text)) {
    const spec = await storage.readSpec(file).catch((e: unknown) => {
      reportError('open.readSpec', e);
      return null;
    });
    if (spec !== null) specs.set(file, spec);
  }
  const result = deserialize(text, migrations, specs);
  if (!result.ok) {
    const { error, repair } = result;
    if (error.code === 'invariant-violation' && repair) {
      return {
        ok: false,
        error: error.code,
        inconsistent: { issues: error.issues, repair, text },
      };
    }
    return { ok: false, error: error.code };
  }
  return {
    ok: true,
    project: result.project,
    readOnly: result.readOnly,
    migratedFrom: result.migratedFrom,
    text,
  };
}
