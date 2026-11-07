import { signal, type ReadonlySignal } from '@preact/signals';
import { readSetting, writeSetting } from '../utils/safeStorage';

// Identidade da pessoa neste dispositivo (etapa Comentários, decisão 10): nome e e-mail, pelo
// `safeStorage` (`mapping.identity`), nunca no projeto. Sem ela a pessoa só lê as conversas:
// escrever, resolver, reabrir e apagar pedem nome e e-mail (decisão 11). O e-mail passa por uma
// conferência leve (`algo@algo`); a recomendação é usar os mesmos do `git config`.

export interface Identity {
  readonly name: string;
  readonly email: string;
}

const IDENTITY_KEY = 'mapping.identity';

/** `algo@algo`, sem espaços nem um segundo `@`. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email);
}

function parseIdentity(raw: string | null): Identity | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const name: unknown = Reflect.get(data, 'name');
  const email: unknown = Reflect.get(data, 'email');
  if (typeof name !== 'string' || typeof email !== 'string') return null;
  if (name.trim() === '' || !isValidEmail(email.trim())) return null;
  return { name: name.trim(), email: email.trim() };
}

const current = signal<Identity | null>(parseIdentity(readSetting(IDENTITY_KEY)));

/** A identidade deste dispositivo, ou `null` (só leitura nas conversas). */
export const identity: ReadonlySignal<Identity | null> = current;

export type SetIdentityResult = 'ok' | 'invalid-name' | 'invalid-email';

/** Guarda nome e e-mail (sem espaços em volta). Recusa nome vazio e e-mail sem `algo@algo`. */
export function setIdentity(name: string, email: string): SetIdentityResult {
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  if (cleanName === '') return 'invalid-name';
  if (!isValidEmail(cleanEmail)) return 'invalid-email';
  const next: Identity = { name: cleanName, email: cleanEmail };
  current.value = next;
  writeSetting(IDENTITY_KEY, JSON.stringify(next));
  return 'ok';
}

/** Esquece a identidade deste dispositivo. */
export function clearIdentity(): void {
  current.value = null;
  writeSetting(IDENTITY_KEY, '');
}
