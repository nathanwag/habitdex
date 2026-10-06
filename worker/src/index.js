import { buildPushPayload } from '@block65/webcrypto-web-push';
import { handleApi } from './api.js';
import { handleCron } from './cron.js';

export function makeSend(env, fetchFn = fetch) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  return async (subscription, message) => {
    const payload = await buildPushPayload({
      data: message,
      // Lembrete entregue horas depois so atrapalha. Sem topic: a Apple recusa
      // qualquer push com Topic (400 BadWebPushTopic). Quem troca o aviso
      // antigo do mesmo habito e o tag, no aparelho.
      options: { ttl: 30 * 60, urgency: 'high' },
    }, subscription, vapid);
    return fetchFn(subscription.endpoint, payload);
  };
}

const deps = (env) => ({
  kv: env.STATE,
  token: env.APP_TOKEN,
  vapidPublicKey: env.VAPID_PUBLIC_KEY,
  send: makeSend(env),
});

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, deps(env));
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron({ ...deps(env), now: new Date(event.scheduledTime) }));
  },
};
