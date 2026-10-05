import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play } from './game.js';

// Pokedex de mentira no formato de www/data/pokedex.json. A curva
// medium-fast e a oficial: nivel n custa n^3 de XP acumulado (nivel 1 = 0).
const cube = Array.from({ length: 100 }, (_, i) => (i === 0 ? 0 : (i + 1) ** 3));
const species = (id, name, extra = {}) => ({
  id, name, gen: 1, types: ['normal'], capture: 45, growth: 'medium-fast', legendary: false, mythical: false,
  evolvesFrom: null, evolutions: [], ...extra,
});
const dex = {
  growth: { 'medium-fast': cube },
  pokemon: [
    species(4, 'Charmander', { types: ['fire'], evolutions: [{ to: 5, trigger: 'level-up', level: 16 }] }),
    species(5, 'Charmeleon', { evolvesFrom: 4 }),
    species(16, 'Pidgey', { capture: 255 }),
  ],
  sprites: [4, 5, 16],
};

const daily = (id) => ({ id, name: `h${id}`, schedule: { kind: 'daily' }, createdDay: '2026-09-01', order: id });
const base = { habits: [daily(1)], checks: [], events: [], today: '2026-10-05', goal: 0.8 };

test('sem inicial o jogo nao comecou; com ele, o time e o inicial no nivel 5', () => {
  assert.equal(play(base, dex).started, false);
  const state = play({ ...base, events: [{ type: 'start', day: '2026-10-05', species: 4 }] }, dex);
  assert.equal(state.started, true);
  assert.deepEqual(state.party, [{ uid: 1, species: 4, level: 5, xp: 125 }]);
});

const check = (habitId, day) => ({ habitId, day, at: `${day}T12:00:00.000Z` });
const started = (day = '2026-10-05', extra = {}) => ({
  ...base, events: [{ type: 'start', day, species: 4 }], ...extra,
});

test('cada habito feito da ao time o XP de vencer um selvagem do nivel medio dele', () => {
  // Nivel 5: 100 * 5 / 7 = 71 por habito. 125 + 71 + 71 = 267, que passa
  // dos 216 do nivel 6. O check de antes do inicio nao conta.
  const state = play(started('2026-10-05', {
    habits: [daily(1), daily(2)],
    checks: [check(1, '2026-10-04'), check(1, '2026-10-05'), check(2, '2026-10-05')],
  }), dex);
  assert.deepEqual(state.party, [{ uid: 1, species: 4, level: 6, xp: 267 }]);
});

const many = (n, day) => ({
  habits: Array.from({ length: n }, (_, i) => daily(i + 1)),
  checks: Array.from({ length: n }, (_, i) => check(i + 1, day)),
});

test('ao chegar no nivel de evolucao, o pokemon evolui', () => {
  const at26 = play(started('2026-10-05', many(26, '2026-10-05')), dex).party[0];
  assert.deepEqual([at26.species, at26.level], [4, 15]);
  const at27 = play(started('2026-10-05', many(27, '2026-10-05')), dex).party[0];
  assert.deepEqual([at27.species, at27.level], [5, 16]);
});

test('dia que termina abaixo da meta derruba um nivel, com o XP no comeco dele, sem desevoluir', () => {
  // 10-03 feito (196 XP, nivel 5); 10-04 em branco: cai para o 4 (64 XP).
  // Hoje (10-05) ainda nao acabou e nao conta.
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03')] }), dex);
  assert.deepEqual(state.party[0], { uid: 1, species: 4, level: 4, xp: 64 });

  // Charmeleon nivel 16 que cai para 15 continua Charmeleon.
  const evolved = play(started('2026-10-04', { ...many(27, '2026-10-04'), today: '2026-10-06' }), dex);
  assert.deepEqual(evolved.party[0], { uid: 1, species: 5, level: 15, xp: 3375 });
});

test('comeca com 5 Pokebolas e ganha uma a cada dia que fecha na meta', () => {
  assert.equal(play(started(), dex).balls, 5);
  // 10-03 na meta (+1), 10-04 abaixo (nada); hoje ainda nao fechou.
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03'), check(1, '2026-10-05')] }), dex);
  assert.equal(state.balls, 6);
});

test('o selvagem do dia e sempre o mesmo naquela data e e uma forma basica da geracao, sem lendario', () => {
  const wider = {
    ...dex,
    pokemon: [...dex.pokemon,
      species(150, 'Mewtwo', { legendary: true }),
      species(19, 'Rattata'),
      species(906, 'Sprigatito', { gen: 9 })],
    sprites: [...dex.sprites, 150, 906], // Rattata sem sprite
  };
  const seen = new Set();
  for (let i = 1; i <= 28; i++) {
    const today = `2026-10-${String(i).padStart(2, '0')}`;
    const input = started('2026-10-01', { today });
    const { wild } = play(input, wider);
    assert.equal(play(input, wider).wild.species, wild.species);
    seen.add(wild.species);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [4, 16]);
});

test('cada habito feito hoje enfraquece o selvagem; a chance segue a formula oficial e so da para jogar na meta', () => {
  const onlyCharmander = { ...dex, sprites: [4, 5] };
  const today = (checks) => play(started('2026-10-05', { habits: [daily(1), daily(2)], checks }), onlyCharmander).wild;

  // Taxa 45, Pokebola comum: (3*max - 2*vida) * 45 / (3*max), sobre 255.
  const none = today([]);
  assert.deepEqual(none, { species: 4, level: 3, hp: 1, chance: 15 / 255, caught: false, canThrow: false });
  const half = today([check(1, '2026-10-05')]);
  assert.deepEqual([half.hp, half.chance, half.canThrow], [0.5, 30 / 255, false]);
  // Vida minima de 1 em 100: (300 - 2) * 45 / 300 = 44,7, arredonda para 44.
  const all = today([check(1, '2026-10-05'), check(2, '2026-10-05')]);
  assert.deepEqual([all.hp, all.chance, all.canThrow], [0, 44 / 255, true]);
});

test('cada arremesso gasta uma Pokebola e a captura entra no time no nivel em que estava', () => {
  const state = play(started('2026-10-03', {
    checks: [check(1, '2026-10-03'), check(1, '2026-10-04')],
    events: [
      { type: 'start', day: '2026-10-03', species: 4 },
      { type: 'catch', day: '2026-10-04', species: 16, level: 3, caught: false },
      { type: 'catch', day: '2026-10-04', species: 16, level: 3, caught: true },
    ],
  }), dex);
  // 5 iniciais + 2 dias na meta - 2 arremessos.
  assert.equal(state.balls, 5);
  assert.deepEqual(state.party, [
    { uid: 1, species: 4, level: 6, xp: 267 },
    { uid: 2, species: 16, level: 3, xp: 27 },
  ]);
});

test('o XP de cada habito e dividido pelo time', () => {
  // Time nivel 6 e 3: media 4,5 arredonda para 5, 71 de XP, 35 para cada.
  const state = play(started('2026-10-03', {
    checks: [check(1, '2026-10-03'), check(1, '2026-10-04'), check(1, '2026-10-05')],
    events: [
      { type: 'start', day: '2026-10-03', species: 4 },
      { type: 'catch', day: '2026-10-04', species: 16, level: 3, caught: true },
    ],
  }), dex);
  assert.deepEqual(state.party.map((m) => m.xp), [267 + 35, 27 + 35]);
});

test('do setimo em diante a captura vai para a caixa, que nao ganha XP mas tambem perde nivel', () => {
  const catches = Array.from({ length: 6 }, () => ({ type: 'catch', day: '2026-10-03', species: 16, level: 3, caught: true }));
  const state = play(started('2026-10-01', {
    today: '2026-10-04',
    checks: [check(1, '2026-10-01'), check(1, '2026-10-02')],
    events: [{ type: 'start', day: '2026-10-01', species: 4 }, ...catches],
  }), dex);
  assert.equal(state.party.length, 6);
  // 10-03 em branco: todos caem do 3 para o 2, inclusive o da caixa.
  assert.deepEqual(state.box, [{ uid: 7, species: 16, level: 2, xp: 8 }]);
  assert.equal(state.balls, 1);
});

test('o selvagem de hoje, depois de capturado, nao aceita mais Pokebola', () => {
  const input = started('2026-10-05', { checks: [check(1, '2026-10-05')] });
  const { wild } = play(input, dex);
  const events = [...input.events, { type: 'catch', day: '2026-10-05', species: wild.species, level: wild.level, caught: true }];
  const after = play({ ...input, events }, dex).wild;
  assert.deepEqual([after.caught, after.canThrow], [true, false]);
});

// Ligas de mentira no formato de www/data/gyms.json.
const leader = (name, type, team) => ({ name, type, team });
const leagueDex = {
  ...dex,
  pokemon: [...dex.pokemon, species(161, 'Sentret', { gen: 2 }), species(1, 'Bulbasaur', { types: ['grass', 'poison'] }),
    species(7, 'Squirtle', { types: ['water'] })],
  sprites: [...dex.sprites, 161, 1, 7],
  regions: [
    {
      id: 'kanto', name: 'Kanto',
      gyms: [leader('Brock', 'rock', [{ species: 74, level: 12, moves: [33] }]),
        leader('Misty', 'water', [{ species: 121, level: 21, moves: [55] }])],
      elite: [leader('Lorelei', 'ice', [{ species: 87, level: 54, moves: [62] }])],
      champion: leader('Blue', null, [
        { species: 18, level: 61, moves: [17] },
        { species: 3, level: 65, moves: [75], starter: 'water' },
        { species: 6, level: 65, moves: [52], starter: 'grass' },
        { species: 9, level: 65, moves: [55], starter: 'fire' },
      ]),
    },
    {
      id: 'johto', name: 'Johto',
      gyms: [leader('Falkner', 'flying', [{ species: 17, level: 9, moves: [16] }])],
      elite: [], champion: leader('Lance', 'dragon', [{ species: 149, level: 50, moves: [63] }]),
    },
  ],
};
const battle = (day, won) => ({ type: 'battle', day, won });

test('o desafio comeca no primeiro ginasio de Kanto; perder bloqueia ate o dia seguinte, vencer passa ao proximo', () => {
  const first = play(started(), leagueDex).challenge;
  assert.deepEqual([first.region, first.kind, first.name, first.canBattle], ['kanto', 'gym', 'Brock', true]);
  assert.deepEqual(first.team, [{ species: 74, level: 12, moves: [33] }]);

  const lost = play(started('2026-10-05', { events: [...started().events, battle('2026-10-05', false)] }), leagueDex);
  assert.deepEqual([lost.challenge.name, lost.challenge.canBattle], ['Brock', false]);
  const nextDay = play(started('2026-10-04', {
    events: [{ type: 'start', day: '2026-10-04', species: 4 }, battle('2026-10-04', false)],
  }), leagueDex);
  assert.deepEqual([nextDay.challenge.name, nextDay.challenge.canBattle], ['Brock', true]);

  const won = play(started('2026-10-05', { events: [...started().events, battle('2026-10-05', true)] }), leagueDex);
  assert.deepEqual([won.challenge.name, won.challenge.canBattle], ['Misty', true]);
});

const wins = (n, day = '2026-10-05') => Array.from({ length: n }, () => battle(day, true));

test('o time que depende do inicial segue o tipo do seu primeiro pokemon (fogo se nao for fogo, agua ou grama)', () => {
  const blueWith = (species) => play({
    ...base, events: [{ type: 'start', day: '2026-10-05', species }, ...wins(3)],
  }, leagueDex).challenge;
  const charmander = blueWith(4);
  assert.deepEqual([charmander.kind, charmander.name], ['champion', 'Blue']);
  assert.deepEqual(charmander.team, [{ species: 18, level: 61, moves: [17] }, { species: 9, level: 65, moves: [55] }]);
  assert.deepEqual(blueWith(1).team.map((p) => p.species), [18, 6]);
  assert.deepEqual(blueWith(7).team.map((p) => p.species), [18, 3]);
  assert.deepEqual(blueWith(16).team.map((p) => p.species), [18, 9]);
});

test('vencer o campeao leva a proxima regiao, e os selvagens passam a ser da geracao dela', () => {
  const state = play(started('2026-10-05', { events: [...started().events, ...wins(4)] }), leagueDex);
  assert.deepEqual([state.challenge.region, state.challenge.name], ['johto', 'Falkner']);
  assert.equal(state.wild.species, 161);
});

test('a Pokedex marca como capturado o que voce teve (evolucoes inclusive) e como visto tambem os selvagens de cada dia', () => {
  const onlyPidgeyWild = { ...dex, sprites: [16] };
  const state = play(started('2026-10-03', {
    ...many(27, '2026-10-03'),
    events: [
      { type: 'start', day: '2026-10-03', species: 4 },
      { type: 'catch', day: '2026-10-04', species: 16, level: 3, caught: false },
    ],
  }), onlyPidgeyWild);
  assert.deepEqual(state.caught, [4, 5]);
  assert.deepEqual(state.seen, [4, 5, 16]);
});

test('o resumo do ultimo dia fechado diz se bateu a meta', () => {
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03')] }), dex);
  assert.deepEqual(state.lastDay, { day: '2026-10-04', progress: 0, met: false });
  assert.equal(play(started(), dex).lastDay, null);
});
