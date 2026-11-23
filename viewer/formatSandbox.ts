/**
 * The viewer's sandbox for a format plugin (stage #2059, VF2, decision 7). The same hidden
 * `sandbox="allow-scripts"` iframe and `blob:` Worker as the app (`src/app/formatRunner.ts`), in a page whose
 * CSP and Trusted Types the viewer does not control:
 *
 * - `srcdoc` goes through a Trusted Types policy named `mapping-viewer`, created at the first call when the
 *   browser has `trustedTypes`, whose `createHTML` accepts only `SANDBOX_SRCDOC`. Without Trusted Types the
 *   plain string is assigned. The host's `default` policy is never used or touched.
 * - A page that refuses the policy name, the `srcdoc` assignment, the bootstrap's hash or the `blob:` Worker
 *   fails with `phase: 'sandbox'`, which `formatScreens` reports as `sandbox-unavailable`. Nothing is
 *   logged: the host is told through the result.
 * - There is one iframe for the page, created at the first call and kept; `disposeFormatSandbox` removes it.
 *   The calls are serialized, as in the app.
 *
 * The document has its own CSP (`SANDBOX_CSP`), so the plugin has no network in any host.
 */
import {
  browserFrame,
  browserListen,
  createFormatRunner,
  type DisposableFormatRunner,
  type FormatRunnerDeps,
  type SandboxFrame,
  type SrcdocSetter,
} from '../src/app/formatRunner';
import { SANDBOX_SRCDOC } from '../src/app/formatSandbox';

/** The name of the viewer's own Trusted Types policy: the host lists it in `trusted-types`. */
export const VIEWER_POLICY_NAME = 'mapping-viewer';

interface PolicyLike {
  createHTML(input: string): unknown;
}

interface PolicyFactoryLike {
  createPolicy(
    name: string,
    rules: { createHTML: (input: string) => string },
  ): PolicyLike;
}

/** What the sandbox needs of the page; the tests pass fakes, the host gets `browserEnvironment()`. */
export interface ViewerSandboxEnvironment {
  /** `window.trustedTypes`, or `undefined` in a browser without it. */
  readonly trustedTypes: unknown;
  /** The hidden iframe, with `srcdoc` set by the given setter. */
  readonly frame: (setSrcdoc: SrcdocSetter) => SandboxFrame;
  readonly listen: FormatRunnerDeps['listen'];
}

function browserEnvironment(): ViewerSandboxEnvironment {
  return {
    trustedTypes: Reflect.get(globalThis, 'trustedTypes'),
    frame: browserFrame,
    listen: browserListen,
  };
}

function factoryOf(candidate: unknown): PolicyFactoryLike | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const create: unknown = Reflect.get(candidate, 'createPolicy');
  if (typeof create !== 'function') return null;
  return {
    createPolicy: (name, rules) =>
      Reflect.apply(create, candidate, [name, rules]) as PolicyLike,
  };
}

/** The policy accepts the sandbox document and nothing else (any other text is a `TypeError`). */
function sandboxHtml(input: string): string {
  if (input !== SANDBOX_SRCDOC) {
    throw new TypeError('The mapping-viewer policy only builds the sandbox document');
  }
  return input;
}

/**
 * The viewer's sandbox over `environment` (the page's by default). The runner is the app's
 * `createFormatRunner`; only the frame differs, in how `srcdoc` is set. The result is callable as a
 * `FormatRunner` and has `dispose`.
 */
export function createViewerSandbox(
  environment: Partial<ViewerSandboxEnvironment> = {},
): DisposableFormatRunner {
  const env: ViewerSandboxEnvironment = { ...browserEnvironment(), ...environment };
  const factory = factoryOf(env.trustedTypes);
  // Created once: a second `createPolicy` of the same name is refused by a host without 'allow-duplicates'.
  let policy: PolicyLike | null = null;

  const setSrcdoc: SrcdocSetter = (iframe) => {
    if (factory === null) {
      iframe.srcdoc = SANDBOX_SRCDOC;
      return;
    }
    policy ??= factory.createPolicy(VIEWER_POLICY_NAME, { createHTML: sandboxHtml });
    // `TrustedHTML` in a browser with Trusted Types: the `srcdoc` setter takes it.
    Reflect.set(iframe, 'srcdoc', policy.createHTML(SANDBOX_SRCDOC));
  };

  return createFormatRunner({
    createFrame: () => env.frame(setSrcdoc),
    listen: env.listen,
    silent: true,
  });
}

let shared: DisposableFormatRunner | null = null;

/** The viewer's executor of the page: one iframe, created at the first call. */
export const viewerFormatRunner: DisposableFormatRunner = Object.assign(
  (...args: Parameters<DisposableFormatRunner>) => {
    shared ??= createViewerSandbox();
    return shared(...args);
  },
  {
    dispose: (): void => {
      shared?.dispose();
    },
  },
);

/**
 * Removes the iframe the viewer made for the page (and its listener). For a host that unmounts the page; the
 * next `screenFromFormat` makes another. Does nothing when there is none.
 */
export function disposeFormatSandbox(): void {
  viewerFormatRunner.dispose();
}
