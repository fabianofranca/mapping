import type { SpecAnnotationType, SpecLayerGroup } from './spec';

export interface TypeChoiceSection {
  /** Stable key: the group id, or 'others' for the "Others" block (with no group header: 'all'). */
  readonly key: string;
  /** Group declared in the header; null in the "Others" block and in the list with no headers. */
  readonly group: SpecLayerGroup | null;
  /** true only in the block of types with no group, which the UI calls "Others". */
  readonly others: boolean;
  readonly types: readonly SpecAnnotationType[];
}

export interface TypeChoice {
  /** false: flat list (a single section, no headers). */
  readonly headers: boolean;
  readonly sections: readonly TypeChoiceSection[];
  /** Total types offered (before the search), for "Search among N types". */
  readonly total: number;
  /** Types that passed the search (sum of the sections, not repeating a type that is in several groups). */
  readonly matches: number;
}

/** Lowercase, without accents and without spaces at the ends. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** The type matches by name, id or description; an empty search matches everything. */
export function typeMatchesQuery(type: SpecAnnotationType, query: string): boolean {
  return matchesNormalized(type, normalizeSearch(query));
}

function matchesNormalized(type: SpecAnnotationType, q: string): boolean {
  if (q === '') return true;
  return [type.name, type.id, type.description ?? ''].some((text) =>
    normalizeSearch(text).includes(q),
  );
}

/** Ids of the type's groups that exist in the layer. */
function knownGroups(type: SpecAnnotationType, known: ReadonlySet<string>): string[] {
  return (type.groups ?? []).filter((id) => known.has(id));
}

/** Groups the types (in the layer's group order) and filters by the search. */
export function chooseTypes(
  types: readonly SpecAnnotationType[],
  groups: readonly SpecLayerGroup[] | undefined,
  query: string,
): TypeChoice {
  const declared = groups ?? [];
  const known = new Set(declared.map((g) => g.id));
  const typeGroups = new Map(types.map((t) => [t, knownGroups(t, known)]));
  const headers = types.some((t) => typeGroups.get(t)!.length > 0);
  const q = normalizeSearch(query);
  const kept = types.filter((t) => matchesNormalized(t, q));
  if (!headers) {
    const flat: TypeChoiceSection = {
      key: 'all',
      group: null,
      others: false,
      types: kept,
    };
    return {
      headers: false,
      sections: [flat],
      total: types.length,
      matches: kept.length,
    };
  }
  const sections: TypeChoiceSection[] = declared.map((group) => ({
    key: group.id,
    group,
    others: false,
    types: kept.filter((t) => typeGroups.get(t)!.includes(group.id)),
  }));
  const loose = kept.filter((t) => typeGroups.get(t)!.length === 0);
  if (loose.length > 0)
    sections.push({ key: 'others', group: null, others: true, types: loose });
  return {
    headers: true,
    sections: sections.filter((s) => s.types.length > 0),
    total: types.length,
    matches: kept.length,
  };
}
