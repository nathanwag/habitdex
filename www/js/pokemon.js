/* Ponte entre as telas e o jogo: carrega os dados gerados (www/data), monta o
 * estado pelo game.js e da os nomes e sprites. */

import * as db from './db.js';
import { play } from './game.js';

let dexPromise = null;

/** Pokedex, ligas e lista de sprites, carregados uma vez (o SW guarda). */
export function loadDex() {
  dexPromise ??= Promise.all(['pokedex', 'gyms', 'sprites'].map(async (name) => {
    const res = await fetch(`./data/${name}.json`);
    if (!res.ok) throw new Error(`data/${name}.json: HTTP ${res.status}`);
    return res.json();
  })).then(([pokedex, gyms, sprites]) => ({
    ...pokedex,
    regions: gyms.regions,
    sprites: sprites.ids,
    byId: new Map(pokedex.pokemon.map((p) => [p.id, p])),
  })).catch((err) => {
    dexPromise = null;
    throw err;
  });
  return dexPromise;
}

/** Tudo o que uma tela do jogo precisa, recalculado do historico. */
export async function game() {
  const [dex, habits, checks, events] = await Promise.all([loadDex(), db.habits(), db.allChecks(), db.events()]);
  const today = db.dayOf();
  const state = play({ habits, checks, events, today, goal: db.settings().goal }, dex);
  return { dex, state, habits, checks, events, today };
}

export const sprite = (id, side = 'front') => `./sprites/${id}/${side}.gif`;

// Os iniciais das 9 geracoes, na ordem.
export const STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
  650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];

export const TYPE_NAMES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', grass: 'Planta', electric: 'Elétrico', ice: 'Gelo',
  fighting: 'Lutador', poison: 'Venenoso', ground: 'Terra', flying: 'Voador', psychic: 'Psíquico',
  bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão', dark: 'Sombrio', steel: 'Aço',
  fairy: 'Fada',
};

/** Quanto do caminho ate o proximo nivel (0 a 1): a parte da meta de hoje ja
 *  cumprida. Bater a meta sobe o time na hora. */
export function toNextLevel(progress, goal) {
  return Math.min(1, (progress ?? 0) / goal);
}

/** Os 3 iniciais da geracao `gen`. */
export const startersOf = (gen) => STARTERS.slice((gen - 1) * 3, gen * 3);

/** A proxima evolucao por nivel, se houver: { to, level }. */
export function nextEvolution(dex, species) {
  return dex.byId.get(species).evolutions
    .find((e) => e.trigger === 'level-up' && e.level && Object.keys(e).length === 3) ?? null;
}

/* Icones do jogo. As metades da bola tem stroke="none" porque o CSS global
 * poe stroke em todo svg. */
export const ball = (size = 36) => `<svg class="ball-svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><path d="M3 20a17 17 0 0 1 34 0z" fill="#ee4035" stroke="none"/><path d="M3 20a17 17 0 0 0 34 0z" fill="#fff" stroke="none"/><circle cx="20" cy="20" r="17" fill="none" stroke="#1f2a3a" stroke-width="3"/><path d="M3 20h34" stroke="#1f2a3a" stroke-width="3"/><circle cx="20" cy="20" r="5.5" fill="#fff" stroke="#1f2a3a" stroke-width="3"/></svg>`;

export const emptyBall = (size = 36) => `<svg class="ball-svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="var(--bg)" stroke="var(--ball-empty)" stroke-width="3"/><path d="M3 20h34" stroke="var(--ball-empty)" stroke-width="3"/><circle cx="20" cy="20" r="5.5" fill="var(--surface)" stroke="var(--ball-empty)" stroke-width="3"/></svg>`;

export const candy = (size = 20) => `<svg class="candy-svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 8l6 4-6 4z" fill="#8a5cf6" stroke="none"/><path d="M23 8l-6 4 6 4z" fill="#8a5cf6" stroke="none"/><circle cx="12" cy="12" r="6" fill="#c4a8ff" stroke="#4b2a99" stroke-width="1.5"/></svg>`;
