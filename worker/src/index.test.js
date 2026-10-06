import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSend } from './index.js';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { VAPID_PUBLIC_KEY: b64url(raw), VAPID_PRIVATE_KEY: d };
}

// Assinatura de verdade (P-256 + 16 bytes de auth), como a do iPhone.
async function appleSubscription() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return {
    endpoint: 'https://web.push.apple.com/abc',
    keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
  };
}

const message = {
  web_push: 8030,
  notification: { title: 'Meditar', body: 'Falta hoje', tag: 'habito-1' },
};

test('o envio ao push service nao leva Topic (a Apple recusa com BadWebPushTopic)', async () => {
  const requests = [];
  const fakeFetch = async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 201 }); };
  const send = makeSend({ VAPID_SUBJECT: 'mailto:eu@exemplo.com', ...await vapidKeys() }, fakeFetch);

  const res = await send(await appleSubscription(), message);

  assert.equal(res.status, 201);
  assert.equal(requests.length, 1);
  const headers = new Headers(requests[0].init.headers);
  assert.equal(headers.has('topic'), false);
  assert.equal(headers.get('urgency'), 'high');
  assert.equal(headers.get('ttl'), '1800');
});
