import type { FORMAT_PLUGIN_LIMITS } from '../src/model';

// Placeholder: the executor of the format plugins comes in the next commit of this phase.

export type PluginFunction = 'generate' | 'parse';
export type PluginFailureCode =
  | 'plugin-failed'
  | 'plugin-timeout'
  | 'plugin-limit'
  | 'plugin-output-invalid';
export interface PluginFailure {
  readonly code: PluginFailureCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}
export type PluginRun =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: PluginFailure };
export interface PluginRunOptions {
  readonly format?: string;
  readonly pluginPath?: string;
  readonly limits?: Partial<Record<keyof typeof FORMAT_PLUGIN_LIMITS, number>>;
}

export function runPlugin(
  _source: string,
  _fn: PluginFunction,
  _args: readonly unknown[],
  _options: PluginRunOptions = {},
): Promise<PluginRun> {
  return Promise.reject(new Error('not implemented'));
}

export function pluginToolError(_failure: PluginFailure): never {
  throw new Error('not implemented');
}
