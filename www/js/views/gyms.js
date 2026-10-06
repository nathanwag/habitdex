/* Ginasios — a liga em sequencia, regiao por regiao, e a batalha animada. A
 * tela da Liga tem as 9 regioes em abas no topo (#/ginasios?regiao=), e cada
 * uma mostra o estojo de insignias e a Elite Four, com o As de cada chefe. Na
 * regiao atual vem antes o proximo desafio. */

import * as db from '../db.js';
import { createBattle, turn } from '../battle.js';
import { game, sprite, TYPE_NAMES } from '../pokemon.js';
import {
  html, raw, setTop, buzz,
} from '../ui.js';

const KIND = { gym: 'Ginásio', elite: 'Elite Four', champion: 'Campeão' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const typeTag = (t) => (t ? html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>` : '');
// O As e o ultimo do time, como nos jogos.
const aceOf = (team) => team.at(-1);
const levelRange = (r) => {
  const levels = [...r.gyms, ...r.elite, r.champion].flatMap((b) => b.team.map((p) => p.level));
  return `Nv ${Math.min(...levels)}–${Math.max(...levels)}`;
};
// Passos de uma regiao que nao e a atual, direto do gyms.json. Na atual vale
// `challenge.steps`, que ja tem o time na variante do seu inicial.
const rawSteps = (r) => [
  ...r.gyms.map((b, index) => ({ kind: 'gym', index, ...b })),
  ...r.elite.map((b, index) => ({ kind: 'elite', index, ...b })),
  { kind: 'champion', index: 0, ...r.champion },
];
const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export async function render(view, params) {
  setTop({ title: 'Liga' });
  const { dex, state } = await game();
  if (!state.started) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  const ch = state.challenge;
  const { regions } = dex;
  // Sem desafio, todas as ligas foram vencidas.
  const atIdx = ch ? regions.findIndex((r) => r.id === ch.region) : regions.length;
  const wanted = regions.findIndex((r) => r.id === params?.get('regiao'));
  const idx = wanted === -1 ? Math.min(atIdx, regions.length - 1) : wanted;
  const region = regions[idx];
  const isHere = idx === atIdx;
  const steps = isHere ? ch.steps : rawSteps(region);
  // Indice do proximo chefe: na regiao atual o do desafio; antes dela todos
  // vencidos; depois, nenhum.
  const current = isHere ? ch.current : idx < atIdx ? steps.length : -1;
  const status = (i) => (i < current ? 'is-done' : i === current ? 'is-current' : 'is-locked');
  const gyms = steps.filter((s) => s.kind === 'gym');
  const league = steps.filter((s) => s.kind !== 'gym');
  const won = Math.max(0, Math.min(current, gyms.length));
  const name = (id) => dex.byId.get(id).name;

  const leader = (s) => {
    const i = steps.indexOf(s);
    return html`
      <li class="leader ${status(i)}">
        ${raw(i < current ? '<span class="leader__mark" aria-label="Vencido">✓</span>' : '')}
        <span class="leader__pic"><img class="sprite" src="${sprite(aceOf(s.team).species)}" alt="" loading="lazy"></span>
        <span class="leader__name">${s.name}</span>
        ${raw(s.kind === 'gym' ? typeTag(s.type) : '')}
      </li>`;
  };

  let next = '';
  if (isHere) {
    const ace = aceOf(ch.team);
    const myTop = state.party.length ? `Nv ${Math.max(...state.party.map((m) => m.level))}` : 'sem time';
    next = html`
      <section class="next-boss">
        <span class="next-boss__pic"><img class="sprite" src="${sprite(ace.species)}" alt=""></span>
        <span class="grow">
          <span class="next-boss__kicker">PRÓXIMO · ${KIND[ch.kind].toUpperCase()}${ch.kind === 'gym' ? ` ${ch.index + 1}` : ''}</span>
          <span class="row"><span class="next-boss__name grow">${ch.name}</span>${raw(typeTag(ch.type))}</span>
          <span class="next-boss__ace">Ás: ${name(ace.species)} · Nv ${ace.level}</span>
          <span class="next-boss__vs">Seu mais forte: ${myTop}</span>
          ${raw(ch.canBattle
            ? html`<a class="btn btn--primary btn--block" href="#/batalha">Desafiar</a>`
            : html`<button class="btn btn--block" type="button" disabled>Perdeu hoje · tente amanhã</button>`)}
        </span>
      </section>`;
  }
  const sub = idx < atIdx ? 'Campeão vencido'
    : isHere ? `${won} de ${gyms.length} insígnias`
      : `Bloqueada · vença ${regions[idx - 1].name} antes`;

  view.innerHTML = html`
    <nav class="league-tabs" aria-label="Regiões">
      ${raw(regions.map((r, i) => html`
        <a class="league-tab${i === idx ? ' is-on' : ''}${i > atIdx ? ' is-locked' : ''}" href="#/ginasios?regiao=${r.id}"${raw(i === idx ? ' aria-current="page"' : '')}>
          ${raw(i < atIdx ? '<span class="league-tab__done">✓</span>' : i > atIdx ? LOCK : '<span class="league-tab__here"></span>')}${r.name}
        </a>`).join(''))}
    </nav>

    <section class="region-card${idx > atIdx ? ' is-locked' : ''}">
      <span class="grow">
        <span class="region-card__name">${region.name}</span><br>
        <span class="region-card__sub">${region.game} · ${levelRange(region)}</span><br>
        <span class="region-card__sub">${sub}</span>
      </span>
      <span class="region-card__badges">${raw(gyms.map((_, i) => `<span class="badge-hex${i < won ? ' is-won' : ''}"></span>`).join(''))}</span>
    </section>

    ${raw(next)}

    <section class="sec">
      <h2 class="section-title">Ginásios</h2>
      <ul class="leaders" style="--cols: ${gyms.length > 8 ? 5 : 4}">${raw(gyms.map(leader).join(''))}</ul>
    </section>

    <section class="sec">
      <h2 class="section-title">Liga Pokémon</h2>
      <ul class="leaders" style="--cols: ${league.length}">${raw(league.map(leader).join(''))}</ul>
    </section>
  `;

  // A aba escolhida fica a vista na barra de regioes.
  const tabs = view.querySelector('.league-tabs');
  const on = tabs.querySelector('.is-on');
  tabs.scrollLeft = on.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
}

/* ---------- Batalha ---------- */

function side(dex, fighter, foe) {
  const p = dex.byId.get(fighter.species);
  return html`
    <div class="hud hud--${foe ? 'foe' : 'me'}" data-hud="${foe ? 1 : 0}">
      <div class="hud__row"><strong data-name>${p.name}</strong><span class="data" data-level>Nv ${fighter.level}</span></div>
      <div class="hp"><div class="hp__fill" data-hp style="width: ${(fighter.hp / fighter.stats.hp) * 100}%"></div></div>
      <span class="hud__sub" data-hptext>${foe ? '' : `${fighter.hp}/${fighter.stats.hp}`}</span>
    </div>`;
}

const dots = (team, n) => html`<span class="dots" data-dots="${n}">${raw(team.map(() => '<i></i>').join(''))}</span>`;

export async function renderBattle(view) {
  setTop({ title: 'Batalha', back: '#/ginasios' });
  const { dex, state, today } = await game();
  const ch = state.challenge;
  if (!state.started || !ch || !ch.canBattle || !state.party.length) { location.hash = '#/ginasios'; return; }

  // A luta inteira e sorteada e gravada antes de animar: sair no meio nao da
  // outra chance no mesmo dia.
  const start = createBattle(state.party.map((m) => ({ species: m.species, level: m.level })), ch.team, dex);
  const turns = [];
  let end = start;
  for (let i = 0; end.winner === null && i < 500; i++) {
    const r = turn(end, Math.random);
    turns.push(r);
    end = r.state;
  }
  const won = end.winner === 0;
  await db.addEvent({ type: 'battle', day: today, won, region: ch.region, boss: ch.name });

  const token = String(Date.now());
  view.dataset.battle = token;
  const [me, foe] = start.sides.map((s) => s.team[0]);
  view.innerHTML = html`
    <section class="arena arena--battle">
      ${raw(side(dex, foe, true))}
      <div class="arena__foe" data-pic="1"><img class="sprite" src="${sprite(foe.species)}" alt=""></div>
      <div class="arena__me" data-pic="0"><img class="sprite sprite--back" src="${sprite(me.species, 'back')}" alt=""></div>
      ${raw(side(dex, me, false))}
    </section>
    <div class="row battle__teams">${raw(dots(start.sides[0].team, 0))}<span class="grow"></span>${raw(dots(start.sides[1].team, 1))}</div>
    <p class="battle__log card" data-log aria-live="polite">${ch.name} quer batalhar!</p>
    <button class="btn btn--ghost btn--block" type="button" data-skip>Pular animação</button>
    <div data-result></div>
  `;

  let skip = false;
  view.onclick = (e) => { if (e.target.closest('[data-skip]')) skip = true; };
  // Saiu da tela no meio da luta: o #view ja e de outra rota, a animacao para.
  const alive = () => view.dataset.battle === token && Boolean(view.querySelector('[data-log]'));
  const $ = (sel) => view.querySelector(sel);
  const nameOf = (f) => dex.byId.get(f.species).name;
  const log = (text) => { $('[data-log]').textContent = text; };

  const paint = (st) => {
    st.sides.forEach((s, i) => {
      const f = s.team[s.active];
      const hud = $(`[data-hud="${i}"]`);
      hud.querySelector('[data-name]').textContent = nameOf(f);
      hud.querySelector('[data-level]').textContent = `Nv ${f.level}`;
      const fill = hud.querySelector('[data-hp]');
      fill.style.width = `${(f.hp / f.stats.hp) * 100}%`;
      fill.classList.toggle('is-low', f.hp / f.stats.hp < 0.25);
      if (i === 0) hud.querySelector('[data-hptext]').textContent = `${f.hp}/${f.stats.hp}`;
      const img = $(`[data-pic="${i}"] img`);
      const src = sprite(f.species, i === 0 ? 'back' : 'front');
      if (!img.src.endsWith(src.slice(1))) img.src = src;
      $(`[data-pic="${i}"]`).classList.toggle('is-faint', f.hp === 0);
      $(`[data-dots="${i}"]`).querySelectorAll('i').forEach((d, k) => d.classList.toggle('is-out', s.team[k].hp === 0));
    });
  };
  const flash = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  let shown = start;
  for (const { state: after, events } of turns) {
    if (!alive()) return;
    // Aplica o turno evento a evento sobre uma copia, para a vida baixar no
    // momento do golpe.
    const live = structuredClone(shown);
    for (const ev of events) {
      if (skip || !alive()) break;
      const s = live.sides[ev.side];
      const f = s.team[s.active];
      if (ev.move) {
        const move = dex.moves[ev.move]?.name ?? 'Struggle';
        if (ev.missed) {
          log(`${nameOf(f)} usou ${move}, mas errou!`);
        } else {
          const target = live.sides[1 - ev.side];
          const t = target.team[target.active];
          t.hp = Math.max(0, t.hp - ev.damage);
          const extra = ev.effectiveness === 0 ? ` Não afeta ${nameOf(t)}...`
            : ev.effectiveness > 1 ? ' É super efetivo!' : ev.effectiveness < 1 ? ' Não é muito efetivo...' : '';
          log(`${nameOf(f)} usou ${move}!${ev.crit ? ' Acerto crítico!' : ''}${extra}`);
          flash($(`[data-pic="${ev.side}"]`), 'is-lunge');
          flash($(`[data-pic="${1 - ev.side}"]`), 'is-hit');
          buzz(15);
        }
        paint(live);
        await sleep(1100);
      } else if (ev.fainted) {
        log(`${nameOf(f)} desmaiou!`);
        paint(live);
        await sleep(900);
      } else if ('switchedTo' in ev) {
        s.active = ev.switchedTo;
        const next = s.team[s.active];
        log(ev.side === 0 ? `Vai, ${nameOf(next)}!` : `${ch.name} mandou ${nameOf(next)}!`);
        paint(live);
        await sleep(900);
      }
    }
    if (skip) break;
    shown = after;
    paint(shown);
  }
  if (!alive()) return;
  paint(end);
  log(won ? `Você venceu ${ch.name}!` : `${ch.name} venceu.`);
  $('[data-skip]').remove();
  $('[data-result]').innerHTML = html`
    <section class="card card__pad stack">
      <p><strong>${won ? `Vitória contra ${ch.name}!` : 'Derrota.'}</strong>
        ${won ? (ch.kind === 'champion' ? 'Liga vencida! Seu time vai para o Hall da Fama e a próxima região começa com um inicial novo.' : 'O próximo desafio já está liberado.')
          : 'Dá para tentar de novo amanhã. Até lá, cada hábito feito deixa o time mais forte.'}</p>
      <a class="btn btn--primary btn--block" href="#/ginasios">Voltar aos ginásios</a>
    </section>`;
}
