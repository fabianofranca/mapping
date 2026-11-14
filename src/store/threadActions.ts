import type { ReadonlySignal } from '@preact/signals';
import {
  THREAD_MESSAGE_MAX,
  ThreadError,
  appendMessage,
  openThread,
  reopenThread,
  resolveThread,
  type Thread,
  type ThreadAnchor,
  type ThreadAuthor,
} from '../model';
import type { ProjectStore } from './history';
import type { Identity } from './identity';
import { forgetThreadRead } from './threadReads';
import type { ThreadStore, ThreadStoreError } from './threads';

// Thread actions (Comments stage): open, append, resolve, reopen and delete. They are the
// only ones that change a thread in the app; writing belongs to `ThreadStore`. Each one refuses without
// writing when the project is read-only, when a proposal review is open (decision 26)
// or when the identity is missing (decision 11). `kind` never comes from the caller: the app only builds the
// `human` author, with the name and e-mail from Settings (decision 12; ratchet in
// `tests/tooling/threadAuthors.test.ts`). None of this goes through the undo history nor
// `mapping.json`.

export type ThreadActionError =
  | 'no-identity'
  | 'read-only'
  | 'reviewing'
  | 'empty-message'
  | 'message-too-long'
  | ThreadStoreError;

export type ThreadActionResult =
  | { readonly ok: true; readonly thread: Thread }
  | { readonly ok: false; readonly error: ThreadActionError };

export type ThreadRemoveResult =
  { readonly ok: true } | { readonly ok: false; readonly error: ThreadActionError };

export type ThreadRemoveManyResult =
  | {
      readonly ok: true;
      readonly removed: readonly string[];
      readonly failed: readonly string[];
    }
  | { readonly ok: false; readonly error: ThreadActionError };

export interface ThreadActions {
  /** Opens a thread anchored at `anchor` with the person's first message. */
  open(anchor: ThreadAnchor, text: string): Promise<ThreadActionResult>;
  /** Appends a message from the person. */
  post(threadId: string, text: string): Promise<ThreadActionResult>;
  /** Resolves the thread (the file goes to `comments/resolved/`). */
  resolve(threadId: string): Promise<ThreadActionResult>;
  /** Reopens the thread (the file goes back to `comments/`). */
  reopen(threadId: string): Promise<ThreadActionResult>;
  /** Deletes the thread. The confirmation warning about who loses a message belongs to the interface. */
  remove(threadId: string): Promise<ThreadRemoveResult>;
  /** Deletes several (the batch: only the resolved ones, or those before a date). */
  removeMany(threadIds: readonly string[]): Promise<ThreadRemoveManyResult>;
}

export interface ThreadActionsDeps {
  readonly store: ProjectStore;
  readonly threads: ThreadStore;
  readonly identity: ReadonlySignal<Identity | null>;
  readonly now: () => string;
  readonly newId: () => string;
  /** The project copy (`ProjectStorage.copyId`): where the "read" mark of a deleted thread goes away. */
  readonly copyId?: string;
}

export function createThreadActions(deps: ThreadActionsDeps): ThreadActions {
  const { store, threads, now, newId } = deps;

  /** Who can write now, or the reason for not being able to. */
  const writer = ():
    { ok: true; me: Identity } | { ok: false; error: ThreadActionError } => {
    if (store.readOnly.value) return { ok: false, error: 'read-only' };
    if (store.reviewing.value) return { ok: false, error: 'reviewing' };
    const me = deps.identity.value;
    return me === null ? { ok: false, error: 'no-identity' } : { ok: true, me };
  };

  const authorOf = (me: Identity): ThreadAuthor => ({
    kind: 'human',
    name: me.name,
    email: me.email,
  });

  /** The message text already cleaned, or the reason for refusing. */
  const cleanText = (
    text: string,
  ): { ok: true; text: string } | { ok: false; error: ThreadActionError } => {
    const clean = text.trim();
    if (clean === '') return { ok: false, error: 'empty-message' };
    if (clean.length > THREAD_MESSAGE_MAX)
      return { ok: false, error: 'message-too-long' };
    return { ok: true, text: clean };
  };

  const forget = (id: string) => {
    if (deps.copyId !== undefined) forgetThreadRead(deps.copyId, id);
  };

  return {
    async open(anchor, text) {
      const who = writer();
      if (!who.ok) return who;
      const clean = cleanText(text);
      if (!clean.ok) return clean;
      let thread: Thread;
      try {
        thread = openThread({
          id: newId(),
          anchor,
          author: authorOf(who.me),
          text: clean.text,
          at: now(),
          messageId: newId(),
        });
      } catch (e) {
        if (e instanceof ThreadError) return { ok: false, error: 'invalid' };
        throw e;
      }
      return threads.create(thread);
    },

    async post(threadId, text) {
      const who = writer();
      if (!who.ok) return who;
      const clean = cleanText(text);
      if (!clean.ok) return clean;
      const message = {
        id: newId(),
        author: authorOf(who.me),
        at: now(),
        text: clean.text,
        proposal: null,
      };
      return threads.mutate(threadId, (t) => appendMessage(t, message));
    },

    async resolve(threadId) {
      const who = writer();
      if (!who.ok) return who;
      const by = { name: who.me.name, email: who.me.email };
      const at = now();
      return threads.mutate(threadId, (t) => resolveThread(t, by, at));
    },

    async reopen(threadId) {
      const who = writer();
      if (!who.ok) return who;
      return threads.mutate(threadId, reopenThread);
    },

    async remove(threadId) {
      const who = writer();
      if (!who.ok) return who;
      const result = await threads.remove(threadId);
      if (result.ok) forget(threadId);
      return result;
    },

    async removeMany(threadIds) {
      const who = writer();
      if (!who.ok) return who;
      const result = await threads.removeMany(threadIds);
      for (const id of result.removed) forget(id);
      return { ok: true, ...result };
    },
  };
}
