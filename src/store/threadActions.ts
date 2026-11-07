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

// Ações das conversas (etapa Comentários): abrir, acrescentar, resolver, reabrir e apagar. São as
// únicas que mudam uma conversa na app; a gravação é de `ThreadStore`. Cada uma recusa sem
// escrever quando o projeto é só leitura, quando há uma revisão de proposta aberta (decisão 26)
// ou quando falta a identidade (decisão 11). `kind` nunca vem do chamador: a app só monta o
// autor `human`, com o nome e o e-mail das Configurações (decisão 12; catraca em
// `tests/tooling/threadAuthors.test.ts`). Nada disso passa pelo histórico de desfazer nem pelo
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
  /** Abre uma conversa ancorada em `anchor` com a primeira mensagem da pessoa. */
  open(anchor: ThreadAnchor, text: string): Promise<ThreadActionResult>;
  /** Acrescenta uma mensagem da pessoa. */
  post(threadId: string, text: string): Promise<ThreadActionResult>;
  /** Resolve a conversa (o arquivo vai para `comments/resolved/`). */
  resolve(threadId: string): Promise<ThreadActionResult>;
  /** Reabre a conversa (o arquivo volta para `comments/`). */
  reopen(threadId: string): Promise<ThreadActionResult>;
  /** Apaga a conversa. A confirmação com o aviso de quem perde mensagem é da interface. */
  remove(threadId: string): Promise<ThreadRemoveResult>;
  /** Apaga várias (o lote: só as resolvidas, ou as anteriores a uma data). */
  removeMany(threadIds: readonly string[]): Promise<ThreadRemoveManyResult>;
}

export interface ThreadActionsDeps {
  readonly store: ProjectStore;
  readonly threads: ThreadStore;
  readonly identity: ReadonlySignal<Identity | null>;
  readonly now: () => string;
  readonly newId: () => string;
  /** A cópia do projeto (`ProjectStorage.copyId`): onde o "lida" de uma conversa apagada sai. */
  readonly copyId?: string;
}

export function createThreadActions(deps: ThreadActionsDeps): ThreadActions {
  const { store, threads, now, newId } = deps;

  /** Quem pode escrever agora, ou o motivo de não poder. */
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

  /** O texto da mensagem já limpo, ou o motivo de recusar. */
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
