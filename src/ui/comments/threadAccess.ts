import { t, type TranslationKey } from '../../i18n';
import { identity, type Identity } from '../../store/identity';
import { useEditor } from '../EditorContext';

// Quem pode escrever nas conversas agora (decisões 11, 26 e 27): a cópia precisa aceitar escrita
// (não é só leitura nem está em revisão de proposta) e a pessoa precisa ter identidade. Sem
// identidade a conversa se lê, mas Enviar, Resolver, Reabrir, Apagar e Nova não aparecem.

export interface ThreadAccess {
  /** A cópia aceita escrita (nem somente leitura nem em revisão). */
  readonly writable: boolean;
  /** A identidade desta pessoa; `null` = só leitura. */
  readonly me: Identity | null;
  /** Pode escrever: cópia gravável e com identidade. */
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

/** Texto de erro de uma ação de conversa (`generic` para os códigos sem texto próprio). */
export function threadErrorText(code: string): string {
  return t(ERRORS[code] ?? 'thread.error.generic');
}
