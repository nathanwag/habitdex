/* Regras de agenda e lembrete dos habitos. Puro e sem dependencias: o app
 * importa daqui, e o Worker importa o MESMO arquivo pra decidir quando
 * enviar — as duas pontas nao podem discordar. */

// "Adiar" da tela aberta pela notificacao. O cron roda de 5 em 5 min, entao o
// lembrete adiado chega entre 10 e 15 min depois.
export const SNOOZE_MIN = 10;

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

// Minutos desde a virada do dia: com a virada as 05:00, 01:00 vem depois das
// 23:00, nao antes das 06:00.
const sinceDayStart = (minutes, config) => (minutes - toMinutes(config.dayStart ?? '00:00') + 1440) % 1440;

/** Hora (em minutos desde a virada do dia) em que o lembrete de `habit` sai
 *  hoje, ou null se hoje ele nao sai. */
function pendingAt(habit, today, state, config) {
  if (!habit.remindAt) return null;
  const doneToday = state.day === today && (state.doneToday ?? []).includes(habit.id);
  const doneThisWeek = state.week === weekOf(today) ? state.weekCounts?.[habit.id] ?? 0 : 0;
  if (!mustDoToday(habit, today, { doneToday, doneThisWeek })) return null;
  const sent = state.lastSent?.[habit.id];
  const isToday = (iso) => dayOf(new Date(iso), config.tz, config.dayStart) === today;

  // O adiamento vale ate o proximo envio daquele habito, e so no mesmo dia.
  const { snoozed } = state;
  if (snoozed?.habitId === habit.id && isToday(snoozed.at) && !(sent > snoozed.at)) {
    return sinceDayStart(localParts(new Date(snoozed.at), config.tz).minutes + SNOOZE_MIN, config);
  }
  if (sent && isToday(sent)) return null;
  return sinceDayStart(toMinutes(habit.remindAt), config);
}

/** Lembretes vencidos agora: [{ habit }]. */
export function dueReminders(config, state, now) {
  const today = dayOf(now, config.tz, config.dayStart);
  const minutes = sinceDayStart(localParts(now, config.tz).minutes, config);
  return config.habits
    .filter((habit) => {
      const when = pendingAt(habit, today, state, config);
      return when !== null && when <= minutes;
    })
    .map((habit) => ({ habit }));
}

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** O proximo lembrete de hoje se nada mais for feito ({ at: 'HH:MM', names }),
 *  ou null. E pro app, que nao sabe o que o cron ja enviou: horario que ja
 *  passou conta como enviado. */
export function nextReminder(config, state, now) {
  const today = dayOf(now, config.tz, config.dayStart);
  const nowMin = sinceDayStart(localParts(now, config.tz).minutes, config);
  const pending = config.habits
    .map((habit) => ({ habit, when: pendingAt(habit, today, state, config) }))
    .filter((p) => p.when !== null && p.when > nowMin);
  if (!pending.length) return null;
  const first = Math.min(...pending.map((p) => p.when));
  return {
    at: toHHMM((first + toMinutes(config.dayStart ?? '00:00')) % 1440),
    names: pending.filter((p) => p.when === first).map((p) => p.habit.name),
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string';
  } catch {
    return false;
  }
}

function scheduleError(schedule) {
  if (!schedule || typeof schedule !== 'object') return 'Frequência inválida.';
  if (schedule.kind === 'daily') return null;
  if (schedule.kind === 'days') {
    const { days } = schedule;
    if (!Array.isArray(days) || days.length === 0) return 'Escolha pelo menos um dia da semana.';
    return days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? null : 'Dia da semana inválido.';
  }
  if (schedule.kind === 'weekly') {
    const { times } = schedule;
    return Number.isInteger(times) && times >= 1 && times <= 7 ? null : 'Vezes por semana inválidas.';
  }
  return 'Frequência inválida.';
}

function habitError(habit) {
  if (!habit || typeof habit !== 'object') return 'Hábito inválido.';
  if (!Number.isInteger(habit.id) || habit.id <= 0) return 'Hábito sem id.';
  if (typeof habit.name !== 'string' || !habit.name.trim()) return 'Hábito sem nome.';
  if (habit.remindAt !== null && !HHMM.test(habit.remindAt)) return 'Horário do lembrete inválido.';
  return scheduleError(habit.schedule);
}

/** Mensagem do primeiro problema da config, ou null se ela e valida. Tambem
 *  e a defesa do Worker contra o que chega pela rede, entao nao pode lancar. */
export function configError(config) {
  if (!config || typeof config !== 'object') return 'Configuração ausente.';
  if (!validTimeZone(config.tz)) return 'Fuso horário inválido.';
  if (!HHMM.test(config.dayStart)) return 'Virada do dia inválida.';
  if (!Array.isArray(config.habits)) return 'Lista de hábitos ausente.';
  for (const habit of config.habits) {
    const error = habitError(habit);
    if (error) return error;
  }
  return null;
}
