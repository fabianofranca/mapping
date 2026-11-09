// O `<input type="date">` entrega `YYYY-MM-DD`; "antes de" essa data vale como a meia-noite do
// fuso local de quem escolheu (decisão 9 da #954). O modelo recebe um instante ISO completo, sem
// mudar (`Date.parse` de uma data pura seria meia-noite UTC). Texto que não é uma data segue
// como veio (o modelo trata data inválida como "não apaga nada").
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDayStart(day: string): string {
  const m = DAY.exec(day);
  if (m === null) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? day : date.toISOString();
}
