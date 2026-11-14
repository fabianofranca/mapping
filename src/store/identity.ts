import { signal, type ReadonlySignal } from '@preact/signals';
import { readSetting, writeSetting } from '../utils/safeStorage';

// The person's identity on this device (Comments stage, decision 10): name and email, through
// `safeStorage` (`mapping.identity`), never in the project. Without it the person only reads the
// threads:
// writing, resolving, reopening and deleting ask for name and email (decision 11). The email goes
// through a light check (`something@something`); the recommendation is to use the same ones as `git
// config`.

export interface Identity {
  readonly name: string;
  readonly email: string;
}

const IDENTITY_KEY = 'mapping.identity';

/** `something@something`, without spaces or a second `@`. */
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

/** This device's identity, or `null` (read-only in the threads). */
export const identity: ReadonlySignal<Identity | null> = current;

export type SetIdentityResult = 'ok' | 'invalid-name' | 'invalid-email';

/**
 * Keeps name and email (without surrounding spaces). Refuses an empty name and an email without
 * `something@something`.
 */
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
