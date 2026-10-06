import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup } from './backup.js';

const data = {
  habits: [{ id: 1, name: 'Ler', icon: '📚', schedule: { kind: 'daily' }, createdDay: '2026-09-01', order: 0 }],
  checks: [{ habitId: 1, day: '2026-09-02', at: '2026-09-02T12:00:00.000Z' }],
  events: [{ id: 1, type: 'start', day: '2026-09-01', species: 4 }],
  settings: {
    tz: 'America/Sao_Paulo', dayStart: '05:00', goal: 0.8, token: 'segredo', lastReminder: 'x', snoozed: null,
  },
};

test('o backup leva habitos, checks, eventos e os ajustes do dia e da meta, mas nao o token', () => {
  const text = makeBackup(data, new Date('2026-10-06T12:00:00Z'));
  const file = JSON.parse(text);
  assert.equal(file.app, 'habitdex');
  assert.equal(file.exportedAt, '2026-10-06T12:00:00.000Z');
  assert.deepEqual(file.settings, { dayStart: '05:00', goal: 0.8 });
  assert.ok(!text.includes('segredo'));
  // Ida e volta: o que sai e o que entra.
  assert.deepEqual(parseBackup(text), {
    habits: data.habits, checks: data.checks, events: data.events, settings: { dayStart: '05:00', goal: 0.8 },
  });
});

test('arquivo que nao e um backup do app e recusado com uma mensagem', () => {
  assert.throws(() => parseBackup('isso nao e json'), /não é um backup/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'outro' })), /não é um backup/);
  const broken = JSON.parse(makeBackup(data, new Date()));
  broken.checks = [{ day: '2026-09-02' }];
  assert.throws(() => parseBackup(JSON.stringify(broken)), /não é um backup/);
});
