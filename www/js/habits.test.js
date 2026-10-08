import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestStreak, dayProgress, habitHistory, habitIcon, iconOf, monthDays, reviseHabit, streak, syncState, todayList,
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

test('o progresso do dia e a fracao feita dos que valem no dia, sem os semanais', () => {
  const weekly = { ...daily(3), schedule: { kind: 'weekly', times: 3 } };
  const habits = [daily(1), { ...daily(2), schedule: { kind: 'days', days: [1] } }, weekly];
  // 2026-09-21 e segunda: valem os tres; o semanal fica fora da conta.
  assert.equal(dayProgress(todayList(habits, [check(1, '2026-09-21')], '2026-09-21')), 0.5);
  // Domingo sem nenhum semanal feito: ele e obrigatorio, mas ainda fica fora.
  assert.equal(dayProgress(todayList(habits, [check(1, '2026-09-27')], '2026-09-27')), 1);
  assert.equal(dayProgress(todayList([weekly], [check(3, '2026-09-27')], '2026-09-27')), null);
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

// O jogo recalcula os dias passados com esta lista: criar, arquivar ou mudar
// a frequencia de um habito nao pode reescrever o que ja aconteceu.

test('habito criado depois nao entra nos dias anteriores a criacao', () => {
  const habits = [daily(1), daily(2, { createdDay: '2026-09-22' })];
  assert.deepEqual(todayList(habits, [], '2026-09-21').map((i) => i.habit.id), [1]);
  assert.deepEqual(todayList(habits, [], '2026-09-22').map((i) => i.habit.id), [1, 2]);
});

test('arquivado deixa de contar a partir do dia em que foi arquivado; antes, continua', () => {
  const archived = daily(1, {
    archived: true,
    versions: [
      { from: '2026-09-01', schedule: { kind: 'daily' }, archived: false },
      { from: '2026-09-20', schedule: { kind: 'daily' }, archived: true },
    ],
  });
  assert.equal(todayList([archived], [], '2026-09-19').length, 1);
  assert.equal(todayList([archived], [], '2026-09-20').length, 0);
});

test('mudar a frequencia vale do dia da mudanca em diante', () => {
  const changed = daily(1, {
    schedule: { kind: 'days', days: [1] },
    versions: [
      { from: '2026-09-01', schedule: { kind: 'daily' }, archived: false },
      { from: '2026-09-20', schedule: { kind: 'days', days: [1] }, archived: false },
    ],
  });
  // Sabado 19/09 ainda era diario; depois, so segunda.
  assert.equal(todayList([changed], [], '2026-09-19').length, 1);
  assert.equal(todayList([changed], [], '2026-09-21').length, 1);
  assert.equal(todayList([changed], [], '2026-09-22').length, 0);
});

test('editar frequencia ou arquivar registra uma versao a partir do dia; no mesmo dia, a ultima vale', () => {
  const old = daily(1);
  const mondays = reviseHabit(old, { ...old, schedule: { kind: 'days', days: [1] } }, '2026-09-20');
  assert.deepEqual(mondays.schedule, { kind: 'days', days: [1] });
  assert.deepEqual(mondays.versions, [
    { from: '2026-09-01', schedule: { kind: 'daily' }, archived: false },
    { from: '2026-09-20', schedule: { kind: 'days', days: [1] }, archived: false },
  ]);
  const archived = reviseHabit(mondays, { ...mondays, archived: true }, '2026-09-20');
  assert.deepEqual(archived.versions.at(-1), { from: '2026-09-20', schedule: { kind: 'days', days: [1] }, archived: true });
  assert.equal(archived.versions.length, 2);
  // Trocar so o nome nao cria versao.
  assert.deepEqual(reviseHabit(old, { ...old, name: 'Ler' }, '2026-09-20').versions, [
    { from: '2026-09-01', schedule: { kind: 'daily' }, archived: false },
  ]);
});

test('o icone e o ultimo emoji digitado (digitar outro troca), inteiro mesmo quando composto; vazio vira sem icone', () => {
  assert.equal(iconOf('💧'), '💧');
  assert.equal(iconOf('💧🏃'), '🏃');
  assert.equal(iconOf('  🧘‍♀️ '), '🧘‍♀️');
  assert.equal(iconOf('ok 👍🏽'), '👍🏽');
  assert.equal(iconOf('   '), null);
  assert.equal(iconOf(''), null);
});

test('o habito mostra o icone; sem icone, a inicial do nome', () => {
  assert.equal(habitIcon(daily(1, { name: 'Beber água', icon: '💧' })), '💧');
  assert.equal(habitIcon(daily(1, { name: '  ler' })), 'L');
  assert.equal(habitIcon(daily(1, { name: '' })), '?');
});

test('o recorde e a maior sequencia ja feita, mesmo que a atual seja menor', () => {
  const h = daily(1);
  // 02 a 05 (4 dias), falha no 06, 07 e 08 (2 dias).
  const checks = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-07', '2026-09-08'].map((d) => check(1, d));
  assert.equal(bestStreak(h, checks, '2026-09-08'), 4);
  assert.equal(bestStreak(h, [], '2026-09-08'), 0);

  // Dias fixos: seg 14, qua 16, sex 18 e seg 21 seguem, mesmo com o fim de semana no meio.
  const gym = { ...daily(1), schedule: { kind: 'days', days: [1, 3, 5] } };
  const gymChecks = ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21'].map((d) => check(1, d));
  assert.equal(bestStreak(gym, gymChecks, '2026-09-30'), 4);

  // Semanal (2x): semanas de 07/09 e 14/09 na meta, a de 21/09 nao, a de 28/09 sim.
  const run = { ...daily(1), schedule: { kind: 'weekly', times: 2 } };
  const runChecks = ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-19', '2026-09-23', '2026-09-28', '2026-09-29']
    .map((d) => check(1, d));
  assert.equal(bestStreak(run, runChecks, '2026-09-30'), 2);
});

test('o mes traz cada dia com seu estado e quantos foram feitos dos que ja eram devidos', () => {
  // Criado em 03/09; seg/qua/sex; hoje e quarta 23/09.
  const gym = { ...daily(1, { createdDay: '2026-09-03' }), schedule: { kind: 'days', days: [1, 3, 5] } };
  const checks = ['2026-09-04', '2026-09-07', '2026-09-14', '2026-09-16'].map((d) => check(1, d));
  const { days, done, due } = monthDays(gym, checks, '2026-09-23', '2026-09');
  assert.equal(days.length, 30);
  const at = (d) => days.find((x) => x.day === `2026-09-${d}`).state;
  assert.deepEqual([at('02'), at('04'), at('09'), at('10'), at('23'), at('24')],
    ['before', 'done', 'missed', 'off', 'open', 'future']);
  // Devidos ate ontem: 04, 07, 09, 11, 14, 16, 18, 21 (8); feitos: 4.
  assert.deepEqual([done, due], [4, 8]);
  assert.equal(monthDays(gym, checks, '2026-09-23', '2026-02').days.length, 28);
});

test('dia marcado antes de o habito entrar no app conta na sequencia e no recorde', () => {
  // Criado no app em 22/09, mas feito desde 18/09.
  const h = daily(1, { createdDay: '2026-09-22' });
  const checks = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'].map((d) => check(1, d));
  assert.equal(streak(h, checks, '2026-09-22'), 5);
  assert.equal(bestStreak(h, checks, '2026-09-22'), 5);

  const run = { ...h, schedule: { kind: 'weekly', times: 2 } };
  const runChecks = ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-19', '2026-09-22'].map((d) => check(1, d));
  assert.equal(streak(run, runChecks, '2026-09-22'), 2);
  assert.equal(bestStreak(run, runChecks, '2026-09-22'), 2);
});

test('no mes, marcar um dia antes da criacao recua o comeco: dali em diante vale como os outros', () => {
  // Criado no app em 22/09; marcado em 15 e 17/09, antes disso.
  const h = daily(1, { createdDay: '2026-09-22' });
  const checks = ['2026-09-15', '2026-09-17', '2026-09-22'].map((d) => check(1, d));
  const { days, done, due } = monthDays(h, checks, '2026-09-23', '2026-09');
  const at = (d) => days.find((x) => x.day === `2026-09-${d}`).state;
  assert.deepEqual([at('14'), at('15'), at('16'), at('17'), at('21'), at('22')],
    ['before', 'done', 'missed', 'done', 'missed', 'done']);
  // Devidos ate ontem: 15 a 22 (8 dias); feitos: 3.
  assert.deepEqual([done, due], [3, 8]);
});

test('dia marcado antes de o habito entrar no app nao entra no dia do jogo', () => {
  // O jogo recalcula o passado: marcar o historico de um habito antigo nao pode
  // mudar o progresso (nem os niveis) dos dias em que ele ainda nao estava no app.
  const habits = [daily(1), daily(2, { createdDay: '2026-09-22', versions: [{ from: '2026-09-22', schedule: { kind: 'daily' }, archived: false }] })];
  const checks = [check(2, '2026-09-20')];
  assert.deepEqual(todayList(habits, checks, '2026-09-20').map((i) => i.habit.id), [1]);
  assert.equal(dayProgress(todayList(habits, checks, '2026-09-20')), 0);
});
