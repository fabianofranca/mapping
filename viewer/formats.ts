/**
 * The `mapping-viewer/formats` entry (stage #2059, VF2, decision 11): reads a file through the format plugin
 * of the specialization (`formatVersion` 22, which has no `origins`) and gives the screens the viewer draws.
 * A separate entry because it carries the plugin path (the specialization's parser, the applier and the
 * executor), 2.5 times the core; only the host that imports it pays for it. The host passes the `screen` to
 * `createViewer`, as it passes one it built itself.
 *
 * The plugin runs in a sandbox iframe in the host page, with a CSP of its own, so it has no network
 * and no access to the page in any host. The host needs three things in its own CSP
 * (`FORMAT_SANDBOX_CSP`); without them `screenFromFormat` gives `error.code = 'sandbox-unavailable'` and the
 * rest of the viewer keeps working.
 */
import '../src/utils/zodConfig';
import { SANDBOX_BOOTSTRAP_HASH } from '../src/app/formatSandbox';
import { formatScreens } from '../src/model/formatScreen';
import type { Library } from '../src/model/components/library';
import type { HostFonts } from '../src/model/components/tokens';
import type { TextMeasurer } from '../src/model/components/instantiate';
import type { Screen } from '../src/model/components/screen';
import { viewerHostFonts } from './hostFonts';
import {
  VIEWER_POLICY_NAME,
  disposeFormatSandbox as disposeViewerSandbox,
  viewerFormatRunner,
} from './formatSandbox';

// The public types are written here, not re-exported from `src/model/formatScreen.ts`: that module's
// declarations reach the specialization's types (and `zod`) through the plugin contract, and the package
// declares no `zod`. `tests/viewer/formatScreenTypes.test.ts` checks that they stay the model's.

/** The codes of a failure: the entry's own, and those of the plugin's executor. */
export type FormatScreenCode =
  | 'format-not-found'
  | 'spec-invalid'
  | 'nothing-to-draw'
  | 'sandbox-unavailable'
  | 'plugin-failed'
  | 'plugin-timeout'
  | 'plugin-limit'
  | 'plugin-output-invalid';

export interface FormatScreenError {
  /** A `FormatScreenCode`, or the code of an operation the applier refused. */
  readonly code: string;
  readonly message: string;
  /** Where the plugin's own code threw (1-based), when the sandbox says. */
  readonly line?: number;
  readonly column?: number;
}

export interface FormatScreenResult {
  /** One per container with component markings, in project order; empty with `error`. */
  readonly screens: readonly Screen[];
  /** The first of `screens`. */
  readonly screen?: Screen;
  /** The plugin's warnings and the drawing values' warnings, as texts. */
  readonly warnings: readonly string[];
  readonly error?: FormatScreenError;
}

export interface FormatScreenOptions {
  /** `<specId>/<formatId>`, as the MCP cites a format. */
  readonly format: string;
  /** Sizes the component markings without a `rect`; pass the one that draws (`konvaMeasurer`), so the boxes match the drawing. */
  readonly measure: TextMeasurer;
  /**
   * The fonts the boxes are sized with: the same you pass to `createViewer`. Absent: the viewer's own default
   * (the theme's stacks), which is what it draws with when it gets none.
   */
  readonly fonts?: HostFonts;
}

/**
 * What the host's CSP must carry for the sandbox to start: `scriptSrc` is one value of `script-src` (the hash of
 * the sandbox's only script), `workerSrc` one of `worker-src`, and `trustedTypes` the names the `trusted-types`
 * directive must list when the host uses Trusted Types (`mapping-viewer` is the viewer's own policy, `default`
 * the one the sandbox document creates for its `blob:` Worker).
 */
export const FORMAT_SANDBOX_CSP = {
  scriptSrc: SANDBOX_BOOTSTRAP_HASH,
  workerSrc: 'blob:',
  trustedTypes: [VIEWER_POLICY_NAME, 'default'],
} as const;

/**
 * Removes the iframe the entry made for the page (and its listener): for a single-page host that unmounts. The
 * next `screenFromFormat` makes another. Does nothing when there is none.
 */
export function disposeFormatSandbox(): void {
  disposeViewerSandbox();
}

/** The message of `sandbox-unavailable` (decision 2): what the host's CSP must carry, and what the browser said. */
function sandboxUnavailableMessage(detail: string): string {
  return (
    'The sandbox that runs the format plugin could not start in this page. The page needs: ' +
    `(1) ${FORMAT_SANDBOX_CSP.scriptSrc} in script-src (the hash of the sandbox's script), ` +
    `(2) ${FORMAT_SANDBOX_CSP.workerSrc} in worker-src, and (3) with Trusted Types, the policy names ` +
    `${FORMAT_SANDBOX_CSP.trustedTypes.join(' and ')} in trusted-types. (${detail})`
  );
}

/**
 * The screens of `text`, a file in the library's format `options.format`: the plugin's `parse` runs in the
 * sandbox, its result is applied on an in-memory project with the specialization, and each container with
 * component markings becomes a `Screen`. Never rejects: every failure is `error` (`code`, `message`, and
 * `line` and `column` where the plugin threw), with `screens` empty.
 */
export async function screenFromFormat(
  library: Library,
  text: string,
  options: FormatScreenOptions,
): Promise<FormatScreenResult> {
  const result = await formatScreens(library, text, {
    ...options,
    fonts: options.fonts ?? viewerHostFonts(),
    run: viewerFormatRunner,
  });
  const { error } = result;
  if (error?.code !== 'sandbox-unavailable') return result;
  return {
    ...result,
    error: { ...error, message: sandboxUnavailableMessage(error.message) },
  };
}
