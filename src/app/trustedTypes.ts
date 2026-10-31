// Política `default` de Trusted Types (etapa Imagens remotas, decisão 13). A CSP do perfil `app`
// (`pwa/csp.ts`) exige `require-trusted-types-for 'script'; trusted-types default`: nenhum HTML
// nem URL de script entra na página sem passar por esta política, garantido pelo navegador.
// As regras são puras e testadas; devolver `null` faz o navegador recusar a atribuição com
// `TypeError` e emitir `securitypolicyviolation`. Sem `createScript`: script por string é recusado.
import { reportError } from '../utils/report';

/** O service worker é registrado com esta URL (`src/app/pwa.ts`): é a única aceita em `createScriptURL`. */
export const SERVICE_WORKER_URL = './sw.js';

/**
 * Só a string vazia vira HTML: o Konva faz `container.innerHTML = ''` ao destruir o palco
 * (`node_modules/konva/lib/Stage.js`). O Preact só usa `innerHTML` com `dangerouslySetInnerHTML`,
 * que o código não usa.
 */
export function createHTML(input: string): string | null {
  return input === '' ? '' : null;
}

/**
 * O Chromium trata `navigator.serviceWorker.register` como sink de `TrustedScriptURL`:
 * só a URL exata do nosso service worker passa (desvio registrado da decisão 13).
 */
export function createScriptURL(input: string): string | null {
  return input === SERVICE_WORKER_URL ? input : null;
}

/** Tipos do DOM para Trusted Types não existem no TS: só o que esta política usa. */
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
 * Cria a política `default`. `unsupported` quando o navegador não tem Trusted Types (a CSP
 * `require-trusted-types-for` é então ignorada e a app segue); `failed` quando o navegador a recusou
 * (vai para o Diagnóstico).
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

// Efeito ao importar: `main.tsx` importa este módulo antes de qualquer outro.
installTrustedTypesPolicy();
