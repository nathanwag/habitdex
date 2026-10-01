/* Regras de agenda e lembrete dos habitos. Puro e sem dependencias: o app
 * importa daqui, e o Worker importa o MESMO arquivo pra decidir quando
 * enviar — as duas pontas nao podem discordar. */

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Data, dia da semana (0 = domingo) e minutos desde a meia-noite de `date`
 *  vistos no fuso `tz`. O Worker roda em UTC, entao nada aqui pode usar os
 *  getters locais de Date. */
export function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Soma `n` dias a um dia AAAA-MM-DD. Conta de calendario em UTC, sem fuso. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia (AAAA-MM-DD) a que `date` pertence no fuso `tz`, com o dia virando as
 *  `dayStart` (HH:MM): antes disso, a madrugada ainda conta no dia anterior. */
export function dayOf(date, tz, dayStart = '00:00') {
  const { day, minutes } = localParts(date, tz);
  return minutes < toMinutes(dayStart) ? addDays(day, -1) : day;
}

/** Dia da semana (0 = domingo) de um dia AAAA-MM-DD, sem fuso. */
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Segunda-feira (AAAA-MM-DD) da semana de `day`. */
export const weekOf = (day) => addDays(day, -((weekdayOf(day) + 6) % 7));

/** Se o habito pode ser feito em `day`. O de "X vezes por semana" vale todo
 *  dia: quem escolhe os dias e a pessoa. */
export function isScheduled(habit, day) {
  const { schedule } = habit;
  return schedule.kind !== 'days' || schedule.days.includes(weekdayOf(day));
}

/** Se o habito ainda precisa ser feito hoje. "X vezes por semana" so cobra o
 *  dia quando o que falta da semana ja ocupa todos os dias restantes. */
export function mustDoToday(habit, day, { doneToday = false, doneThisWeek = 0 } = {}) {
  if (doneToday || !isScheduled(habit, day)) return false;
  if (habit.schedule.kind !== 'weekly') return true;
  const daysLeft = 7 - ((weekdayOf(day) + 6) % 7);
  return habit.schedule.times - doneThisWeek >= daysLeft;
}
