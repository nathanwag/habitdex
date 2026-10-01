import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  configError, dayOf, dueReminders, isScheduled, mustDoToday, nextReminder, weekOf,
} from './reminder.js';

// Sao Paulo e UTC-3 o ano todo (sem horario de verao desde 2019).
const TZ = 'America/Sao_Paulo';
const at = (local) => new Date(`${local}-03:00`);

test('o dia vira a meia-noite por padrao', () => {
  assert.equal(dayOf(at('2026-09-22T23:59:00'), TZ), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T00:30:00'), TZ), '2026-09-23');
});

test('com a virada as 05:00, a madrugada ainda conta no dia anterior', () => {
  assert.equal(dayOf(at('2026-09-23T01:30:00'), TZ, '05:00'), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T04:59:00'), TZ, '05:00'), '2026-09-22');
  assert.equal(dayOf(at('2026-09-23T05:00:00'), TZ, '05:00'), '2026-09-23');
  // Virada do mes.
  assert.equal(dayOf(at('2026-10-01T02:00:00'), TZ, '05:00'), '2026-09-30');
});

test('a semana comeca na segunda', () => {
  // 2026-09-21 e segunda, 2026-09-27 e domingo.
  assert.equal(weekOf('2026-09-21'), '2026-09-21');
  assert.equal(weekOf('2026-09-24'), '2026-09-21');
  assert.equal(weekOf('2026-09-27'), '2026-09-21');
  assert.equal(weekOf('2026-09-28'), '2026-09-28');
  // Semana que atravessa o mes.
  assert.equal(weekOf('2026-10-02'), '2026-09-28');
});

test('habito diario e de toda semana vale todo dia; o de dias fixos, so neles', () => {
  const daily = { schedule: { kind: 'daily' } };
  const weekly = { schedule: { kind: 'weekly', times: 3 } };
  const monWedFri = { schedule: { kind: 'days', days: [1, 3, 5] } };
  // 2026-09-21 e segunda, 2026-09-22 e terca.
  for (const day of ['2026-09-21', '2026-09-22', '2026-09-27']) {
    assert.equal(isScheduled(daily, day), true);
    assert.equal(isScheduled(weekly, day), true);
  }
  assert.equal(isScheduled(monWedFri, '2026-09-21'), true);
  assert.equal(isScheduled(monWedFri, '2026-09-22'), false);
  assert.equal(isScheduled(monWedFri, '2026-09-25'), true);
});

test('3x por semana so cobra o dia quando nao da mais pra deixar pra depois', () => {
  const habit = { schedule: { kind: 'weekly', times: 3 } };
  // Sexta (2026-09-25): sobram sexta, sabado e domingo.
  assert.equal(mustDoToday(habit, '2026-09-25', { doneThisWeek: 0 }), true);
  assert.equal(mustDoToday(habit, '2026-09-25', { doneThisWeek: 1 }), false);
  // Sabado: sobram 2 dias.
  assert.equal(mustDoToday(habit, '2026-09-26', { doneThisWeek: 1 }), true);
  // Meta da semana batida.
  assert.equal(mustDoToday(habit, '2026-09-27', { doneThisWeek: 3 }), false);
  // Ja feito hoje.
  assert.equal(mustDoToday(habit, '2026-09-26', { doneThisWeek: 1, doneToday: true }), false);
});

test('diario e de dias fixos cobram todo dia agendado ainda nao feito', () => {
  const daily = { schedule: { kind: 'daily' } };
  const monWedFri = { schedule: { kind: 'days', days: [1, 3, 5] } };
  assert.equal(mustDoToday(daily, '2026-09-22', {}), true);
  assert.equal(mustDoToday(daily, '2026-09-22', { doneToday: true }), false);
  // Terca nao esta na lista; segunda esta.
  assert.equal(mustDoToday(monWedFri, '2026-09-22', {}), false);
  assert.equal(mustDoToday(monWedFri, '2026-09-21', {}), true);
});

const meditar = { id: 1, name: 'Meditar', schedule: { kind: 'daily' }, remindAt: '08:00' };
const config = { tz: TZ, dayStart: '00:00', habits: [meditar] };
const due = (cfg, state, local) => dueReminders(cfg, state, at(local)).map((r) => r.habit.id);

test('o lembrete sai no horario do habito ainda nao feito hoje', () => {
  assert.deepEqual(due(config, {}, '2026-09-22T07:59:00'), []);
  assert.deepEqual(due(config, {}, '2026-09-22T08:00:00'), [1]);
  assert.deepEqual(due(config, { day: '2026-09-22', doneToday: [1] }, '2026-09-22T08:00:00'), []);
  // O que foi feito ontem nao conta hoje.
  assert.deepEqual(due(config, { day: '2026-09-21', doneToday: [1] }, '2026-09-22T08:00:00'), [1]);
});

test('cada habito avisa uma vez so por dia', () => {
  const sentToday = { lastSent: { 1: at('2026-09-22T08:00:00').toISOString() } };
  assert.deepEqual(due(config, sentToday, '2026-09-22T08:05:00'), []);
  const sentYesterday = { lastSent: { 1: at('2026-09-21T08:00:00').toISOString() } };
  assert.deepEqual(due(config, sentYesterday, '2026-09-22T08:05:00'), [1]);
});

test('o semanal so lembra quando hoje ja e obrigatorio, com a contagem da semana atual', () => {
  const correr = { id: 2, name: 'Correr', schedule: { kind: 'weekly', times: 3 }, remindAt: '18:00' };
  const cfg = { ...config, habits: [correr] };
  // Sabado 26: sobram 2 dias.
  const thisWeek = (n) => ({ week: '2026-09-21', weekCounts: { 2: n } });
  assert.deepEqual(due(cfg, thisWeek(1), '2026-09-26T18:00:00'), [2]);
  assert.deepEqual(due(cfg, thisWeek(2), '2026-09-26T18:00:00'), []);
  // Contagem da semana passada nao vale: com 0 nesta semana, sabado cobra.
  assert.deepEqual(due(cfg, { week: '2026-09-14', weekCounts: { 2: 2 } }, '2026-09-26T18:00:00'), [2]);
});

test('com a virada as 05:00, lembrete de madrugada sai no fim do dia, nao no comeco', () => {
  const late = { ...meditar, remindAt: '01:00' };
  const cfg = { ...config, dayStart: '05:00', habits: [late] };
  assert.deepEqual(due(cfg, {}, '2026-09-22T06:00:00'), []);
  assert.deepEqual(due(cfg, {}, '2026-09-22T23:30:00'), []);
  assert.deepEqual(due(cfg, {}, '2026-09-23T01:00:00'), [1]);
  // Feito no dia 22 (antes da virada do 23) segura o lembrete.
  assert.deepEqual(due(cfg, { day: '2026-09-22', doneToday: [1] }, '2026-09-23T01:00:00'), []);
});

test('adiar lembra o mesmo habito de novo em 10 min, uma vez so', () => {
  const sent = at('2026-09-22T08:00:00').toISOString();
  const snoozed = { habitId: 1, at: at('2026-09-22T08:02:00').toISOString() };
  const state = { lastSent: { 1: sent }, snoozed };
  assert.deepEqual(due(config, state, '2026-09-22T08:11:00'), []);
  assert.deepEqual(due(config, state, '2026-09-22T08:12:00'), [1]);
  // Enviado o adiado, acabou.
  const resent = { lastSent: { 1: at('2026-09-22T08:12:00').toISOString() }, snoozed };
  assert.deepEqual(due(config, resent, '2026-09-22T08:30:00'), []);
  // Feito depois de adiar, nao lembra.
  assert.deepEqual(due(config, { ...state, day: '2026-09-22', doneToday: [1] }, '2026-09-22T08:12:00'), []);
});

test('o adiamento de ontem nao vale hoje', () => {
  const state = {
    lastSent: { 1: at('2026-09-22T08:00:00').toISOString() },
    snoozed: { habitId: 1, at: at('2026-09-21T08:02:00').toISOString() },
  };
  assert.deepEqual(due(config, state, '2026-09-22T09:00:00'), []);
});

test('o proximo lembrete e o mais cedo ainda pendente hoje, com o nome do habito', () => {
  const ler = { id: 2, name: 'Ler', schedule: { kind: 'daily' }, remindAt: '21:00' };
  const cfg = { ...config, habits: [ler, meditar] };
  assert.deepEqual(nextReminder(cfg, {}, at('2026-09-22T07:00:00')), { at: '08:00', names: ['Meditar'] });
  const sent = { lastSent: { 1: at('2026-09-22T08:00:00').toISOString() } };
  assert.deepEqual(nextReminder(cfg, sent, at('2026-09-22T09:00:00')), { at: '21:00', names: ['Ler'] });
  // Vencido e ainda nao enviado: e agora.
  assert.deepEqual(nextReminder(cfg, {}, at('2026-09-22T09:00:00')), { at: '09:00', names: ['Meditar'] });
  assert.equal(nextReminder(cfg, { day: '2026-09-22', doneToday: [1, 2] }, at('2026-09-22T09:00:00')), null);
});

test('config com os tres tipos de habito e valida, com ou sem horario', () => {
  const habits = [
    meditar,
    { id: 2, name: 'Academia', schedule: { kind: 'days', days: [1, 3, 5] }, remindAt: null },
    { id: 3, name: 'Correr', schedule: { kind: 'weekly', times: 3 }, remindAt: '18:30' },
  ];
  assert.equal(configError({ ...config, habits }), null);
  assert.equal(configError({ ...config, habits: [] }), null);
});

test('config malformada vinda da rede e recusada sem lancar', () => {
  const habit = (patch) => ({ ...config, habits: [{ ...meditar, ...patch }] });
  const broken = [
    null,
    'texto',
    {},
    { ...config, tz: 'Nao/Existe' },
    { ...config, dayStart: '25:00' },
    { ...config, habits: 'x' },
    { ...config, habits: [null] },
    habit({ id: 'um' }),
    habit({ name: '' }),
    habit({ remindAt: '8h' }),
    habit({ schedule: null }),
    habit({ schedule: { kind: 'mensal' } }),
    habit({ schedule: { kind: 'days', days: [] } }),
    habit({ schedule: { kind: 'days', days: [7] } }),
    habit({ schedule: { kind: 'weekly', times: 0 } }),
    habit({ schedule: { kind: 'weekly', times: 8 } }),
  ];
  for (const c of broken) assert.notEqual(configError(c), null, JSON.stringify(c));
});
