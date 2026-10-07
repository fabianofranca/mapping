import {
  deserialize,
  migrations,
  referencedSpecFiles,
  type DeserializeError,
  type Project,
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
  | { readonly ok: false; readonly error: DeserializeError['code'] | 'not-found' };

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
  if (!result.ok) return { ok: false, error: result.error.code };
  return {
    ok: true,
    project: result.project,
    readOnly: result.readOnly,
    migratedFrom: result.migratedFrom,
    text,
  };
}
