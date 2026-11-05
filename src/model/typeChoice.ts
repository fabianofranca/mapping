import type { SpecAnnotationType, SpecLayerGroup } from './spec';

export interface TypeChoiceSection {
  /** Chave estável: o id do grupo, ou 'others' para o bloco "Outros" (sem cabeçalho de grupo: 'all'). */
  readonly key: string;
  /** Grupo declarado do cabeçalho; null no bloco "Outros" e na lista sem cabeçalhos. */
  readonly group: SpecLayerGroup | null;
  /** true só no bloco dos tipos sem grupo, que a UI chama de "Outros". */
  readonly others: boolean;
  readonly types: readonly SpecAnnotationType[];
}

export interface TypeChoice {
  /** false: lista plana (uma só seção, sem cabeçalhos). */
  readonly headers: boolean;
  readonly sections: readonly TypeChoiceSection[];
  /** Total de tipos oferecidos (antes da busca), para "Buscar entre N tipos". */
  readonly total: number;
  /** Tipos que passaram na busca (soma das seções, sem repetir o tipo que está em vários grupos). */
  readonly matches: number;
}

/** Minúsculas, sem acentos e sem espaços nas pontas. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** O tipo casa pelo nome, id ou descrição; busca vazia casa tudo. */
export function typeMatchesQuery(type: SpecAnnotationType, query: string): boolean {
  const q = normalizeSearch(query);
  if (q === '') return true;
  return [type.name, type.id, type.description ?? ''].some((text) =>
    normalizeSearch(text).includes(q),
  );
}

/** Ids dos grupos do tipo que existem na camada. */
function knownGroups(type: SpecAnnotationType, known: ReadonlySet<string>): string[] {
  return (type.groups ?? []).filter((id) => known.has(id));
}

/** Agrupa os tipos (ordem dos grupos da camada) e filtra pela busca. */
export function chooseTypes(
  types: readonly SpecAnnotationType[],
  groups: readonly SpecLayerGroup[] | undefined,
  query: string,
): TypeChoice {
  const declared = groups ?? [];
  const known = new Set(declared.map((g) => g.id));
  const headers = types.some((t) => knownGroups(t, known).length > 0);
  const kept = types.filter((t) => typeMatchesQuery(t, query));
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
    types: kept.filter((t) => knownGroups(t, known).includes(group.id)),
  }));
  const loose = kept.filter((t) => knownGroups(t, known).length === 0);
  if (loose.length > 0)
    sections.push({ key: 'others', group: null, others: true, types: loose });
  return {
    headers: true,
    sections: sections.filter((s) => s.types.length > 0),
    total: types.length,
    matches: kept.length,
  };
}
