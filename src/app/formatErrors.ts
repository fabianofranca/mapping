import { t } from '../i18n';
import { FORMAT_PLUGIN_LIMITS, type FormatFailure } from '../model';
import type { ExportInFormatError } from '../store/formatActions';

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
