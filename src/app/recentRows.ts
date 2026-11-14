// The rows of the home screen's recents list, to move focus to the row that took the
// place of the one that left (stage 7, G4). Moved out of `Home.tsx` unchanged (returned by the
// 8.4 gate, so the file does not grow past `max-lines`).

/** Position of row `key` in the recents list (0 if it is not in it). */
export function recentRowIndex(section: HTMLElement | null, key: string): number {
  const rows = [...(section?.querySelectorAll<HTMLElement>('tr[data-recent]') ?? [])];
  return Math.max(
    0,
    rows.findIndex((row) => row.dataset['recent'] === key),
  );
}

/**
 * Focus after a row leaves the list: the Open of the row now at position `index` (or of the
 * last one, if the removed one was the last); with no rows, the list title.
 */
export function recentRowTarget(
  section: HTMLElement | null,
  index: number,
): HTMLElement | null {
  if (!section?.isConnected) return null;
  const rows = section.querySelectorAll<HTMLElement>('tr[data-recent]');
  const row = rows[Math.min(index, rows.length - 1)];
  return (
    row?.querySelector<HTMLElement>('[data-recent-open]') ??
    section.querySelector<HTMLElement>('h2')
  );
}
