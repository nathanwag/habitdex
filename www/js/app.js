/* Bootstrap e roteamento por hash (dispensa config de servidor). */

import { $, initSheet, closeSheet } from './ui.js';
import * as today from './views/today.js';

const ROUTES = {
  '/': today.render,
};

async function route() {
  closeSheet();
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const view = $('#view');
  // Cada tela pendura seus handlers no mesmo #view; os da anterior nao podem sobrar.
  view.onclick = null;
  view.oninput = null;
  view.onchange = null;
  try {
    await (ROUTES[path] || ROUTES['/'])(view, new URLSearchParams(query));
  } catch (err) {
    console.error(err);
    view.textContent = `Algo deu errado: ${err.message}`;
  }
}

async function boot() {
  initSheet();

  window.addEventListener('hashchange', route);
  window.addEventListener('app:refresh', route);
  // Voltar ao app no dia seguinte tem que mostrar o dia novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') route();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW', err));
  }

  await route();
}

boot();
