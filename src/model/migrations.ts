import { SCHEMA_VERSION } from './types';

/** Converte um JSON da versão N para a versão N + 1. Recebe dados ainda não validados. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registro de migrações: a chave é a versão de origem.
 * Ao criar o schema v2, registre aqui `[1, migrarDe1Para2]`.
 */
export const migrations: ReadonlyMap<number, Migration> = new Map();

export type MigrationResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly missingFrom: number };

/** Aplica as migrações em sequência, de `from` até `target`. */
export function migrate(
  data: Record<string, unknown>,
  from: number,
  registry: ReadonlyMap<number, Migration> = migrations,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  let current = data;
  for (let version = from; version < target; version++) {
    const step = registry.get(version);
    if (!step) return { ok: false, missingFrom: version };
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return { ok: true, data: current };
}
