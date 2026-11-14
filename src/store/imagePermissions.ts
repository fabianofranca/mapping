import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { checkRemoteImageUrl, type RemoteImageRejection } from '../model/remoteImages';
import {
  loadAllowedOrigins,
  loadImageSwitches,
  saveAllowedOrigins,
  saveImageSwitch,
  type ImageSwitchName,
} from '../storage/imagePermissions';

// Consent for remote images (RI3). Per-browser state, read from `localStorage` on
// load; the actions write. "Not now" only applies to the session (memory).

/** Result of the app's two gates (URL policy and consent) for a URL. */
export type RemoteImageGate =
  | { readonly allowed: true; readonly url: string; readonly origin: string }
  | {
      readonly allowed: false;
      readonly state: 'invalid';
      readonly reason: RemoteImageRejection;
    }
  | {
      readonly allowed: false;
      readonly state: 'blocked-consent';
      readonly origin: string;
    };

const initialSwitches = loadImageSwitches();

const origins = signal<readonly string[]>(loadAllowedOrigins());
const anyOrigin = signal(initialSwitches.allowAnyOrigin);
const http = signal(initialSwitches.allowHttp);
const localNetwork = signal(initialSwitches.allowLocalNetwork);
const noCors = signal(initialSwitches.allowNoCors);
const dismissed = signal<ReadonlySet<string>>(new Set());

/** Origens permitidas neste navegador. */
export const allowedOrigins: ReadonlySignal<readonly string[]> = origins;
/** "Allow images from any origin" (does not apply to the local network). */
export const allowAnyOrigin: ReadonlySignal<boolean> = anyOrigin;
/** "Permitir imagens sem criptografia (http)". */
export const allowHttp: ReadonlySignal<boolean> = http;
/** "Permitir imagens da rede local". */
export const allowLocalNetwork: ReadonlySignal<boolean> = localNetwork;
/** "Show images from servers without CORS" switch (decision 17). */
export const allowNoCors: ReadonlySignal<boolean> = noCors;
/** Origins the person dismissed with "Not now" in this session. */
export const dismissedOrigins: ReadonlySignal<ReadonlySet<string>> = dismissed;

/**
 * The function of the two gates. It changes (another object) when the consent or a switch changes:
 * whoever reads it inside a `computed`/`effect` redraws.
 */
export const remoteImageGate: ReadonlySignal<(url: string) => RemoteImageGate> = computed(
  () => {
    const policy = { allowHttp: http.value, allowLocalNetwork: localNetwork.value };
    const permitted = new Set(origins.value);
    const any = anyOrigin.value;
    return (url: string): RemoteImageGate => {
      const check = checkRemoteImageUrl(url, policy);
      if (!check.ok) return { allowed: false, state: 'invalid', reason: check.reason };
      if (permitted.has(check.origin) || (any && !check.local)) {
        return { allowed: true, url: check.url, origin: check.origin };
      }
      return { allowed: false, state: 'blocked-consent', origin: check.origin };
    };
  },
);

/** Permite as origens neste navegador (grava). */
export function allowOrigins(list: readonly string[]): void {
  const next = [...new Set([...origins.peek(), ...list])];
  origins.value = next;
  saveAllowedOrigins(next);
}

/** Revoga uma origem permitida. */
export function revokeOrigin(origin: string): void {
  const next = origins.peek().filter((o) => o !== origin);
  origins.value = next;
  saveAllowedOrigins(next);
}

/** "Not now": hides the banner for those origins until the page reloads. */
export function dismissOrigins(list: readonly string[]): void {
  dismissed.value = new Set([...dismissed.peek(), ...list]);
}

const switchSignals = {
  allowAnyOrigin: anyOrigin,
  allowHttp: http,
  allowLocalNetwork: localNetwork,
  allowNoCors: noCors,
} as const;

function setSwitch(name: ImageSwitchName, value: boolean): void {
  switchSignals[name].value = value;
  saveImageSwitch(name, value);
}

export const setAllowAnyOrigin = (value: boolean): void =>
  setSwitch('allowAnyOrigin', value);
export const setAllowHttp = (value: boolean): void => setSwitch('allowHttp', value);
export const setAllowLocalNetwork = (value: boolean): void =>
  setSwitch('allowLocalNetwork', value);
export const setAllowNoCors = (value: boolean): void => setSwitch('allowNoCors', value);
