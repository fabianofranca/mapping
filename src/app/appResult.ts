// Result of the home screen actions (open, create, import, recents): success or an error code
// that `Home` shows with `t('error.<code>')`. Module with no app dependencies, so the
// controller and `recents.ts` can use it without an import cycle (phase 8.4).
import type {
  DeserializeError,
  InvariantIssue,
  RepairedLoad,
  RepairRecord,
} from '../model';
import { reportError } from '../utils/report';

/** Every code has `error.<code>` in the dictionaries (`tests/i18n/dictionaries.test.ts`). */
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
      /** On `invariant-violation`: the exact list of problems and the repair, if any. */
      readonly inconsistent?: InconsistentProject;
    };

/** Project refused for inconsistent data (docs/FORMAT.md, "Inconsistent files"). */
export interface InconsistentProject {
  readonly issues: readonly InvariantIssue[];
  /** What "Repair and open" would do. */
  readonly repaired: readonly RepairRecord[];
  /** Problems with no mechanical repair. */
  readonly unrepaired: readonly InvariantIssue[];
  /**
   * "Repair and open": opens the repaired project; the backup of the original and the repaired
   * one are only written on the first save. `null` when there is a problem with no repair.
   */
  readonly repair: (() => Promise<AppResult>) | null;
}

export const ok = <T>(value: T): AppResult<T> => ({ ok: true, value });
export const err = (error: AppErrorCode): AppResult<never> => ({ ok: false, error });

/** An exception becomes `storage-failed`, with the cause in the Diagnostics. */
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

/** Refusal for inconsistent data, with "Repair and open" when everything has a repair. */
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
