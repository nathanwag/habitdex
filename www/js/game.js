/* Motor do jogo: o estado inteiro (time, niveis, Pokebolas, selvagem do dia)
 * sai do historico, dia a dia, a partir dos checks e das escolhas do
 * jogador (`events`). Marcar um dia passado refaz a conta sozinho. Puro, pra
 * rodar sob node --test; a Pokedex (www/data/pokedex.json) entra pronta. */

import { dayProgress, todayList } from './habits.js';
import { addDays } from './reminder.js';

const START_LEVEL = 5;
const START_BALLS = 5;
const PARTY_SIZE = 6;
// XP de vencer um selvagem comum (experiencia base ~100) do nivel do time,
// pela formula classica b * L / 7.
const WILD_BASE_XP = 100;

// Sorteio que depende so da data: o selvagem de um dia e sempre o mesmo,
// em qualquer aparelho e a cada recalculo. FNV-1a + um passo do mulberry32.
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 2 ** 32;
}

export function play(input, dex) {
  const start = input.events.find((e) => e.type === 'start');
  if (!start) return { started: false, party: [] };
  const byId = new Map(dex.pokemon.map((p) => [p.id, p]));
  const curve = (mon) => dex.growth[byId.get(mon.species).growth];
  const levelOf = (mon) => {
    const xps = curve(mon);
    let level = 1;
    while (level < 100 && xps[level] <= mon.xp) level++;
    return level;
  };

  const party = [{ uid: 1, species: start.species, level: START_LEVEL, xp: 0 }];
  party[0].xp = curve(party[0])[START_LEVEL - 1];
  const box = [];
  let balls = START_BALLS;

  const avgLevel = () => Math.round(party.reduce((s, m) => s + m.level, 0) / party.length);
  const gain = () => {
    const avg = avgLevel();
    const share = Math.floor(Math.floor((WILD_BASE_XP * avg) / 7) / party.length);
    for (const mon of party) {
      mon.xp += share;
      mon.level = levelOf(mon);
      evolve(mon);
    }
  };

  // So a evolucao por nivel puro; pedra, amizade e troca ficam para depois.
  const evolve = (mon) => {
    const next = byId.get(mon.species).evolutions.find((e) => e.trigger === 'level-up'
      && e.level && Object.keys(e).length === 3 && mon.level >= e.level);
    if (!next) return;
    mon.species = next.to;
    evolve(mon);
  };

  // Na virada: dia na meta ganha uma Pokebola; abaixo dela, todos caem um
  // nivel (nunca abaixo do 1), com o XP no comeco dele. A especie fica:
  // ninguem desevolui.
  const turnover = (day) => {
    const progress = dayProgress(todayList(input.habits, input.checks, day));
    if (progress === null) return;
    if (progress >= input.goal) { balls++; return; }
    for (const mon of [...party, ...box]) {
      mon.level = Math.max(1, mon.level - 1);
      mon.xp = curve(mon)[mon.level - 1];
    }
  };

  // A tela sorteia o arremesso com a chance de `wild` e grava o resultado:
  // o recalculo nao sorteia de novo.
  const throwBall = (e) => {
    balls--;
    if (!e.caught) return;
    const mon = { uid: party.length + box.length + 1, species: e.species, level: e.level, xp: 0 };
    mon.xp = curve(mon)[mon.level - 1];
    (party.length < PARTY_SIZE ? party : box).push(mon);
  };

  for (let day = start.day; day <= input.today; day = addDays(day, 1)) {
    for (const c of input.checks) if (c.day === day) gain();
    for (const e of input.events) if (e.type === 'catch' && e.day === day) throwBall(e);
    if (day < input.today) turnover(day);
  }
  // Selvagens: formas basicas da geracao da regiao atual (por enquanto Kanto),
  // sem lendarios e miticos, e so quem tem sprite.
  const sprites = new Set(dex.sprites);
  const pool = dex.pokemon.filter((p) => p.gen === 1 && !p.legendary && !p.mythical
    && p.evolvesFrom === null && sprites.has(p.id));
  const species = pool[Math.floor(seeded(input.today) * pool.length)];
  // Cada habito feito hoje tira vida do selvagem. Captura pela formula da
  // Gen 3/4 com Pokebola comum e sem status: (3M - 2H) * taxa / 3M, sobre 255,
  // com a vida em centesimos e no minimo 1.
  const progress = dayProgress(todayList(input.habits, input.checks, input.today));
  const hp = progress === null ? 1 : 1 - progress;
  const h = Math.max(1, Math.round(hp * 100));
  const odds = Math.floor(((300 - 2 * h) * species.capture) / 300);
  const wild = {
    species: species.id,
    level: Math.max(2, avgLevel() - 2),
    hp,
    chance: Math.min(1, odds / 255),
    caught: input.events.some((e) => e.type === 'catch' && e.day === input.today && e.caught),
  };
  wild.canThrow = !wild.caught && progress !== null && progress >= input.goal && balls > 0;

  return { started: true, party, box, balls, wild };
}
