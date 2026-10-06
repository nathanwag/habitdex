/* Unica camada que fala com o IndexedDB.
 *
 * Cuidado com Safari/WebKit: uma transacao e encerrada quando o event loop fica
 * ocioso. Os pedidos sao disparados de forma sincrona dentro da transacao e o
 * `await` acontece do lado de fora — nunca um `await` no meio de uma.
 */

import { reviseHabit } from './habits.js';
import { dayOf as dayIn } from './reminder.js';

// Nome do banco NAO muda: IndexedDB e chaveado por (origem, nome), e trocar
// a string abriria um banco novo e vazio. E neutro de proposito, pra marca
// poder mudar sem perder dados.
const DB_NAME = 'habitos';
const DB_VERSION = 2;

export const DEFAULT_SETTINGS = {
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  // Hora em que o dia vira (dayOf): antes dela, ainda e o dia anterior.
  dayStart: '00:00',
  // Segredo que o Worker exige em /api/*. Digitado uma vez em Ajustes.
  token: '',
  // Toque na notificacao: id do ultimo lembrete ja registrado, pra nao
  // contar o mesmo toque duas vezes, e o adiamento ({ habitId, at }).
  lastReminder: '',
  snoozed: null,
  // Meta do dia do jogo (0 a 1): abaixo dela, o time perde um nivel na virada.
  goal: 0.8,
};

let dbPromise = null;
let settingsCache = { ...DEFAULT_SETTINGS };

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
        // Um check por habito e dia: a chave composta impede duplicata.
        const checks = db.createObjectStore('checks', { keyPath: ['habitId', 'day'] });
        checks.createIndex('by_day', 'day');
      }
      if (event.oldVersion < 2) {
        // Escolhas do jogo (inicial, capturas, batalhas), com o resultado ja
        // sorteado: o game.js recalcula o resto a partir delas e dos checks.
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function init() {
  const rows = await tx('settings', 'readonly', (t) => req(t.objectStore('settings').getAll()));
  const saved = Object.fromEntries((await rows).map((r) => [r.key, r.value]));
  settingsCache = { ...DEFAULT_SETTINGS, ...saved };
}

/** Leitura sincrona: as telas leem ajustes o tempo todo. */
export const settings = () => settingsCache;

export async function saveSettings(patch) {
  settingsCache = { ...settingsCache, ...patch };
  await tx('settings', 'readwrite', (t) => {
    const store = t.objectStore('settings');
    for (const [key, value] of Object.entries(patch)) store.put({ key, value });
  });
}

/** Dia (AAAA-MM-DD) de `date` no fuso e na virada do dia dos ajustes. */
export const dayOf = (date = new Date()) => dayIn(date, settingsCache.tz, settingsCache.dayStart);

/** Todos os habitos, arquivados inclusive, na ordem escolhida. */
export async function habits() {
  const rows = await tx('habits', 'readonly', (t) => req(t.objectStore('habits').getAll()));
  return (await rows).sort((a, b) => a.order - b.order);
}

export async function habit(id) {
  return (await tx('habits', 'readonly', (t) => req(t.objectStore('habits').get(id)))) ?? null;
}

/** Cria (sem `id`, entra no fim da lista e nasce hoje) ou atualiza. Mudanca
 *  de frequencia ou de arquivado vira uma versao a partir de hoje: o passado
 *  do jogo nao muda. */
export async function saveHabit(data) {
  if (data.id != null) {
    const revised = reviseHabit((await habit(data.id)) ?? data, data, dayOf());
    await tx('habits', 'readwrite', (t) => { t.objectStore('habits').put(revised); });
    return revised;
  }
  const all = await habits();
  const today = dayOf();
  const created = {
    archived: false,
    remindAt: null,
    ...data,
    createdDay: today,
    order: all.length ? all.at(-1).order + 1 : 0,
  };
  created.versions = [{ from: today, schedule: created.schedule, archived: false }];
  const id = await tx('habits', 'readwrite', (t) => req(t.objectStore('habits').add(created)));
  return { ...created, id: await id };
}

/** Troca a posicao de dois habitos na lista. */
export async function swapOrder(a, b) {
  await tx('habits', 'readwrite', (t) => {
    const store = t.objectStore('habits');
    store.put({ ...a, order: b.order });
    store.put({ ...b, order: a.order });
  });
}

/** Marca (`done`) ou desmarca o habito no dia. */
export async function setCheck(habitId, day, done) {
  await tx('checks', 'readwrite', (t) => {
    const store = t.objectStore('checks');
    if (done) store.put({ habitId, day, at: new Date().toISOString() });
    else store.delete([habitId, day]);
  });
}

/** Todos os checks. Sao poucos (um por habito e dia), e a sequencia precisa
 *  olhar pra tras sem limite. */
export async function allChecks() {
  return tx('checks', 'readonly', (t) => req(t.objectStore('checks').getAll()));
}

/** Todos os checks de um habito. */
export async function checksOf(habitId) {
  const range = IDBKeyRange.bound([habitId, ''], [habitId, '￿']);
  return tx('checks', 'readonly', (t) => req(t.objectStore('checks').getAll(range)));
}

/** Escolhas do jogo, na ordem em que aconteceram. */
export async function events() {
  const rows = await tx('events', 'readonly', (t) => req(t.objectStore('events').getAll()));
  return (await rows).sort((a, b) => a.id - b.id);
}

export async function addEvent(event) {
  await tx('events', 'readwrite', (t) => { t.objectStore('events').add({ ...event, at: new Date().toISOString() }); });
}

/** Recomeca o jogo do zero; habitos e checks ficam. */
export async function clearEvents() {
  await tx('events', 'readwrite', (t) => { t.objectStore('events').clear(); });
}
