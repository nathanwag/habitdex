/* Time — os ate 6 do time numa grade de 3 (o primeiro e o principal), a caixa
 * (congelada) e o Hall da Fama. Tocar num pokemon abre a ficha dele
 * (#/pokemon?uid=), onde ficam as acoes: principal, caixa e Doce Raro. */

import * as db from '../db.js';
import {
  game, sprite, nextEvolution, candy,
} from '../pokemon.js';
import { summary } from '../battle.js';
import {
  hero, statsCard, moveCard, learnList, matchupsCard, evoRow,
} from './mon-parts.js';
import {
  html, raw, setTop, toast, refresh, buzz, openSheet, node,
} from '../ui.js';

const PARTY_SIZE = 6;

// Acoes sobre um pokemon, gravadas como evento do dia.
function actionsFor({ dex, state, today }) {
  const uids = state.party.map((m) => m.uid);
  const name = (m) => dex.byId.get(m.species).name;
  const save = async (event, message) => {
    await db.addEvent({ ...event, day: today });
    buzz();
    toast(message);
    refresh();
  };
  return {
    candy: (m) => save({ type: 'candy', uid: m.uid }, `${name(m)} subiu para o nível ${m.level + 1}!`),
    lead: (m) => save({ type: 'party', uids: [m.uid, ...uids.filter((u) => u !== m.uid)] }, `${name(m)} agora é o principal`),
    out: (m) => save({ type: 'party', uids: uids.filter((u) => u !== m.uid) }, `${name(m)} foi para a caixa`),
    in: (m) => save({ type: 'party', uids: [...uids, m.uid] }, `${name(m)} entrou no time`),
  };
}

const canCandyOf = ({ party, candies }) => {
  const top = Math.max(...party.map((m) => m.level));
  return (m) => candies > 0 && m.level < top;
};

export async function render(view) {
  setTop({ title: 'Time' });
  const { dex, state } = await game();
  if (!state.started || state.needsStarter) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  const { party, box, candies } = state;
  const name = (m) => dex.byId.get(m.species).name;
  const canCandy = canCandyOf(state);
  const free = PARTY_SIZE - party.length;

  setTop({
    title: 'Time',
    actions: html`<button class="pill pill--candy" type="button" id="candy-info">${raw(candy(20))}${candies}</button>`,
  });
  document.getElementById('candy-info').onclick = () => openSheet('Doce Raro', node(html`
    <div class="candy-info">
      ${raw(candy(48))}
      <p><strong>Você tem ${candies}.</strong> Ganha 1 por dia na meta.</p>
      <p class="hint">Sobe 1 nível de quem está abaixo do mais alto do time. Use na ficha do pokémon.</p>
    </div>`));

  view.innerHTML = html`
    <ul class="party">
      ${raw(party.map((m, i) => html`
        <li><a class="party__mon${i === 0 ? ' is-lead' : ''}" href="#/pokemon?uid=${m.uid}">
          ${raw(i === 0 ? html`<span class="party__lead">PRINCIPAL</span>` : '')}
          ${raw(canCandy(m) ? html`<span class="party__candy" title="Pode receber doce">+</span>` : '')}
          <span class="party__pic"><img class="sprite" src="${sprite(m.species)}" alt=""${i ? ' loading="lazy"' : ''}></span>
          <span class="party__name">${name(m)}</span>
          <span class="party__lv">Nv ${m.level}</span>
        </a></li>`).join(''))}
      ${raw(html`<li class="party__free">vaga</li>`.repeat(free))}
    </ul>

    ${raw(box.length ? html`
      <section class="sec">
        <div class="row">
          <h2 class="section-title grow">Caixa</h2>
          <span class="hint">${box.length} pokémon</span>
        </div>
        <ul class="box">
          ${raw(box.map((m) => html`
            <li><a class="box__mon" href="#/pokemon?uid=${m.uid}">
              <span class="box__pic"><img class="sprite" src="${sprite(m.species)}" alt="" loading="lazy"></span>
              <span class="box__name">${name(m)} · ${m.level}</span>
            </a></li>`).join(''))}
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
}

/* ---------- Ficha ---------- */

export async function renderMon(view, params) {
  setTop({ title: 'Pokémon', back: '#/time' });
  const ctx = await game();
  const { dex, state } = ctx;
  const uid = Number(params.get('uid'));
  const party = state.party ?? [];
  const slot = party.findIndex((m) => m.uid === uid);
  const mon = party[slot] ?? state.box?.find((m) => m.uid === uid);
  if (!mon) {
    view.innerHTML = html`<p class="status">Esse pokémon não está no time nem na caixa.</p>
      <a class="btn btn--block" href="#/time">Voltar ao time</a>`;
    return;
  }

  const species = dex.byId.get(mon.species);
  setTop({ title: species.name, back: '#/time' });
  const info = summary(mon, dex);
  const evo = nextEvolution(dex, mon.species);
  const where = slot === 0 ? 'Principal' : slot > 0 ? 'No time' : 'Na caixa';
  const buttons = [
    ...(slot > 0 ? [['lead', 'Tornar principal', true], ['out', 'Mandar para a caixa']] : []),
    ...(slot === -1 && party.length < 6 ? [['in', 'Trazer para o time', true]] : []),
    ...(canCandyOf(state)(mon) ? [['candy', `Usar doce (Nv ${mon.level} → ${mon.level + 1})`]] : []),
  ];

  view.innerHTML = html`
    ${raw(hero(species, `Nv ${mon.level} · ${where}`))}

    ${raw(buttons.length ? html`
      <div class="sheet-actions">
        ${raw(buttons.map(([act, label, primary]) => html`
          <button class="btn btn--block${primary ? ' btn--primary' : ''}" type="button" data-act="${act}">${label}</button>`).join(''))}
      </div>` : '')}

    ${raw(statsCard(`Status no Nv ${mon.level}`, info.stats, species.stats))}

    <section class="sec">
      <h2 class="section-title">Golpes</h2>
      <ul class="moves">${raw(info.moves.map(moveCard).join(''))}</ul>
    </section>

    ${raw(learnList('Próximos golpes', info.upcoming))}

    <section class="sec">
      <h2 class="section-title">Evolução</h2>
      ${raw(evo
        ? evoRow(evo.to, dex.byId.get(evo.to).name,
          `no Nv ${evo.level}${evo.level > mon.level ? ` · faltam ${evo.level - mon.level}` : ''}`)
        : html`<p class="hint">Não evolui por nível.</p>`)}
    </section>

    ${raw(matchupsCard(info.matchups))}
  `;
  window.scrollTo(0, 0);

  const actions = actionsFor(ctx);
  view.onclick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    actions[btn.dataset.act](mon);
  };
}
