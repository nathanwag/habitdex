import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.js';
import { handleCron } from './cron.js';

const ORIGIN = 'https://habitos.exemplo.workers.dev';
const TOKEN = 'segredo-do-app';

const config = {
  tz: 'America/Sao_Paulo',
  dayStart: '00:00',
  habits: [{ id: 1, name: 'Meditar', schedule: { kind: 'daily' }, remindAt: '08:00' }],
};
const subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };

function fakeKv() {
  const data = new Map();
  return {
    async get(key, type) {
      const raw = data.get(key) ?? null;
      return type === 'json' && raw !== null ? JSON.parse(raw) : raw;
    },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
  };
}

function setup({ pushStatus = 201, pushBody = '' } = {}) {
  const sent = [];
  const deps = {
    kv: fakeKv(),
    token: TOKEN,
    vapidPublicKey: 'BPublica',
    send: async (sub, message) => { sent.push({ sub, message }); return new Response(pushBody, { status: pushStatus }); },
  };
  const call = (method, path, { body, token = TOKEN } = {}) => handleApi(new Request(ORIGIN + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), deps);
  return { call, sent, deps };
}

const subscribed = async (call) => (await (await call('GET', '/api/sync')).json()).subscribed;

test('sincronizar guarda a assinatura, e o estado passa a dizer que ha lembretes ativos', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', '/api/sync', { body: { subscription, config } })).status, 204);
  assert.equal(await subscribed(call), true);
});

test('sem o token certo a API recusa e nao guarda nada', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', '/api/sync', { body: { subscription, config }, token: 'errado' })).status, 401);
  assert.equal((await call('PUT', '/api/sync', { body: { subscription, config }, token: null })).status, 401);
  assert.equal(await subscribed(call), false);
});

test('config invalida e recusada com a mensagem do problema', async () => {
  const { call } = setup();
  const res = await call('PUT', '/api/sync', {
    body: { subscription, config: { ...config, habits: [{ ...config.habits[0], name: '' }] } },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nome/i);
  assert.equal(await subscribed(call), false);
});

test('corpo que nao e JSON e recusado', async () => {
  const res = await handleApi(new Request(`${ORIGIN}/api/sync`, {
    method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'nao e json',
  }), { kv: fakeKv(), token: TOKEN });
  assert.equal(res.status, 400);
});

const at = (local) => new Date(`${local}-03:00`);

test('sincronizar de novo nao apaga o registro do ultimo lembrete enviado', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T08:00:00') });

  // Abriu o app sem fazer nada, sem mandar a assinatura de novo.
  await call('PUT', '/api/sync', { body: { config, day: '2026-09-22', doneToday: [] } });
  await handleCron({ ...deps, now: at('2026-09-22T08:05:00') });

  assert.equal(await subscribed(call), true);
  assert.equal(sent.length, 1);
});

test('marcar o habito no app segura o lembrete', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config, day: '2026-09-22', doneToday: [1] } });
  await handleCron({ ...deps, now: at('2026-09-22T08:00:00') });
  assert.equal(sent.length, 0);
});

test('adiar pelo app faz o cron lembrar o mesmo habito de novo em 10 min', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T08:00:00') });

  const snoozed = { habitId: 1, at: at('2026-09-22T08:01:00').toISOString() };
  await call('PUT', '/api/sync', { body: { config, snoozed } });
  await handleCron({ ...deps, now: at('2026-09-22T08:10:00') });
  assert.equal(sent.length, 1);
  await handleCron({ ...deps, now: at('2026-09-22T08:15:00') });
  assert.equal(sent.length, 2);
});

test('a notificacao abre o app na mesma origem da API', async () => {
  const { call, sent, deps } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await handleCron({ ...deps, now: at('2026-09-22T08:00:00') });
  assert.ok(sent[0].message.notification.navigate.startsWith(`${ORIGIN}/#`));
});

test('desativar os lembretes (assinatura null) esquece a assinatura', async () => {
  const { call } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });
  await call('PUT', '/api/sync', { body: { subscription: null, config } });
  assert.equal(await subscribed(call), false);
});

test('a chave publica VAPID e servida sem token: o app precisa dela antes de assinar', async () => {
  const { call } = setup();
  const res = await call('GET', '/api/vapid-public-key', { token: null });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).key, 'BPublica');
});

test('testar envia uma notificacao na hora, que so abre o app sem marcar nada', async () => {
  const { call, sent } = setup();
  await call('PUT', '/api/sync', { body: { subscription, config } });

  const res = await call('POST', '/api/test');

  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  const { web_push: format, notification } = sent[0].message;
  assert.equal(format, 8030);
  assert.equal(notification.title, 'Hábitos');
  assert.equal(notification.navigate, `${ORIGIN}/#/`);
});

test('testar sem lembretes ativos avisa que falta ativar', async () => {
  const { call, sent } = setup();
  const res = await call('POST', '/api/test');
  assert.equal(res.status, 404);
  assert.equal(sent.length, 0);
});

test('testar com assinatura expirada a esquece e avisa o app', async () => {
  const { call } = setup({ pushStatus: 410 });
  await call('PUT', '/api/sync', { body: { subscription, config } });
  assert.equal((await call('POST', '/api/test')).status, 410);
  assert.equal(await subscribed(call), false);
});

test('testar recusado pelo push service mostra o status e o motivo que ele deu', async () => {
  const { call } = setup({ pushStatus: 403, pushBody: '{"reason":"BadJwtToken"}' });
  await call('PUT', '/api/sync', { body: { subscription, config } });

  const res = await call('POST', '/api/test');

  assert.equal(res.status, 502);
  const { error } = await res.json();
  assert.match(error, /403/);
  assert.match(error, /BadJwtToken/);
});
