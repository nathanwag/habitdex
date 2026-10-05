/* Time — os ate 6 que sobem e caem de nivel, a caixa e o Hall da Fama. */

import {
  game, sprite, nextEvolution, TYPE_NAMES,
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
        <span class="mon__sub">${evo ? `Evolui para ${dex.byId.get(evo.to).name} no nível ${evo.level}` : 'Sem evolução por nível'}</span>
      </div>
    </li>`;
}

export async function render(view) {
  setTop({ title: 'Time' });
  const { dex, state } = await game();
  if (!state.started || state.needsStarter) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  view.innerHTML = html`
    <p class="status">${state.balls} Pokébola${state.balls === 1 ? '' : 's'} · cada dia na meta o time sobe 1 nível; abaixo dela, perde 1.</p>
    <section class="sec">
      <h2 class="section-title">Time (${state.party.length}/6)</h2>
      <ul class="card mons">${raw(state.party.map((m) => card(dex, m)).join(''))}</ul>
    </section>
    ${raw(state.box.length ? html`
      <section class="sec">
        <h2 class="section-title">Caixa (${state.box.length})</h2>
        <p class="hint">Ficam congelados: não sobem nem caem de nível.</p>
        <ul class="card mons">${raw(state.box.map((m) => card(dex, m)).join(''))}</ul>
      </section>` : '')}
    ${raw(state.hall.length ? html`
      <section class="sec">
        <h2 class="section-title">Hall da Fama</h2>
        ${raw(state.hall.map((h) => html`
          <div class="card card__pad stack">
            <strong>${dex.regions.find((r) => r.id === h.region).name}</strong>
            <ul class="lineup">${raw(h.team.map((m) => html`
              <li><img class="sprite" src="${sprite(m.species)}" alt="${dex.byId.get(m.species).name}" loading="lazy">
                <span class="data">Nv ${m.level}</span></li>`).join(''))}</ul>
          </div>`).join(''))}
      </section>` : '')}
  `;
}
