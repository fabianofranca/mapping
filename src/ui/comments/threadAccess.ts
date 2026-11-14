import { t, type TranslationKey } from '../../i18n';
import { identity, type Identity } from '../../store/identity';
import { useEditor } from '../EditorContext';

// Who can write in the threads now (decisions 11, 26 and 27): the copy must accept writing
// (it is not read-only nor in proposal review) and the person must have an identity. Without
// an identity the thread can be read, but Send, Resolve, Reopen, Delete and New do not appear.

export interface ThreadAccess {
  /** The copy accepts writing (neither read-only nor in review). */
  readonly writable: boolean;
  /** This person's identity; `null` = read-only. */
  readonly me: Identity | null;
  /** Can write: writable copy and with an identity. */
  readonly can: boolean;
}

export function useThreadAccess(): ThreadAccess {
  const { store } = useEditor();
  const writable = !store.readOnly.value && !store.reviewing.value;
  const me = identity.value;
  return { writable, me, can: writable && me !== null };
}

const ERRORS: Readonly<Record<string, TranslationKey>> = {
  'no-identity': 'thread.error.no-identity',
  'read-only': 'thread.error.read-only',
  reviewing: 'thread.error.reviewing',
  'empty-message': 'thread.error.empty-message',
  'message-too-long': 'thread.error.message-too-long',
};

/** Error text of a thread action (`generic` for the codes without their own text). */
export function threadErrorText(code: string): string {
  return t(ERRORS[code] ?? 'thread.error.generic');
}
