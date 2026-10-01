/* Contas sobre os habitos e os checks (um por habito e dia). Puro, pra rodar
 * sob node --test. */

import {
  addDays, isScheduled, mustDoToday, weekOf,
} from './reminder.js';

const inWeekOf = (day) => {
  const monday = weekOf(day);
  const sunday = addDays(monday, 6);
  return (c) => c.day >= monday && c.day <= sunday;
};

/** Habitos ativos que valem em `day`, na ordem escolhida. Cada um diz se foi
 *  feito, quantas vezes na semana e se hoje ainda e obrigatorio (`mustDo`). */
export function todayList(habits, checks, day) {
  const weekChecks = checks.filter(inWeekOf(day));
  return habits
    .filter((h) => !h.archived && isScheduled(h, day))
    .sort((a, b) => a.order - b.order)
    .map((habit) => {
      const mine = weekChecks.filter((c) => c.habitId === habit.id);
      const done = mine.some((c) => c.day === day);
      const doneThisWeek = mine.length;
      return { habit, done, doneThisWeek, mustDo: mustDoToday(habit, day, { doneToday: done, doneThisWeek }) };
    });
}

/** Fracao do dia cumprida (0 a 1), ou null sem habitos hoje. Semanal ainda
 *  com folga e nao feito fica fora da conta: nao e atraso. */
export function dayProgress(list) {
  if (!list.length) return null;
  const counted = list.filter((i) => i.done || i.mustDo);
  return counted.length ? counted.filter((i) => i.done).length / counted.length : 1;
}

/** Sequencia ate `today`: dias agendados seguidos com o habito feito (dias
 *  fora da agenda sao pulados), ou semanas seguidas com a meta batida no
 *  semanal. Hoje, ou a semana atual, ainda incompleto nao quebra: nao acabou. */
export function streak(habit, checks, today) {
  const mine = checks.filter((c) => c.habitId === habit.id);
  return habit.schedule.kind === 'weekly' ? weekStreak(habit, mine, today) : dayStreak(habit, mine, today);
}

function dayStreak(habit, checks, today) {
  const done = new Set(checks.map((c) => c.day));
  let count = 0;
  for (let day = today; day >= habit.createdDay; day = addDays(day, -1)) {
    if (!isScheduled(habit, day)) continue;
    if (done.has(day)) count++;
    else if (day !== today) break;
  }
  return count;
}

function weekStreak(habit, checks, today) {
  const perWeek = new Map();
  for (const c of checks) perWeek.set(weekOf(c.day), (perWeek.get(weekOf(c.day)) || 0) + 1);
  const current = weekOf(today);
  let count = 0;
  for (let week = current; week >= weekOf(habit.createdDay); week = addDays(week, -7)) {
    if ((perWeek.get(week) || 0) >= habit.schedule.times) count++;
    else if (week !== current) break;
  }
  return count;
}

function dayState(habit, done, day, today) {
  if (day > today) return 'future';
  if (day < habit.createdDay) return 'before';
  if (done.has(day)) return 'done';
  if (day === today) return isScheduled(habit, day) ? 'open' : 'off';
  // No semanal, um dia vazio nao e falta: a conta e da semana.
  return isScheduled(habit, day) && habit.schedule.kind !== 'weekly' ? 'missed' : 'off';
}

/** As `weeks` semanas (segunda a domingo) terminando na de `today`, cada dia
 *  com seu estado, e a taxa de cumprimento (0 a 1, ou null sem nada a
 *  cobrar): sobre os dias agendados que ja acabaram, ou sobre as semanas no
 *  semanal, com `count` e `met` por semana. */
export function habitHistory(habit, checks, today, weeks) {
  const done = new Set(checks.filter((c) => c.habitId === habit.id).map((c) => c.day));
  const weekly = habit.schedule.kind === 'weekly';
  const current = weekOf(today);
  const first = addDays(current, -7 * (weeks - 1));
  const grid = [];
  for (let k = 0; k < weeks; k++) {
    const start = addDays(first, 7 * k);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      days.push({ day, state: dayState(habit, done, day, today) });
    }
    const count = days.filter((d) => d.state === 'done').length;
    grid.push({ start, days, count, met: weekly ? count >= habit.schedule.times : null });
  }

  let hits;
  if (weekly) {
    hits = grid
      .filter((w) => w.start >= weekOf(habit.createdDay) && (w.start !== current || w.met))
      .map((w) => w.met);
  } else {
    hits = grid.flatMap((w) => w.days)
      .filter((d) => d.state === 'missed' || (d.state === 'done' && isScheduled(habit, d.day)))
      .map((d) => d.state === 'done');
  }
  return { weeks: grid, rate: hits.length ? hits.filter(Boolean).length / hits.length : null };
}
