/** Junta nomes de classe, ignorando os vazios. */
export function classes(
  ...names: readonly (string | false | null | undefined)[]
): string {
  return names.filter(Boolean).join(' ');
}
