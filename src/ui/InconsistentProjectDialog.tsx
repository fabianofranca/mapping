import { useState } from 'preact/hooks';
import { t } from '../i18n';
import type { InvariantIssue, RepairRecord } from '../model';
import { writeClipboardText } from '../utils/clipboard';
import { Button } from './controls';
import { Dialog } from './Dialog';

/** What the refused opening reports (see `InconsistentProject` in the controller). */
export interface InconsistentDetails {
  readonly issues: readonly InvariantIssue[];
  readonly repaired: readonly RepairRecord[];
}

type Item = Pick<InvariantIssue, 'entity' | 'id' | 'name'>;

function itemLine(item: Item, problem: string): string {
  return t('inconsistent.item', {
    entity: t(`inconsistent.entity.${item.entity}`),
    label:
      item.name === undefined
        ? item.id
        : t('inconsistent.named', { name: item.name, id: item.id }),
    problem,
  });
}

/** One line per problem, e.g. `Marking "Name" (MN): nonexistent parent (M9)`. */
export function issueLines(issues: readonly InvariantIssue[]): string[] {
  return issues.map((issue) => {
    const problem = t(`invariant.${issue.code}`);
    return itemLine(
      issue,
      issue.otherId === undefined
        ? problem
        : t('inconsistent.other', { problem, other: issue.otherId }),
    );
  });
}

/** One line per repair, e.g. `Marking "Name" (MN): becomes a root of the image`. */
export function repairLines(records: readonly RepairRecord[]): string[] {
  return records.map((r) => itemLine(r, t(`repair.${r.action}`)));
}

/** Text of "Copy": the problems and, if any, what the repair does. */
function copyText(details: InconsistentDetails, canRepair: boolean): string {
  const sections = [[t('inconsistent.problems'), ...issueLines(details.issues)]];
  if (canRepair)
    sections.push([t('inconsistent.repairs'), ...repairLines(details.repaired)]);
  return sections.map((lines) => lines.join('\n')).join('\n\n');
}

/**
 * Opening refused because of inconsistent data: the exact list of problems, "Copy" and, when
 * all have a mechanical repair, "Repair and open" (the original goes to `backups/` on the first
 * save). Without a repair, only the list and Close.
 */
export function InconsistentProjectDialog({
  details,
  busy,
  onRepair,
  onClose,
}: {
  readonly details: InconsistentDetails;
  readonly busy: boolean;
  /** `null`: there is a problem without a repair. */
  readonly onRepair: (() => void) | null;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const canRepair = onRepair !== null;
  const copy = async () =>
    setCopied(await writeClipboardText(copyText(details, canRepair)));
  const count = details.issues.length;
  return (
    <Dialog
      title={t('inconsistent.title')}
      onCancel={onClose}
      size="md"
      actions={
        <>
          <span class="muted diagnostics-status" role="status">
            {copied === true
              ? t('inconsistent.copied')
              : copied === false
                ? t('common.copyFailed')
                : ''}
          </span>
          <Button onClick={() => void copy()}>{t('inconsistent.copy')}</Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {onRepair && (
            <Button variant="primary" disabled={busy} onClick={onRepair}>
              {t('inconsistent.repairAndOpen')}
            </Button>
          )}
        </>
      }
    >
      <p>
        {canRepair
          ? t('inconsistent.repairable', { count })
          : t('inconsistent.refused', { count })}
      </p>
      <h3>{t('inconsistent.problems')}</h3>
      <ul>
        {issueLines(details.issues).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {canRepair && (
        <>
          <h3>{t('inconsistent.repairs')}</h3>
          <ul>
            {repairLines(details.repaired).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
