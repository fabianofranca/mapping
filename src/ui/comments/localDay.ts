// The `<input type="date">` delivers `YYYY-MM-DD`; "before" that date counts as the midnight of the
// local time zone of whoever chose it (decision 9 of #954). The model receives a full ISO instant,
// unchanged (`Date.parse` of a bare date would be UTC midnight). Text that is not a date goes on
// as it came (the model treats an invalid date as "deletes nothing").
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDayStart(day: string): string {
  const m = DAY.exec(day);
  if (m === null) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? day : date.toISOString();
}
