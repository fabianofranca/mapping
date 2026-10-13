// Resultado das ações da tela inicial (abrir, criar, importar, recentes): sucesso ou um código
// de erro que a `Home` mostra com `t('error.<code>')`. Módulo sem dependências da app, para o
// controller e `recents.ts` usarem sem ciclo de imports (fase 8.4).
import type {
  DeserializeError,
  InvariantIssue,
  RepairedLoad,
  RepairRecord,
} from '../model';
import { reportError } from '../utils/report';

/** Todo código tem `error.<code>` nos dicionários (`tests/i18n/dictionaries.test.ts`). */
export type AppErrorCode =
  | DeserializeError['code']
  | 'invalid-zip'
  | 'missing-mapping'
  | 'not-found'
  | 'storage-failed';

export type AppResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: AppErrorCode;
      /** Em `invariant-violation`: a lista exata dos problemas e o reparo, se houver. */
      readonly inconsistent?: InconsistentProject;
    };

/** Projeto recusado por dados inconsistentes (docs/FORMAT.md, "Arquivos inconsistentes"). */
export interface InconsistentProject {
  readonly issues: readonly InvariantIssue[];
  /** O que "Reparar e abrir" faria. */
  readonly repaired: readonly RepairRecord[];
  /** Problemas sem reparo mecânico. */
  readonly unrepaired: readonly InvariantIssue[];
  /**
   * "Reparar e abrir": abre o projeto reparado; o backup do original e o reparado só são
   * gravados na primeira gravação. `null` quando há problema sem reparo.
   */
  readonly repair: (() => Promise<AppResult>) | null;
}

export const ok = <T>(value: T): AppResult<T> => ({ ok: true, value });
export const err = (error: AppErrorCode): AppResult<never> => ({ ok: false, error });

/** Uma exceção vira `storage-failed`, com a causa no Diagnóstico. */
export async function guarded<T>(
  action: () => Promise<AppResult<T>>,
): Promise<AppResult<T>> {
  try {
    return await action();
  } catch (e) {
    reportError('storage', e);
    return err('storage-failed');
  }
}

/** Recusa por dados inconsistentes, com o "Reparar e abrir" quando tudo tem reparo. */
export function inconsistentResult(
  issues: readonly InvariantIssue[],
  repair: RepairedLoad,
  open: () => Promise<AppResult>,
): AppResult<never> {
  return {
    ok: false,
    error: 'invariant-violation',
    inconsistent: {
      issues,
      repaired: repair.repaired,
      unrepaired: repair.unrepaired,
      repair: repair.unrepaired.length === 0 ? () => guarded(open) : null,
    },
  };
}
