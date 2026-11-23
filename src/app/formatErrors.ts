import { t } from '../i18n';
import { FORMAT_PLUGIN_LIMITS, type FormatFailure } from '../model';
import {
  applyErrorAt,
  type ExportInFormatError,
  type ImportInFormatError,
} from '../store/formatActions';
import type { ImportFormatResult } from '../store/project';

// The messages of the format plugins' failures (the error codes of #1923, shown through `t()`).
// The plugin's own text (an error it threw, the limit that was passed) goes in as `{message}`.

/** A failed call of a plugin: its code's message, with the `line:column` of an error the plugin threw. */
export function formatFailureText(failure: FormatFailure): string {
  const { message } = failure;
  switch (failure.code) {
    case 'plugin-timeout':
      return t('format.error.plugin-timeout', {
        seconds: FORMAT_PLUGIN_LIMITS.timeoutMs / 1000,
      });
    case 'plugin-limit':
      return t('format.error.plugin-limit', { message });
    case 'plugin-output-invalid':
      return t('format.error.plugin-output-invalid', { message });
    case 'plugin-failed':
      return failure.line !== undefined && failure.column !== undefined
        ? t('format.error.plugin-failed.at', {
            message,
            line: failure.line,
            column: failure.column,
          })
        : t('format.error.plugin-failed', { message });
  }
}

/** Why an export in a format did not give a file. */
export function exportErrorText(error: ExportInFormatError): string {
  switch (error.kind) {
    case 'save':
      return t('format.error.save');
    case 'project':
      return t('format.error.project');
    case 'container':
      return t('format.error.container');
    case 'plugin':
      return formatFailureText(error.failure);
  }
}

/** The errors of an import that need nothing but their kind to be worded. */
const IMPORT_ERROR_KEYS = {
  read: 'format.import.error.read',
  save: 'format.import.error.save',
  project: 'format.error.project',
  'principal-only': 'format.import.error.principalOnly',
  container: 'format.import.error.container',
} as const;

/** Why an import from a format gave no preview. */
export function importErrorText(error: ImportInFormatError): string {
  switch (error.kind) {
    case 'extension':
      return t('format.import.error.extension', { extension: error.extension });
    case 'size':
      return t('format.import.error.size', {
        size: FORMAT_PLUGIN_LIMITS.parseTextBytes / (1024 * 1024),
      });
    case 'plugin':
      return formatFailureText(error.failure);
    case 'result':
      return resultErrorText(error);
    case 'apply':
      return t('format.import.error.apply', { path: error.path, message: error.message });
    default:
      return t(IMPORT_ERROR_KEYS[error.kind]);
  }
}

/** A result that breaks the contract: the first problem at its path, and how many more there are. */
function resultErrorText(
  error: Extract<ImportInFormatError, { kind: 'result' }>,
): string {
  const at = `${error.path}: ${error.message}`;
  const first =
    error.code === 'plugin-limit'
      ? t('format.error.plugin-limit', { message: error.message })
      : t('format.error.plugin-output-invalid', { message: at });
  return error.more > 0
    ? `${first} ${t('format.import.error.more', { count: error.more })}`
    : first;
}

/** Why the Import action refused or failed: the store's refusal, or the rule that broke. */
export function importActionErrorText(
  result: Extract<ImportFormatResult, { readonly ok: false }>,
): string {
  switch (result.error) {
    case 'read-only':
    case 'reviewing':
      return t('format.import.error.locked');
    case 'principal-only':
      return t('format.import.error.principalOnly');
    case 'format-apply':
      return t('format.import.error.apply', applyErrorAt(result.failure));
    default:
      return t('format.import.error.unexpected');
  }
}
