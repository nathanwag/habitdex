/* Time — os ate 6 do time numa grade de 3 (o primeiro e o principal), a caixa
 * (congelada) e o Hall da Fama. Tocar num pokemon abre a ficha dele
 * (#/pokemon?uid=), onde ficam as acoes: principal, caixa e Doce Raro. */

import * as db from '../db.js';
import {
  game, sprite, nextEvolution, candy, TYPE_NAMES,
} from '../pokemon.js';
import { summary } from '../battle.js';
import {
  html, raw, setTop, toast, refresh, buzz,
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

  view.innerHTML = html`
    <div class="row">
      <span class="grow hint">Cada dia na meta: time +1 nível e 1 doce.</span>
      <span class="pill pill--candy">${raw(candy(20))}${candies} doce${candies === 1 ? '' : 's'}</span>
    </div>

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
    <p class="hint">Toque para ver a ficha, trocar o principal ou usar doce.${party.some(canCandy) ? ' O + marca quem pode receber doce.' : ''}</p>

    ${raw(box.length ? html`
      <section class="sec">
        <div class="row">
          <h2 class="section-title grow">Caixa</h2>
          <span class="hint">${box.length} pokémon</span>
        </div>
        <p class="hint">Congelados: só sobem com doce.</p>
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

const STATS = [
  ['hp', 'PS'], ['atk', 'Ataque'], ['def', 'Defesa'],
  ['spa', 'At. Esp.'], ['spd', 'Def. Esp.'], ['spe', 'Velocidade'],
];
const CLASSES = { physical: 'Físico', special: 'Especial', status: 'Status' };
const typeTag = (t) => html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>`;
const times = (x) => `×${String(x).replace('.', ',')}`;
const dash = (v, unit = '') => (v == null ? '—' : `${v}${unit}`);

const moveCard = (m) => html`
  <li class="move${m.power ? '' : ' is-inert'}">
    <span class="move__head">
      <strong class="grow">${m.name}</strong>
      ${raw(typeTag(m.type))}
    </span>
    <span class="move__sub">${CLASSES[m.class] ?? m.class} · Poder ${dash(m.power)} · Precisão ${dash(m.accuracy, '%')} · PP ${dash(m.pp)}</span>
  </li>`;

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
  const total = STATS.reduce((sum, [k]) => sum + species.stats[k], 0);
  const byFactor = (keep) => Object.entries(info.matchups).filter(([, x]) => keep(x))
    .sort((a, b) => b[1] - a[1]);
  const group = (title, list) => (list.length ? html`
    <div class="matchup">
      <span class="matchup__title">${title}</span>
      <span class="matchup__list">${raw(list.map(([t, x]) => html`
        <span class="matchup__item">${raw(typeTag(t))}<small>${times(x)}</small></span>`).join(''))}</span>
    </div>` : '');

  const buttons = [
    ...(slot > 0 ? [['lead', 'Tornar principal', true], ['out', 'Mandar para a caixa']] : []),
    ...(slot === -1 && party.length < 6 ? [['in', 'Trazer para o time', true]] : []),
    ...(canCandyOf(state)(mon) ? [['candy', `Usar doce (Nv ${mon.level} → ${mon.level + 1})`]] : []),
  ];

  view.innerHTML = html`
    <section class="mon-hero">
      <span class="mon-hero__pic"><img class="sprite" src="${sprite(mon.species)}" alt=""></span>
      <span class="mon-hero__num">#${String(species.id).padStart(3, '0')}</span>
      <h2 class="mon-hero__name">${species.name}</h2>
      <span class="mon-hero__types">${raw(species.types.map(typeTag).join(''))}</span>
      <span class="mon-hero__sub">Nv ${mon.level} · ${where}</span>
    </section>

    ${raw(buttons.length ? html`
      <div class="sheet-actions">
        ${raw(buttons.map(([act, label, primary]) => html`
          <button class="btn btn--block${primary ? ' btn--primary' : ''}" type="button" data-act="${act}">${label}</button>`).join(''))}
      </div>` : '')}

    <section class="sec">
      <h2 class="section-title">Status no Nv ${mon.level}</h2>
      <div class="card card__pad">
        <ul class="statlist">
          ${raw(STATS.map(([k, label]) => html`
            <li class="mon-stat">
              <span class="mon-stat__label">${label}</span>
              <span class="mon-stat__value">${info.stats[k]}</span>
              <span class="mon-stat__bar"><span style="width:${Math.min(100, Math.round((species.stats[k] / 180) * 100))}%"></span></span>
              <span class="mon-stat__base">${species.stats[k]}</span>
            </li>`).join(''))}
        </ul>
        <p class="hint">A barra e o número da direita são a base da espécie (total ${total}). IV 31, sem EV, natureza neutra.</p>
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Golpes</h2>
      <ul class="moves">${raw(info.moves.map(moveCard).join(''))}</ul>
      ${raw(info.moves.some((m) => !m.power) ? html`<p class="hint">Golpe sem poder ainda não faz nada na batalha.</p>` : '')}
    </section>

    ${raw(info.upcoming.length ? html`
      <section class="sec">
        <h2 class="section-title">Próximos golpes</h2>
        <ul class="moves">${raw(info.upcoming.map((m) => html`
          <li class="move move--next">
            <span class="move__level">Nv ${m.level}</span>
            <span class="grow"><strong>${m.name}</strong><br>
              <span class="move__sub">${CLASSES[m.class] ?? m.class} · Poder ${dash(m.power)}</span></span>
            ${raw(typeTag(m.type))}
          </li>`).join(''))}</ul>
        <p class="hint">Fica com os 4 últimos aprendidos: o mais antigo sai.</p>
      </section>` : '')}

    <section class="sec">
      <h2 class="section-title">Evolução</h2>
      ${raw(evo ? html`
        <div class="evo card card__pad">
          <span class="evo__pic"><img class="sprite" src="${sprite(evo.to)}" alt="" loading="lazy"></span>
          <span class="grow"><strong>${dex.byId.get(evo.to).name}</strong><br>
            <span class="hint">no Nv ${evo.level}${evo.level > mon.level ? ` · faltam ${evo.level - mon.level}` : ''}</span></span>
        </div>` : html`<p class="hint">Não evolui por nível.</p>`)}
    </section>

    <section class="sec">
      <h2 class="section-title">Tipos contra ele</h2>
      <div class="card card__pad stack">
        ${raw(group('Fraco a', byFactor((x) => x > 1)))}
        ${raw(group('Resiste a', byFactor((x) => x > 0 && x < 1)))}
        ${raw(group('Imune a', byFactor((x) => x === 0)))}
      </div>
    </section>
  `;

  const actions = actionsFor(ctx);
  view.onclick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    actions[btn.dataset.act](mon);
  };
}
