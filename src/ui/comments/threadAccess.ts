import { t, type TranslationKey } from '../../i18n';
import { identity, type Identity } from '../../store/identity';
import { useEditor } from '../EditorContext';

// Who can write in the threads now (decisions 11, 12 and 13 of #1881): the copy must accept
// writing (it is not read-only) and the person must have an identity. Without an identity the
// thread can be read, but Send, Resolve, Reopen, Delete and New do not appear. During a proposal
// review replies, Resolve and Reopen stay (`can`); New, Comment and Delete need `canStart`.

export interface ThreadAccess {
  /** The copy accepts replies, Resolve and Reopen (not read-only; a review does not matter). */
  readonly writable: boolean;
  /** This person's identity; `null` = read-only. */
  readonly me: Identity | null;
  /** Can write: writable copy and with an identity. */
  readonly can: boolean;
  /** Can start or delete conversations (New, Comment, Delete): `can` and no proposal review open. */
  readonly canStart: boolean;
}

export function useThreadAccess(): ThreadAccess {
  const { store } = useEditor();
  const writable = !store.readOnly.value;
  const me = identity.value;
  const can = writable && me !== null;
  return { writable, me, can, canStart: can && !store.reviewing.value };
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
