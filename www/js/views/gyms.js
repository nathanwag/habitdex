/* Ginasios — a liga em sequencia, regiao por regiao, e a batalha animada. */

import * as db from '../db.js';
import { createBattle, turn } from '../battle.js';
import { game, sprite, TYPE_NAMES } from '../pokemon.js';
import {
  html, raw, setTop, buzz,
} from '../ui.js';

const KIND = { gym: 'Ginásio', elite: 'Elite Four', champion: 'Campeão' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const stepsOf = (r) => [
  ...r.gyms.map((boss, index) => ({ kind: 'gym', index, boss })),
  ...r.elite.map((boss, index) => ({ kind: 'elite', index, boss })),
  { kind: 'champion', index: 0, boss: r.champion },
];

const topLevel = (team) => Math.max(...team.map((p) => p.level));
const typeTag = (t) => (t ? html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>` : '');

export async function render(view) {
  setTop({ title: 'Ginásios' });
  const { dex, state } = await game();
  if (!state.started || state.needsStarter) {
    view.innerHTML = html`<a class="btn btn--primary btn--block" href="#/">Escolha seu inicial no Hoje</a>`;
    return;
  }
  const ch = state.challenge;
  if (!ch) {
    view.innerHTML = html`<section class="hero"><p class="hero__left">Você venceu todas as ligas!</p></section>`;
    return;
  }
  const regionIdx = dex.regions.findIndex((r) => r.id === ch.region);
  const region = dex.regions[regionIdx];
  const steps = stepsOf(region);
  const current = steps.findIndex((s) => s.kind === ch.kind && s.index === ch.index);
  const myTop = Math.max(...state.party.map((m) => m.level));

  view.innerHTML = html`
    ${raw(regionIdx ? html`<p class="status">Regiões vencidas: ${dex.regions.slice(0, regionIdx).map((r) => r.name).join(', ')}</p>` : '')}
    <section class="card card__pad challenge stack">
      <div class="row">
        <div class="grow">
          <span class="hint">${region.name} · ${KIND[ch.kind]}${ch.kind === 'gym' ? ` ${ch.index + 1}` : ''}</span>
          <h2>${ch.name}</h2>
        </div>
        ${raw(typeTag(ch.type))}
      </div>
      <ul class="lineup">
        ${raw(ch.team.map((p) => html`
          <li><img class="sprite" src="${sprite(p.species)}" alt="${dex.byId.get(p.species).name}" loading="lazy">
            <span class="data">Nv ${p.level}</span></li>`).join(''))}
      </ul>
      <p class="hint">O mais forte dele é nível ${topLevel(ch.team)}; o seu, ${myTop}. A luta é automática.</p>
      ${raw(ch.canBattle
        ? html`<a class="btn btn--primary btn--block btn--lg" href="#/batalha">Desafiar</a>`
        : html`<button class="btn btn--block btn--lg" type="button" disabled>Perdeu hoje · tente amanhã</button>`)}
    </section>

    <section class="sec">
      <h2 class="section-title">${region.name} · ${region.game}</h2>
      <ol class="card ladder">
        ${raw(steps.map((s, i) => {
          const ace = s.boss.team.at(-1);
          const status = i < current ? 'is-done' : i === current ? 'is-current' : 'is-locked';
          return html`
            <li class="ladder__row ${status}">
              <img class="sprite sprite--sm" src="${sprite(ace.species)}" alt="" loading="lazy">
              <span class="grow"><strong>${s.boss.name}</strong>
                <span class="hint">${KIND[s.kind]} · até nível ${topLevel(s.boss.team)}</span></span>
              ${raw(typeTag(s.boss.type))}
              <span class="ladder__mark" aria-label="${i < current ? 'Vencido' : i === current ? 'Próximo' : 'Bloqueado'}">${i < current ? '✓' : i === current ? '›' : ''}</span>
            </li>`;
        }).join(''))}
      </ol>
    </section>
  `;
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
    <p class="battle__log card card__pad" data-log aria-live="polite">${ch.name} quer batalhar!</p>
    <button class="btn btn--ghost btn--block" type="button" data-skip>Pular animação</button>
    <div data-result></div>
  `;

  let skip = false;
  view.onclick = (e) => { if (e.target.closest('[data-skip]')) skip = true; };
  const alive = () => view.dataset.battle === token && view.isConnected;
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
