// PWA: service worker registration, new-version notice and install invitation.
import { signal } from '@preact/signals';
import { readSetting, writeSetting } from '../utils/safeStorage';
import { reportError } from '../utils/report';
import { SERVICE_WORKER_URL } from './trustedTypes';

/** A new version has been downloaded, waiting for the user to accept. */
export const updateReady = signal(false);

/** Chrome/Edge/Android event that allows opening the install invitation. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
export const installPrompt = signal<InstallPromptEvent | null>(null);

const INSTALL_HINT_KEY = 'mapping.installHintDismissed';

export const installHintDismissed = signal(readSetting(INSTALL_HINT_KEY) === 'yes');

export function dismissInstallHint(): void {
  installHintDismissed.value = true;
  writeSetting(INSTALL_HINT_KEY, 'yes');
}

/** Service worker only on https (CLAUDE.md): on `file://` it does not even exist. */
export function canRegisterServiceWorker(
  protocol: string,
  nav: { serviceWorker?: unknown },
): boolean {
  return protocol === 'https:' && nav.serviceWorker !== undefined;
}

/** Links the manifest only on https: on `file://` the browser would complain about it. */
export function attachManifest(): void {
  if (location.protocol !== 'https:') return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './manifest.webmanifest';
  document.head.append(link);
}

let waiting: ServiceWorker | null = null;
/** The user accepted the notice: when the new version takes over, reload. */
let updating = false;

function trackInstalling(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // Without a `controller` this is the first install: nothing to notify.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waiting = worker;
      updateReady.value = true;
    }
  });
}

export async function registerServiceWorker(): Promise<void> {
  if (!canRegisterServiceWorker(location.protocol, navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    if (registration.waiting && navigator.serviceWorker.controller) {
      waiting = registration.waiting;
      updateReady.value = true;
    }
    trackInstalling(registration.installing);
    registration.addEventListener('updatefound', () =>
      trackInstalling(registration.installing),
    );
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Without `updating` it is just the first install taking over the page (clients.claim).
      if (updating) location.reload();
    });
    // An installed app rarely reloads: look for a new version when returning to it.
    document.addEventListener('visibilitychange', () => {
      // Offline it cannot check for a new version: not a failure to record.
      if (document.visibilityState === 'visible') void registration.update().catch(noop);
    });
  } catch (e) {
    // Without a service worker the app works the same, it just does not work offline.
    reportError('pwa.register', e);
  }
}

/** Activates the new version; the `controllerchange` reloads the page. */
export function applyUpdate(): void {
  updating = true;
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

function noop(): void {}

/** Keeps the browser's install invitation to open it from our button. */
export function bindInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt.value = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt.value = null;
  });
}

export async function promptInstall(): Promise<void> {
  const event = installPrompt.value;
  if (!event) return;
  installPrompt.value = null;
  try {
    await event.prompt();
  } catch {
    // The user can install from the browser menu.
  }
}
