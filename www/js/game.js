/* Motor do jogo: o estado inteiro (time, niveis, Pokebolas, selvagem do dia)
 * sai do historico, dia a dia, a partir dos checks e das escolhas do
 * jogador (`events`). Marcar um dia passado refaz a conta sozinho. Puro, pra
 * rodar sob node --test; a Pokedex (www/data/pokedex.json) entra pronta. */

import { dayProgress, todayList } from './habits.js';
import { addDays } from './reminder.js';

// Todo pokemon novo, inicial ou capturado, entra no nivel 1.
const START_LEVEL = 1;
const START_BALLS = 5;
const PARTY_SIZE = 6;

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

  const party = [];
  const box = [];
  const hall = [];
  let nextUid = 1;
  let balls = START_BALLS;
  let candies = 0;
  let lastDay = null;
  const caught = new Set();
  const seen = new Set();
  const plain = (list) => list.map(({ caughtOn: _, ...m }) => m);

  // Cada jornada (uma por regiao) comeca com um inicial. Um
  // `start` so vale com o time vazio: no comeco e depois de cada campeao.
  const begin = (e) => {
    if (party.length) return;
    party.push({ uid: nextUid++, species: e.species, level: START_LEVEL });
    caught.add(e.species);
  };

  const avgLevel = () => Math.round(party.reduce((s, m) => s + m.level, 0) / party.length);
  const progressOf = (day) => dayProgress(todayList(input.habits, input.checks, day));

  // So a evolucao por nivel puro; pedra, amizade e troca ficam para depois.
  const evolve = (mon) => {
    const next = byId.get(mon.species).evolutions.find((e) => e.trigger === 'level-up'
      && e.level && Object.keys(e).length === 3 && mon.level >= e.level);
    if (!next) return;
    mon.species = next.to;
    caught.add(mon.species);
    evolve(mon);
  };

  // Dia na meta: o time sobe um nivel, ja no dia (desmarcar desfaz, porque
  // tudo e recalculado). Na virada, dia na meta ainda ganha uma Pokebola;
  // abaixo dela o time cai um nivel (nunca abaixo do 1) sem desevoluir.
  const levelUp = (day) => {
    const progress = progressOf(day);
    if (progress === null || progress < input.goal) return;
    candies++;
    // Quem foi pego hoje entra no nivel da captura: a meta ja estava batida.
    for (const mon of party.filter((m) => m.caughtOn !== day)) {
      mon.level = Math.min(100, mon.level + 1);
      evolve(mon);
    }
  };
  const turnover = (day) => {
    const progress = progressOf(day);
    if (progress === null) return;
    lastDay = { day, progress, met: progress >= input.goal };
    if (lastDay.met) { balls++; return; }
    // A caixa fica congelada: so o time sobe e cai.
    for (const mon of party) mon.level = Math.max(1, mon.level - 1);
  };

  // A tela sorteia o arremesso com a chance de `wild` e grava o resultado:
  // o recalculo nao sorteia de novo.
  const throwBall = (e) => {
    balls--;
    if (!e.caught) return;
    caught.add(e.species);
    const mon = { uid: nextUid++, species: e.species, level: START_LEVEL, caughtOn: e.day };
    (party.length < PARTY_SIZE ? party : box).push(mon);
  };

  // Doce Raro: +1 nivel para quem esta abaixo do mais alto do time, ate
  // empatar com ele. Serve para trazer capturados (que entram no 1) para perto
  // do principal; no mais alto nao vale. Sem doce, o evento e ignorado (pode
  // acontecer se um dia for desmarcado depois do uso).
  const useCandy = (e) => {
    const mon = [...party, ...box].find((m) => m.uid === e.uid);
    const top = Math.max(...party.map((m) => m.level));
    if (candies <= 0 || !mon || mon.level >= top) return;
    candies--;
    mon.level++;
    evolve(mon);
  };

  // O jogador escolhe quem fica no time (ate 6) e em que ordem; o primeiro e
  // o principal. Quem sobra vai para a caixa, na ordem em que estava.
  const arrange = (e) => {
    const owned = [...party, ...box];
    const chosen = [...new Set(e.uids)].map((uid) => owned.find((m) => m.uid === uid))
      .filter(Boolean).slice(0, PARTY_SIZE);
    if (!chosen.length) return;
    const rest = owned.filter((m) => !chosen.includes(m));
    party.splice(0, party.length, ...chosen);
    box.splice(0, box.length, ...rest);
  };

  // Liga em sequencia: ginasios, Elite Four e campeao de cada regiao, na
  // ordem dos jogos. A tela roda a batalha e grava so o resultado. Perder
  // trava aquele chefe ate o dia seguinte.
  const regions = dex.regions ?? [];
  const stepsOf = (r) => [
    ...r.gyms.map((boss, index) => ({ kind: 'gym', index, boss })),
    ...r.elite.map((boss, index) => ({ kind: 'elite', index, boss })),
    { kind: 'champion', index: 0, boss: r.champion },
  ];
  let region = 0;
  let step = 0;
  let lostOn = null;
  // Vencer o campeao fecha a jornada: time e caixa vao para o Hall da Fama e
  // a proxima regiao comeca do zero, com os niveis originais do jogo dela.
  const fight = (e) => {
    if (!e.won) { lostOn = e.day; return; }
    lostOn = null;
    step++;
    if (step < stepsOf(regions[region]).length) return;
    hall.push({ region: regions[region].id, team: plain(party), box: plain(box) });
    party.length = 0;
    box.length = 0;
    region++;
    step = 0;
  };

  // Selvagens: formas basicas da geracao da regiao atual (as regioes estao
  // na ordem das geracoes), sem lendarios e miticos, e so quem tem sprite.
  const sprites = new Set(dex.sprites);
  const pools = new Map();
  const wildOf = (day) => {
    const gen = regions.length ? Math.min(region, regions.length - 1) + 1 : 1;
    if (!pools.has(gen)) {
      pools.set(gen, dex.pokemon.filter((p) => p.gen === gen && !p.legendary && !p.mythical
        && p.evolvesFrom === null && sprites.has(p.id)));
    }
    const pool = pools.get(gen);
    return pool[Math.floor(seeded(day) * pool.length)];
  };

  for (let day = start.day; day <= input.today; day = addDays(day, 1)) {
    for (const e of input.events) {
      if (e.day !== day) continue;
      if (e.type === 'start') begin(e);
      if (e.type === 'catch') throwBall(e);
      if (e.type === 'battle') fight(e);
      if (e.type === 'party') arrange(e);
    }
    if (party.length) seen.add(wildOf(day).id);
    levelUp(day);
    // Doce depois da subida do dia: o doce de hoje ja pode ser usado hoje.
    for (const e of input.events) if (e.type === 'candy' && e.day === day) useCandy(e);
    if (day < input.today) turnover(day);
  }

  let challenge = null;
  if (region < regions.length) {
    // O rival monta o time contra o inicial do jogador: aqui, o tipo do
    // primeiro do time (fogo, se nao for fogo, agua nem grama).
    const types = party.length ? byId.get(party[0].species).types : [];
    const starter = ['fire', 'water', 'grass'].find((t) => types.includes(t)) ?? 'fire';
    const steps = stepsOf(regions[region]).map(({ kind, index, boss }) => ({
      kind, index, name: boss.name, type: boss.type,
      team: boss.team.filter((p) => !p.starter || p.starter === starter)
        .map(({ starter: _, ...p }) => p),
    }));
    challenge = {
      region: regions[region].id, ...steps[step], steps, current: step,
      canBattle: party.length > 0 && lostOn !== input.today,
    };
  }

  const sorted = (set) => [...set].sort((a, b) => a - b);
  const result = {
    started: true, party: plain(party), box: plain(box), hall, balls, candies, challenge, lastDay,
    caught: sorted(caught), seen: sorted(new Set([...seen, ...caught])),
    wild: null, needsStarter: null,
  };
  if (!party.length) {
    if (region < regions.length) result.needsStarter = { region: regions[region].id, gen: region + 1 };
    return result;
  }

  const species = wildOf(input.today);
  // Cada habito feito hoje tira vida do selvagem. Captura pela formula da
  // Gen 3/4 com Pokebola comum e sem status: (3M - 2H) * taxa / 3M, sobre 255,
  // com a vida em centesimos e no minimo 1.
  const progress = progressOf(input.today);
  const hp = progress === null ? 1 : 1 - progress;
  const h = Math.max(1, Math.round(hp * 100));
  const odds = Math.floor(((300 - 2 * h) * species.capture) / 300);
  const catchToday = input.events.find((e) => e.type === 'catch' && e.day === input.today && e.caught);
  const wild = {
    species: species.id,
    // Depois de pego, fica no nivel da captura (a media do time muda com ele).
    level: catchToday?.level ?? Math.max(2, avgLevel() - 2),
    hp,
    chance: Math.min(1, odds / 255),
    caught: Boolean(catchToday),
  };
  wild.canThrow = !wild.caught && progress !== null && progress >= input.goal && balls > 0;
  return { ...result, wild };
}
