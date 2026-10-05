/* Time — os ate 6 que ganham XP e a caixa. */

import {
  game, sprite, xpProgress, nextEvolution, TYPE_NAMES,
} from '../pokemon.js';
import { html, raw, setTop } from '../ui.js';

function types(p) {
  return raw(p.types.map((t) => html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>`).join(''));
}

function card(dex, mon) {
  const p = dex.byId.get(mon.species);
  const evo = nextEvolution(dex, mon.species);
  return html`
    <li class="mon">
      <div class="mon__pic"><img class="sprite" src="${sprite(mon.species)}" alt="" loading="lazy"></div>
      <div class="mon__body">
        <div class="mon__row"><strong>${p.name}</strong><span class="data">Nv ${mon.level}</span></div>
        <div class="mon__types">${types(p)}</div>
        <div class="xp"><div class="xp__fill" style="width: ${xpProgress(dex, mon) * 100}%"></div></div>
        <span class="mon__sub">${evo ? `Evolui para ${dex.byId.get(evo.to).name} no nível ${evo.level}` : 'Sem evolução por nível'}</span>
      </div>
    </li>`;
}

export async function render(view) {
  setTop({ title: 'Time' });
  const { dex, state } = await game();
  if (!state.started) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  view.innerHTML = html`
    <p class="status">${state.balls} Pokébola${state.balls === 1 ? '' : 's'} · o XP de cada hábito é dividido entre o time.</p>
    <section class="sec">
      <h2 class="section-title">Time (${state.party.length}/6)</h2>
      <ul class="card mons">${raw(state.party.map((m) => card(dex, m)).join(''))}</ul>
    </section>
    ${raw(state.box.length ? html`
      <section class="sec">
        <h2 class="section-title">Caixa (${state.box.length})</h2>
        <p class="hint">Não ganham XP, mas também perdem nível nos dias abaixo da meta.</p>
        <ul class="card mons">${raw(state.box.map((m) => card(dex, m)).join(''))}</ul>
      </section>` : '')}
  `;
}
