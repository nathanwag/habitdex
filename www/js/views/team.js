/* Time — os ate 6 que sobem e caem de nivel (o primeiro e o principal), a
 * caixa, o Doce Raro e o Hall da Fama. */

import * as db from '../db.js';
import {
  game, sprite, nextEvolution, TYPE_NAMES,
} from '../pokemon.js';
import {
  html, raw, setTop, toast, refresh, buzz,
} from '../ui.js';

function types(p) {
  return raw(p.types.map((t) => html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>`).join(''));
}

function card(dex, mon, actions) {
  const p = dex.byId.get(mon.species);
  const evo = nextEvolution(dex, mon.species);
  return html`
    <li class="mon">
      <div class="mon__pic"><img class="sprite" src="${sprite(mon.species)}" alt="" loading="lazy"></div>
      <div class="mon__body">
        <div class="mon__row"><strong>${p.name}</strong><span class="data">Nv ${mon.level}</span></div>
        <div class="mon__types">${types(p)}</div>
        <span class="mon__sub">${evo ? `Evolui para ${dex.byId.get(evo.to).name} no nível ${evo.level}` : 'Sem evolução por nível'}</span>
        ${raw(actions.length ? html`<div class="mon__actions">${raw(actions.join(''))}</div>` : '')}
      </div>
    </li>`;
}

const action = (label, name, uid, disabled = false) => html`
  <button class="chip-btn" type="button" data-act="${name}" data-uid="${uid}" ${disabled ? 'disabled' : ''}>${label}</button>`;

export async function render(view) {
  setTop({ title: 'Time' });
  const { dex, state, today } = await game();
  if (!state.started || state.needsStarter) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  const { party, box, candies } = state;
  const top = Math.max(...party.map((m) => m.level));
  const candyFor = (m) => (candies > 0 && m.level < top ? [action(`Doce Raro (${candies})`, 'candy', m.uid)] : []);

  const partyCards = party.map((m, i) => card(dex, m, [
    ...(i > 0 ? [action('Principal', 'lead', m.uid)] : []),
    ...(party.length > 1 ? [action('Para a caixa', 'out', m.uid)] : []),
    ...candyFor(m),
  ]));
  const boxCards = box.map((m) => card(dex, m, [
    action(party.length < 6 ? 'Para o time' : 'Time cheio', 'in', m.uid, party.length >= 6),
    ...candyFor(m),
  ]));

  view.innerHTML = html`
    <p class="status"><strong>${candies}</strong> Doce${candies === 1 ? '' : 's'} Raro${candies === 1 ? '' : 's'} ·
      ${state.balls} Pokébola${state.balls === 1 ? '' : 's'}. Cada dia na meta o time sobe 1 nível e você ganha 1 doce;
      o doce sobe quem está abaixo do mais alto (nível ${top}).</p>
    <section class="sec">
      <h2 class="section-title">Time (${party.length}/6) · o primeiro é o principal</h2>
      <ul class="card mons">${raw(partyCards.join(''))}</ul>
    </section>
    ${raw(box.length ? html`
      <section class="sec">
        <h2 class="section-title">Caixa (${box.length})</h2>
        <p class="hint">Ficam congelados: só sobem com Doce Raro.</p>
        <ul class="card mons">${raw(boxCards.join(''))}</ul>
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

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const uid = Number(btn.dataset.uid);
    const uids = party.map((m) => m.uid);
    const name = (m) => dex.byId.get(m.species).name;
    const mon = [...party, ...box].find((m) => m.uid === uid);
    buzz();
    if (btn.dataset.act === 'candy') {
      await db.addEvent({ type: 'candy', day: today, uid });
      toast(`${name(mon)} subiu para o nível ${mon.level + 1}!`);
    } else if (btn.dataset.act === 'lead') {
      await db.addEvent({ type: 'party', day: today, uids: [uid, ...uids.filter((u) => u !== uid)] });
      toast(`${name(mon)} agora é o principal`);
    } else if (btn.dataset.act === 'out') {
      await db.addEvent({ type: 'party', day: today, uids: uids.filter((u) => u !== uid) });
      toast(`${name(mon)} foi para a caixa`);
    } else if (btn.dataset.act === 'in') {
      await db.addEvent({ type: 'party', day: today, uids: [...uids, uid] });
      toast(`${name(mon)} entrou no time`);
    }
    refresh();
  };
}
