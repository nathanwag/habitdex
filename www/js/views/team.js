/* Time — o principal, os outros do time (ate 6, sobem e caem de nivel), a
 * caixa (congelada), o Doce Raro e o Hall da Fama. */

import * as db from '../db.js';
import {
  game, sprite, nextEvolution, candy,
} from '../pokemon.js';
import {
  html, raw, setTop, toast, refresh, buzz, openSheet, closeSheet, node,
} from '../ui.js';

const evoLine = (dex, mon) => {
  const evo = nextEvolution(dex, mon.species);
  return evo ? `evolui no ${evo.level}` : 'sem evolução por nível';
};

export async function render(view) {
  setTop({ title: 'Time' });
  const { dex, state, today } = await game();
  if (!state.started || state.needsStarter) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  const { party, box, candies } = state;
  const [lead, ...rest] = party;
  const top = Math.max(...party.map((m) => m.level));
  const name = (m) => dex.byId.get(m.species).name;
  const canCandy = (m) => candies > 0 && m.level < top;

  view.innerHTML = html`
    <div class="row">
      <span class="grow hint">Cada dia na meta: time +1 nível e 1 doce.</span>
      <span class="pill pill--candy">${raw(candy(20))}${candies} doce${candies === 1 ? '' : 's'}</span>
    </div>

    <section class="lead" aria-label="Principal">
      <span class="lead__pic"><img class="sprite" src="${sprite(lead.species)}" alt=""></span>
      <span>
        <span class="lead__kicker">PRINCIPAL</span><br>
        <span class="lead__name">${name(lead)}</span><br>
        <span class="lead__sub">Nv ${lead.level} · ${evoLine(dex, lead)}</span>
      </span>
    </section>

    ${raw(rest.length ? html`
      <ul class="team-grid">
        ${raw(rest.map((m) => html`
          <li class="team-card">
            <span class="team-card__pic"><img class="sprite" src="${sprite(m.species)}" alt="" loading="lazy"></span>
            <span class="team-card__name">${name(m)}</span>
            <span class="team-card__sub">Nv ${m.level}${m.level < top ? ` · ${top - m.level} abaixo do principal` : ''}</span>
            <span class="team-card__actions">
              <button class="chip-btn chip-btn--candy" type="button" data-act="candy" data-uid="${m.uid}" ${canCandy(m) ? '' : 'disabled'}>+1 doce</button>
              <button class="chip-btn chip-btn--icon" type="button" data-act="menu" data-uid="${m.uid}" aria-label="Opções de ${name(m)}">⋯</button>
            </span>
          </li>`).join(''))}
      </ul>` : html`<p class="status">Capture pokémon no Hoje para montar o time (até 6).</p>`)}

    ${raw(box.length ? html`
      <section class="sec">
        <h2 class="section-title">Caixa</h2>
        <p class="hint">Congelados: só sobem com doce. Toque para trazer ao time.</p>
        <ul class="box-row">
          ${raw(box.map((m) => html`
            <li><button class="box-item" type="button" data-act="box" data-uid="${m.uid}">
              <span class="box-item__pic"><img class="sprite" src="${sprite(m.species)}" alt="" loading="lazy"></span>
              ${name(m)} · ${m.level}
            </button></li>`).join(''))}
        </ul>
      </section>` : '')}

    ${raw(state.hall.length ? html`
      <section class="sec">
        <h2 class="section-title">Hall da Fama</h2>
        ${raw(state.hall.map((h) => html`
          <div class="card card__pad stack">
            <strong>${dex.regions.find((r) => r.id === h.region).name}</strong>
            <ul class="lineup">${raw(h.team.map((m) => html`
              <li><span class="lineup__pic"><img class="sprite" src="${sprite(m.species)}" alt="" loading="lazy"></span>
                ${name(m)} · ${m.level}</li>`).join(''))}</ul>
          </div>`).join(''))}
      </section>` : '')}
  `;

  const uids = party.map((m) => m.uid);
  const save = async (event, message) => {
    await db.addEvent({ ...event, day: today });
    buzz();
    closeSheet();
    toast(message);
    refresh();
  };
  const actions = {
    candy: (m) => save({ type: 'candy', uid: m.uid }, `${name(m)} subiu para o nível ${m.level + 1}!`),
    lead: (m) => save({ type: 'party', uids: [m.uid, ...uids.filter((u) => u !== m.uid)] }, `${name(m)} agora é o principal`),
    out: (m) => save({ type: 'party', uids: uids.filter((u) => u !== m.uid) }, `${name(m)} foi para a caixa`),
    in: (m) => save({ type: 'party', uids: [...uids, m.uid] }, `${name(m)} entrou no time`),
  };

  // Menu de um pokemon: as acoes que valem para ele, numa folha.
  const menu = (m, options) => {
    const body = openSheet(name(m), node(html`
      <div class="sheet-actions">
        ${raw(options.map(([act, label, primary]) => html`
          <button class="btn btn--block${primary ? ' btn--primary' : ''}" type="button" data-sheet="${act}">${label}</button>`).join(''))}
      </div>`));
    body.onclick = (e) => {
      const btn = e.target.closest('[data-sheet]');
      if (!btn) return;
      btn.disabled = true;
      actions[btn.dataset.sheet](m);
    };
  };

  view.onclick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const m = [...party, ...box].find((x) => x.uid === Number(btn.dataset.uid));
    if (btn.dataset.act === 'candy') {
      btn.disabled = true;
      actions.candy(m);
    } else if (btn.dataset.act === 'menu') {
      menu(m, [['lead', 'Tornar principal', true], ['out', 'Mandar para a caixa']]);
    } else if (btn.dataset.act === 'box') {
      menu(m, [
        ...(party.length < 6 ? [['in', 'Trazer para o time', true]] : []),
        ...(canCandy(m) ? [['candy', `Usar doce (Nv ${m.level} → ${m.level + 1})`]] : []),
      ]);
    }
  };
}
