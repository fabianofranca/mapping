// PWA: registro do service worker, aviso de nova versão e convite para instalar.
import { signal } from '@preact/signals';
import { readSetting, writeSetting } from '../utils/safeStorage';
import { reportError } from '../utils/report';

/** Há uma versão nova baixada, esperando o usuário aceitar. */
export const updateReady = signal(false);

/** Evento do Chrome/Edge/Android que permite abrir o convite de instalação. */
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

/** Service worker só em https (CLAUDE.md): em `file://` nem existe. */
export function canRegisterServiceWorker(
  protocol: string,
  nav: { serviceWorker?: unknown },
): boolean {
  return protocol === 'https:' && nav.serviceWorker !== undefined;
}

/** Liga o manifest só em https: em `file://` o navegador reclamaria dele. */
export function attachManifest(): void {
  if (location.protocol !== 'https:') return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './manifest.webmanifest';
  document.head.append(link);
}

let waiting: ServiceWorker | null = null;
/** O usuário aceitou o aviso: quando a versão nova assumir, recarrega. */
let updating = false;

function trackInstalling(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // Sem `controller` é a primeira instalação: nada a avisar.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waiting = worker;
      updateReady.value = true;
    }
  });
}

export async function registerServiceWorker(): Promise<void> {
  if (!canRegisterServiceWorker(location.protocol, navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    if (registration.waiting && navigator.serviceWorker.controller) {
      waiting = registration.waiting;
      updateReady.value = true;
    }
    trackInstalling(registration.installing);
    registration.addEventListener('updatefound', () =>
      trackInstalling(registration.installing),
    );
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Sem `updating` é só a primeira instalação assumindo a página (clients.claim).
      if (updating) location.reload();
    });
    // App instalada raramente recarrega: procura versão nova ao voltar para ela.
    document.addEventListener('visibilitychange', () => {
      // Offline não consegue verificar versão nova: não é falha a registrar.
      if (document.visibilityState === 'visible') void registration.update().catch(noop);
    });
  } catch (e) {
    // Sem service worker a app funciona igual, só não fica offline.
    reportError('pwa.register', e);
  }
}

/** Ativa a versão nova; o `controllerchange` recarrega a página. */
export function applyUpdate(): void {
  updating = true;
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

function noop(): void {}

/** Guarda o convite de instalação do navegador para abri-lo no nosso botão. */
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
    // O usuário pode instalar pelo menu do navegador.
  }
}
