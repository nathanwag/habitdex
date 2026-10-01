import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayProgress, habitHistory, streak, syncState, todayList,
} from './habits.js';

const daily = (id, extra = {}) => ({ id, name: `h${id}`, schedule: { kind: 'daily' }, createdDay: '2026-09-01', order: id, ...extra });
const check = (habitId, day) => ({ habitId, day, at: `${day}T12:00:00.000Z` });

// 2026-09-21 e segunda, 2026-09-22 e terca, 2026-09-27 e domingo.

test('hoje lista os habitos agendados pro dia, na ordem, com o que ja foi feito', () => {
  const habits = [
    daily(2, { order: 0 }),
    daily(1, { order: 1 }),
    { ...daily(3), schedule: { kind: 'days', days: [1, 3, 5] } },
    daily(4, { archived: true }),
  ];
  const list = todayList(habits, [check(1, '2026-09-22'), check(2, '2026-09-21')], '2026-09-22');
  assert.deepEqual(list.map((i) => [i.habit.id, i.done]), [[2, false], [1, true]]);
});

test('o habito semanal conta os dias feitos na semana e diz se hoje ja e obrigatorio', () => {
  const run = { ...daily(1), schedule: { kind: 'weekly', times: 3 } };
  // Semana anterior nao conta; sabado sobram 2 dias e falta 2.
  const checks = [check(1, '2026-09-20'), check(1, '2026-09-23')];
  const [item] = todayList([run], checks, '2026-09-26');
  assert.equal(item.doneThisWeek, 1);
  assert.equal(item.mustDo, true);

  const [friday] = todayList([run], checks, '2026-09-25');
  assert.equal(friday.mustDo, false);
});

test('o progresso do dia so conta o que era obrigatorio ou foi feito', () => {
  const item = (done, mustDo) => ({ done, mustDo });
  assert.equal(dayProgress([item(true, false), item(false, true)]), 0.5);
  // Semanal folgado nao pesa contra o dia.
  assert.equal(dayProgress([item(true, false), item(false, false)]), 1);
  assert.equal(dayProgress([item(false, false)]), 1);
  assert.equal(dayProgress([]), null);
});

test('a sequencia do diario conta os dias seguidos, e hoje ainda nao feito nao quebra', () => {
  const h = daily(1);
  const checks = ['2026-09-19', '2026-09-20', '2026-09-21'].map((d) => check(1, d));
  assert.equal(streak(h, checks, '2026-09-22'), 3);
  assert.equal(streak(h, [...checks, check(1, '2026-09-22')], '2026-09-22'), 4);
  // Um dia em branco no meio quebra.
  assert.equal(streak(h, checks, '2026-09-23'), 0);
});

test('a sequencia de dias fixos pula os dias fora da agenda', () => {
  const gym = { ...daily(1), schedule: { kind: 'days', days: [1, 3, 5] } };
  // Seg 14, qua 16, sex 18, seg 21; o fim de semana e a terca nao contam.
  const checks = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21'].map((d) => check(1, d));
  assert.equal(streak(gym, checks, '2026-09-22'), 4);
  // Quarta 23 ainda nao feita (e hoje) nao quebra.
  assert.equal(streak(gym, checks, '2026-09-23'), 4);
  // Na quinta, a quarta em branco ja quebrou.
  assert.equal(streak(gym, checks, '2026-09-24'), 0);
});

test('a sequencia do semanal conta semanas com a meta batida, e a semana atual incompleta nao quebra', () => {
  const run = { ...daily(1), schedule: { kind: 'weekly', times: 2 } };
  const checks = [
    '2026-09-08', '2026-09-10', // semana de 07/09: 2
    '2026-09-15', '2026-09-19', // semana de 14/09: 2
    '2026-09-23', // semana de 21/09 (atual): 1
  ].map((d) => check(1, d));
  assert.equal(streak(run, checks, '2026-09-24'), 2);
  assert.equal(streak(run, [...checks, check(1, '2026-09-24')], '2026-09-24'), 3);
  // Na semana seguinte, a de 21/09 com 1 so ja quebrou.
  assert.equal(streak(run, checks, '2026-09-28'), 0);
});

test('a grade marca cada dia: feito, perdido, fora da agenda, antes de existir, em aberto e futuro', () => {
  const gym = { ...daily(1), createdDay: '2026-09-16', schedule: { kind: 'days', days: [1, 3, 5] } };
  const checks = ['2026-09-16', '2026-09-21'].map((d) => check(1, d));
  // Hoje e quarta 23; duas semanas: 14/09 e 21/09.
  const { weeks, rate } = habitHistory(gym, checks, '2026-09-23', 2);
  assert.deepEqual(weeks.map((w) => w.start), ['2026-09-14', '2026-09-21']);
  assert.deepEqual(weeks[0].days.map((d) => d.state), ['before', 'before', 'done', 'off', 'missed', 'off', 'off']);
  assert.deepEqual(weeks[1].days.map((d) => d.state), ['done', 'off', 'open', 'future', 'future', 'future', 'future']);
  // Agendados que ja acabaram: 16, 18 e 21; hoje em aberto fica fora.
  assert.equal(rate, 2 / 3);
});

test('na grade do semanal, dia vazio nao e falta: cada semana diz se bateu a meta', () => {
  const run = { ...daily(1), createdDay: '2026-09-07', schedule: { kind: 'weekly', times: 2 } };
  const checks = ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-23'].map((d) => check(1, d));
  const { weeks, rate } = habitHistory(run, checks, '2026-09-24', 3);
  assert.deepEqual(weeks[1].days.map((d) => d.state), ['off', 'done', 'off', 'off', 'off', 'off', 'off']);
  assert.deepEqual(weeks.map((w) => [w.count, w.met]), [[2, true], [1, false], [1, false]]);
  // Semana atual ainda nao acabou: fica fora da taxa.
  assert.equal(rate, 1 / 2);
});

test('o estado mandado ao Worker diz o que foi feito hoje e quantas vezes na semana', () => {
  const checks = [
    check(1, '2026-09-20'), // semana anterior
    check(1, '2026-09-21'),
    check(1, '2026-09-23'),
    check(2, '2026-09-23'),
  ];
  assert.deepEqual(syncState(checks, '2026-09-23'), {
    day: '2026-09-23',
    week: '2026-09-21',
    doneToday: [1, 2],
    weekCounts: { 1: 2, 2: 1 },
  });
});
