/* Pokedex — os 1025, por geracao. Sprite so de quem ja foi visto: carregar
 * os 1025 GIFs de uma vez pesaria ~140 MB. Tocar em quem ja foi visto abre a
 * ficha da especie (#/pokedex/pokemon?id=). */

import { game, sprite, ball } from '../pokemon.js';
import { summary } from '../battle.js';
import { byLevel } from '../game.js';
import {
  hero, statsCard, learnList, matchupsCard, evoRow,
} from './mon-parts.js';
import { html, raw, setTop } from '../ui.js';

const num = (id) => `#${String(id).padStart(4, '0')}`;

// A lista e longa: voltar da ficha devolve a rolagem de onde se saiu.
let returnTo = null;

// Geracoes abertas ou fechadas pelo jogador, so neste aparelho. Sem escolha,
// abre quem ja tem algum visto.
const OPEN_KEY = 'pokedex-open';
function openGens() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) ?? {}; } catch { return {}; }
}
function saveOpen(gen, open) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify({ ...openGens(), [gen]: open })); } catch { /* sem storage */ }
}

export async function render(view) {
  setTop({ title: 'Pokédex' });
  const { dex, state } = await game();
  const caught = new Set(state.caught ?? []);
  const seen = new Set(state.seen ?? []);
  const sprites = new Set(dex.sprites);
  const open = openGens();

  const cell = (p) => {
    if (!seen.has(p.id)) {
      return html`<li class="dex__cell is-unknown"><span class="dex__num">${num(p.id)}</span><span class="dex__q">?</span></li>`;
    }
    return html`
      <li><a class="dex__cell${caught.has(p.id) ? ' is-caught' : ''}" href="#/pokedex/pokemon?id=${p.id}">
        <span class="dex__num">${num(p.id)}</span>
        ${raw(sprites.has(p.id) ? html`<img class="sprite" src="${sprite(p.id)}" alt="" loading="lazy">` : '<span class="dex__q">·</span>')}
        <span class="dex__name">${p.name}</span>
      </a></li>`;
  };
  const counts = (list) => ({
    caught: list.filter((p) => caught.has(p.id)).length,
    seen: list.filter((p) => seen.has(p.id)).length,
    total: list.length,
  });
  const total = counts(dex.pokemon);
  const pct = (n, of) => `${Math.round((n / of) * 100)}%`;

  const gens = [...new Set(dex.pokemon.map((p) => p.gen))];
  view.innerHTML = html`
    <section class="dex-total card">
      <div class="dex-total__nums">
        <span><b>${total.caught}</b>capturados</span>
        <span><b>${total.seen}</b>vistos</span>
        <span><b>${total.total}</b>no total</span>
      </div>
      <span class="dex-bar" aria-hidden="true">
        <span class="dex-bar__seen" style="width:${pct(total.seen, total.total)}"></span>
        <span class="dex-bar__caught" style="width:${pct(total.caught, total.total)}"></span>
      </span>
    </section>
    ${raw(gens.map((g) => {
    const list = dex.pokemon.filter((p) => p.gen === g);
    const c = counts(list);
    const isOpen = open[g] ?? c.seen > 0;
    return html`
      <details class="dex-gen" data-gen="${g}"${raw(isOpen ? ' open' : '')}>
        <summary class="dex-gen__head">
          <span class="grow">
            <span class="dex-gen__title">Geração ${g}</span>
            <span class="dex-gen__region">${dex.regions[g - 1]?.name ?? ''}</span>
          </span>
          <span class="dex-gen__count">${raw(ball(14))}${c.caught}/${c.total}<span class="muted"> · ${c.seen} vistos</span></span>
          <svg class="dex-gen__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <ul class="dex">${raw(list.map(cell).join(''))}</ul>
      </details>`;
  }).join(''))}
  `;
  if (returnTo !== null) window.scrollTo(0, returnTo);
  returnTo = null;
  view.onclick = (e) => {
    if (e.target.closest('a.dex__cell')) returnTo = window.scrollY;
    // Pelo clique, nao pelo toggle: o toggle tambem dispara para quem ja nasce aberto.
    const head = e.target.closest('.dex-gen__head');
    if (head) saveOpen(head.parentElement.dataset.gen, !head.parentElement.open);
  };
}

/* ---------- Ficha da especie ---------- */

const title = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const TIMES = { day: 'de dia', night: 'à noite' };
const TRIGGERS = { trade: 'Troca' };

// Condicao de uma evolucao. No jogo, so o nivel puro acontece sozinho; o
// resto pede a Pedra da Evolucao (a condicao original fica entre parenteses).
function evoWhen(e) {
  if (!byLevel(e)) return `Pedra da Evolução (${originalWhen(e)})`;
  return originalWhen(e);
}
function originalWhen(e) {
  const parts = [];
  if (e.level) parts.push(`Nv ${e.level}`);
  if (e.item) parts.push(title(e.item));
  if (e.happiness) parts.push('Amizade');
  if (e.time) parts.push(TIMES[e.time] ?? e.time);
  if (!parts.length) parts.push(TRIGGERS[e.trigger] ?? title(e.trigger));
  return parts.join(', ');
}

export async function renderSpecies(view, params) {
  setTop({ title: 'Pokédex', back: '#/pokedex' });
  const { dex, state } = await game();
  const species = dex.byId.get(Number(params.get('id')));
  if (!species) {
    view.innerHTML = html`<p class="status">Pokémon não encontrado.</p>`;
    return;
  }
  setTop({ title: species.name, back: '#/pokedex' });

  const caught = (state.caught ?? []).includes(species.id);
  const seen = (state.seen ?? []).includes(species.id);
  const sprites = new Set(dex.sprites);
  const status = caught ? 'Capturado' : seen ? 'Visto' : 'Não visto';
  const mine = [...(state.party ?? []), ...(state.box ?? [])].filter((m) => m.species === species.id);
  const from = species.evolvesFrom && dex.byId.get(species.evolvesFrom);
  const learnset = species.moves.map(([level, id]) => ({ level, id, ...dex.moves[id] }))
    .sort((a, b) => a.level - b.level);
  const link = (id) => `#/pokedex/pokemon?id=${id}`;

  view.innerHTML = html`
    ${raw(hero(species, `${status} · Geração ${species.gen}`, { pic: sprites.has(species.id) }))}

    ${raw(mine.length ? html`
      <section class="sec">
        <h2 class="section-title">Seus</h2>
        <div class="stack">${raw(mine.map((m) => evoRow(m.species, species.name, `Nv ${m.level}`, { href: `#/pokemon?uid=${m.uid}` })).join(''))}</div>
      </section>` : '')}

    ${raw(statsCard('Status base', species.stats, species.stats))}

    ${raw(from || species.evolutions.length ? html`
      <section class="sec">
        <h2 class="section-title">Evolução</h2>
        <div class="stack">
          ${raw(from ? evoRow(from.id, from.name, 'forma anterior', { href: link(from.id) }) : '')}
          ${raw(species.evolutions.map((e) => evoRow(e.to, dex.byId.get(e.to).name, evoWhen(e),
    { href: link(e.to) })).join(''))}
        </div>
      </section>` : '')}

    ${raw(learnList('Golpes por nível', learnset))}

    ${raw(matchupsCard(summary({ species: species.id, level: 1 }, dex).matchups))}
  `;
  window.scrollTo(0, 0);
}
