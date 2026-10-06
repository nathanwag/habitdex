import { dayOf, dueReminders, weekOf } from '../../www/js/reminder.js';

export const DEVICE_KEY = 'device';

const APP_NAME = 'HabitDex';

function reminderText({ config, week, weekCounts }, now, habit) {
  if (habit.schedule.kind !== 'weekly') return `${habit.name} ainda falta hoje`;
  const thisWeek = weekOf(dayOf(now, config.tz, config.dayStart));
  const done = week === thisWeek ? weekCounts?.[habit.id] ?? 0 : 0;
  return `${habit.name}: faltam ${habit.schedule.times - done} nesta semana`;
}

/** Payload no formato do Declarative Web Push (web_push: 8030, Safari 18.4+):
 *  o iOS mostra a notificacao sozinho mesmo se o service worker falhar, e o
 *  sw.js le o mesmo formato nas versoes anteriores.
 *
 *  O iOS nao mostra botoes em notificacao de web push, entao tocar nela ja e
 *  a resposta "fiz": o link abre a rota que marca o habito. O id (o instante
 *  do envio) impede que o mesmo toque marque duas vezes. */
export function reminderMessage(device, now, habit) {
  return {
    web_push: 8030,
    notification: {
      title: APP_NAME,
      body: reminderText(device, now, habit),
      navigate: `${device.appUrl}#/feito?habito=${habit.id}&lembrete=${encodeURIComponent(now.toISOString())}`,
      // Uma por habito: o lembrete de um nao substitui o de outro.
      tag: `habito-${habit.id}`,
      lang: 'pt-BR',
    },
  };
}

/** A notificacao de teste dos Ajustes: so abre o app. Marcar um habito por
 *  causa de um teste seria mentira no historico. */
export function testMessage(device) {
  return {
    web_push: 8030,
    notification: {
      title: APP_NAME,
      body: 'Lembretes funcionando',
      navigate: `${device.appUrl}#/`,
      tag: 'teste',
      lang: 'pt-BR',
    },
  };
}

/** Envia `message` ao aparelho. Devolve o status HTTP do push service (0 se
 *  nem chegou nele) e o motivo que ele deu na recusa. 404/410 significam que o
 *  aparelho desinstalou o app ou revogou a permissao: a assinatura e
 *  esquecida, e o app manda uma nova na proxima vez que for aberto. */
export async function deliver({ kv, send }, device, message) {
  let res;
  try {
    res = await send(device.subscription, message);
  } catch (err) {
    console.error('push falhou', err);
    return { status: 0, reason: String(err?.message ?? err) };
  }
  const { status } = res;
  if (status >= 200 && status < 300) return { status };
  if (status === 404 || status === 410) {
    await kv.put(DEVICE_KEY, JSON.stringify({ ...device, subscription: null }));
  }
  const reason = await rejectionReason(res);
  console.error('push recusado', status, reason);
  return { status, reason };
}

// A Apple responde {"reason":"BadJwtToken"}; o FCM responde texto.
async function rejectionReason(res) {
  const text = (await res.text?.().catch(() => '')) ?? '';
  try {
    return JSON.parse(text).reason ?? text;
  } catch {
    return text.trim().slice(0, 200);
  }
}

const ok = (status) => status >= 200 && status < 300;

/** Uma rodada do cron: envia cada lembrete vencido e grava quando enviou.
 *  `send(subscription, message)` e injetado — em producao e o Web Push. */
export async function handleCron({ kv, send, now }) {
  const device = await kv.get(DEVICE_KEY, 'json');
  if (!device?.subscription) return;
  const due = dueReminders(device.config, device, now);
  if (!due.length) return;

  const sentNow = {};
  for (const { habit } of due) {
    const { status } = await deliver({ kv, send }, device, reminderMessage(device, now, habit));
    // deliver ja esqueceu a assinatura; gravar aqui a traria de volta.
    if (status === 404 || status === 410) return;
    // Falha nao grava: a proxima rodada tenta de novo.
    if (ok(status)) sentNow[habit.id] = now.toISOString();
  }
  if (!Object.keys(sentNow).length) return;
  // Le de novo: o app pode ter sincronizado durante os envios, e o cron so e
  // dono do lastSent.
  const latest = await kv.get(DEVICE_KEY, 'json') ?? device;
  await kv.put(DEVICE_KEY, JSON.stringify({ ...latest, lastSent: { ...latest.lastSent, ...sentNow } }));
}
