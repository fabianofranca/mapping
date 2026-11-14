// Trusted Types `default` policy (Remote images stage, decision 13). The `app` profile CSP
// (`pwa/csp.ts`) requires `require-trusted-types-for 'script'; trusted-types default`: no HTML
// or script URL enters the page without going through this policy, enforced by the browser.
// The rules are pure and tested; returning `null` makes the browser refuse the assignment with
// `TypeError` and emit `securitypolicyviolation`. No `createScript`: script by string is refused.
import { reportError } from '../utils/report';

/**
 * The service worker is registered with this URL (`src/app/pwa.ts`): the only one accepted in
 * `createScriptURL`.
 */
export const SERVICE_WORKER_URL = './sw.js';

/**
 * Only the empty string becomes HTML: Konva does `container.innerHTML = ''` when destroying the stage
 * (`node_modules/konva/lib/Stage.js`). Preact only uses `innerHTML` with `dangerouslySetInnerHTML`,
 * which the code does not use.
 */
export function createHTML(input: string): string | null {
  return input === '' ? '' : null;
}

/**
 * Chromium treats `navigator.serviceWorker.register` as a `TrustedScriptURL` sink:
 * only the exact URL of our service worker passes (recorded deviation from decision 13).
 */
export function createScriptURL(input: string): string | null {
  return input === SERVICE_WORKER_URL ? input : null;
}

/** DOM types for Trusted Types do not exist in TS: only what this policy uses. */
interface TrustedTypePolicyFactoryLike {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (input: string) => string | null;
      createScriptURL: (input: string) => string | null;
    },
  ) => unknown;
}

function factoryOf(target: unknown): TrustedTypePolicyFactoryLike | null {
  if (typeof target !== 'object' || target === null) return null;
  const factory: unknown = Reflect.get(target, 'trustedTypes');
  if (typeof factory !== 'object' || factory === null) return null;
  const create: unknown = Reflect.get(factory, 'createPolicy');
  if (typeof create !== 'function') return null;
  return {
    createPolicy: (name, rules) => Reflect.apply(create, factory, [name, rules]),
  };
}

export type TrustedTypesStatus = 'installed' | 'unsupported' | 'failed';

/**
 * Creates the `default` policy. `unsupported` when the browser has no Trusted Types (the CSP
 * `require-trusted-types-for` is then ignored and the app carries on); `failed` when the browser
 * refused it
 * (goes to Diagnostics).
 */
export function installTrustedTypesPolicy(
  target: unknown = globalThis,
): TrustedTypesStatus {
  const factory = factoryOf(target);
  if (!factory) return 'unsupported';
  try {
    factory.createPolicy('default', { createHTML, createScriptURL });
    return 'installed';
  } catch (e) {
    reportError('trustedTypes.install', e);
    return 'failed';
  }
}

// Effect on import: `main.tsx` imports this module before any other.
installTrustedTypesPolicy();
