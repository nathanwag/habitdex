import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOf, isScheduled, mustDoToday, weekOf,
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
