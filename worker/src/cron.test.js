import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCron } from './cron.js';

const at = (local) => new Date(`${local}-03:00`);

const meditar = { id: 1, name: 'Meditar', schedule: { kind: 'daily' }, remindAt: '08:00' };
const ler = { id: 2, name: 'Ler', schedule: { kind: 'daily' }, remindAt: '08:00' };
const config = { tz: 'America/Sao_Paulo', dayStart: '00:00', habits: [meditar] };

const subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const appUrl = 'https://habitdex.exemplo.workers.dev/';

function fakeKv(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    async get(key, type) {
      const raw = data.get(key) ?? null;
      return type === 'json' && raw !== null ? JSON.parse(raw) : raw;
    },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
  };
}

// O push service e a fronteira externa: o fake so registra o que foi enviado.
function fakeSender(status = 201) {
  const sent = [];
  const send = async (sub, message) => { sent.push({ sub, message }); return { status }; };
  return { send, sent };
}

test('lembrete vencido e enviado, e nao se repete na rodada seguinte', async () => {
  const kv = fakeKv({ device: { subscription, config, appUrl } });
  const { send, sent } = fakeSender();

  await handleCron({ kv, send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:05:00') });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].sub, subscription);
  // Formato do Declarative Web Push (Safari 18.4+): o iOS mostra a notificacao
  // mesmo que o service worker falhe. Versoes antigas caem no sw.js.
  const { web_push: format, notification } = sent[0].message;
  assert.equal(format, 8030);
  assert.equal(notification.body, 'Meditar ainda falta hoje');
  // Tocar marca o habito: o link leva o id dele e um id do envio.
  const link = new URL(notification.navigate);
  assert.equal(link.origin + link.pathname, appUrl);
  assert.match(link.hash, /^#\/feito\?habito=1&lembrete=./);
});

test('cada habito vencido vira uma notificacao, e so o que falhou tenta de novo', async () => {
  const kv = fakeKv({ device: { subscription, config: { ...config, habits: [meditar, ler] }, appUrl } });
  const sent = [];
  // O primeiro envio do Meditar falha; o resto passa.
  const send = async (sub, message) => {
    sent.push(message.notification.tag);
    return { status: sent.length === 1 ? 500 : 201 };
  };

  await handleCron({ kv, send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:05:00') });
  await handleCron({ kv, send, now: at('2026-09-22T08:10:00') });

  assert.deepEqual(sent, ['habito-1', 'habito-2', 'habito-1']);
});

test('o semanal fala do que falta na semana', async () => {
  const correr = { id: 3, name: 'Correr', schedule: { kind: 'weekly', times: 3 }, remindAt: '18:00' };
  const kv = fakeKv({
    device: {
      subscription, config: { ...config, habits: [correr] }, appUrl, week: '2026-09-21', weekCounts: { 3: 1 },
    },
  });
  const { send, sent } = fakeSender();
  // Sabado: faltam 2 e sobram 2 dias.
  await handleCron({ kv, send, now: at('2026-09-26T18:00:00') });
  assert.equal(sent[0].message.notification.body, 'Correr: faltam 2 nesta semana');
});

test('assinatura expirada (410) e esquecida: as rodadas seguintes nao tentam de novo', async () => {
  const kv = fakeKv({ device: { subscription, config: { ...config, habits: [meditar, ler] }, appUrl } });
  const gone = fakeSender(410);

  await handleCron({ kv, send: gone.send, now: at('2026-09-22T08:00:00') });
  await handleCron({ kv, send: gone.send, now: at('2026-09-22T08:05:00') });

  assert.equal(gone.sent.length, 1);
  assert.equal((await kv.get('device', 'json')).subscription, null);
});
