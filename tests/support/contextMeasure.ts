// Conferência de texto para os trechos que dizem como se mede o contexto (etapa #1699, fase CL1,
// achado 5). Citar o `used_tokens` do `get_session` não prova nada: a medida antiga também é citada,
// como "o que não usar". A conferência pede o script como instrução e a negação da medida antiga.

const SCRIPT = '`node scripts/ci/contextUsage.mjs`';
const OLD_MEASURE = '`external_metadata.context_usage.used_tokens`';

/** Problemas de um trecho que deve mandar medir pelo script e proibir o `used_tokens`; vazio = ok. */
export function scriptMeasureProblems(text: string): string[] {
  const problems: string[] = [];
  if (!text.includes(SCRIPT)) problems.push(`falta o script ${SCRIPT}`);
  const cites = text.split(/\.\s+/).filter((sentence) => sentence.includes(OLD_MEASURE));
  if (cites.length === 0) problems.push(`falta a proibição de ${OLD_MEASURE}`);
  for (const sentence of cites) {
    if (!/\b(não|nunca)\b/i.test(sentence))
      problems.push(`${OLD_MEASURE} citado sem negação: ${sentence.slice(0, 80)}`);
    if (!/só muda no fim/.test(sentence))
      problems.push(`${OLD_MEASURE} sem o motivo (só muda no fim do turno)`);
  }
  return problems;
}
