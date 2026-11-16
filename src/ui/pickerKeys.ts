/** ↑/↓ cycle among the focus stops (`selector`) of a picker's list; any other key passes. */
export function cycleStops(
  root: HTMLElement | null,
  e: KeyboardEvent,
  selector: string,
): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const stops = [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])];
  const at = stops.indexOf(document.activeElement as HTMLElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  stops[(at + step + stops.length) % stops.length]?.focus();
}
