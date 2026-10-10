import { useState } from 'preact/hooks';
import { t } from '../i18n';
import type { InvariantIssue, RepairRecord } from '../model';
import { writeClipboardText } from '../utils/clipboard';
import { Button } from './controls';
import { Dialog } from './Dialog';

/** O que a abertura recusada informa (ver `InconsistentProject` no controller). */
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

/** Uma linha por problema, ex.: `Marcação "Nome" (MN): pai inexistente (M9)`. */
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

/** Uma linha por reparo, ex.: `Marcação "Nome" (MN): vira raiz da imagem`. */
export function repairLines(records: readonly RepairRecord[]): string[] {
  return records.map((r) => itemLine(r, t(`repair.${r.action}`)));
}

/** Texto do "Copiar": os problemas e, se houver, o que o reparo faz. */
function copyText(details: InconsistentDetails, canRepair: boolean): string {
  const sections = [[t('inconsistent.problems'), ...issueLines(details.issues)]];
  if (canRepair)
    sections.push([t('inconsistent.repairs'), ...repairLines(details.repaired)]);
  return sections.map((lines) => lines.join('\n')).join('\n\n');
}

/**
 * Abertura recusada por dados inconsistentes: a lista exata dos problemas, "Copiar" e, quando
 * todos têm reparo mecânico, "Reparar e abrir" (o original vai para `backups/` na primeira
 * gravação). Sem reparo, só a lista e Fechar.
 */
export function InconsistentProjectDialog({
  details,
  busy,
  onRepair,
  onClose,
}: {
  readonly details: InconsistentDetails;
  readonly busy: boolean;
  /** `null`: há problema sem reparo. */
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
