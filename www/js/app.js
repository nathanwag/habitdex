/* Bootstrap e roteamento por hash (dispensa config de servidor). */

import * as db from './db.js';
import * as push from './push.js';
import { $, initSheet, closeSheet } from './ui.js';
import * as today from './views/today.js';
import * as habit from './views/habit.js';
import * as habitForm from './views/habit-form.js';
import * as habits from './views/habits.js';
import * as settings from './views/settings.js';
import * as team from './views/team.js';
import * as pokedex from './views/pokedex.js';
import * as gyms from './views/gyms.js';

const ROUTES = {
  '/': today.render,
  '/habito': habit.render,
  '/habito/novo': habitForm.renderNew,
  '/habito/editar': habitForm.renderEdit,
  '/habitos': habits.render,
  '/feito': today.doneFromReminder,
  '/ajustes': settings.render,
  '/ajustes/virada': settings.renderDayStart,
  '/ajustes/servidor': settings.renderServer,
  '/ajustes/meta': settings.renderGoal,
  '/time': team.render,
  '/pokedex': pokedex.render,
  '/ginasios': gyms.render,
  '/batalha': gyms.renderBattle,
};

// Abas do jogo: aparecem so nas telas principais.
const TABS = ['/', '/time', '/pokedex', '/ginasios', '/ajustes'];

function markTab(path) {
  const tabs = $('#tabs');
  tabs.hidden = !TABS.includes(path);
  for (const a of tabs.querySelectorAll('a')) {
    if (a.dataset.tab === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function route() {
  closeSheet();
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const view = $('#view');
  // Cada tela pendura seus handlers no mesmo #view; os da anterior nao podem sobrar.
  view.onclick = null;
  view.oninput = null;
  view.onchange = null;
  view.onsubmit = null;
  delete view.dataset.battle;
  markTab(ROUTES[path] ? path : '/');
  try {
    await (ROUTES[path] || ROUTES['/'])(view, new URLSearchParams(query));
  } catch (err) {
    console.error(err);
    view.textContent = `Algo deu errado: ${err.message}`;
  }
}

async function boot() {
  await db.init();
  initSheet();

  // O fuso acompanha o aparelho: quem viaja continua sendo lembrado no
  // horario local de onde esta.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (db.settings().tz !== tz) await db.saveSettings({ tz });

  window.addEventListener('hashchange', route);
  window.addEventListener('app:refresh', route);
  // Voltar ao app no dia seguinte tem que mostrar o dia novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      route();
      push.resync().catch(() => {});
    }
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW', err));
    // Toque numa notificacao com o app ja aberto: o sw.js manda o link pra ca.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.navigate) location.hash = new URL(e.data.navigate).hash;
    });
  }

  await route();
  push.resync().catch(() => {});
}

boot();
