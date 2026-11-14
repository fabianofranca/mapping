// Text check for the passages that say how context is measured (stage #1699, phase CL1,
// finding 5). Citing the `used_tokens` of `get_session` proves nothing: the old measure is also cited,
// as "what not to use". The check requires the script as an instruction and the negation of the old measure.

const SCRIPT = '`node scripts/ci/contextUsage.mjs`';
const OLD_MEASURE = '`external_metadata.context_usage.used_tokens`';

/** Problems of a passage that must say to measure with the script and forbid `used_tokens`; empty = ok. */
export function scriptMeasureProblems(text: string): string[] {
  const problems: string[] = [];
  if (!text.includes(SCRIPT)) problems.push(`missing the script ${SCRIPT}`);
  const cites = text.split(/\.\s+/).filter((sentence) => sentence.includes(OLD_MEASURE));
  if (cites.length === 0) problems.push(`missing the prohibition of ${OLD_MEASURE}`);
  for (const sentence of cites) {
    // pt-BR kept: the regexes match the Portuguese protocol text of docs/FLOW.md and the skills
    if (!/\b(não|nunca)\b/i.test(sentence))
      problems.push(`${OLD_MEASURE} cited without negation: ${sentence.slice(0, 80)}`);
    if (!/só muda no fim/.test(sentence))
      problems.push(`${OLD_MEASURE} without the reason (only changes at the end of the turn)`);
  }
  return problems;
}
