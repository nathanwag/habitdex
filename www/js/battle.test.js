import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, turn, summary } from './battle.js';

// Pokedex de mentira no formato de www/data/pokedex.json, com stats, tipos e
// golpes reais.
const mon = (id, name, types, [hp, atk, def, spa, spd, spe], moves) => ({
  id, name, types, stats: { hp, atk, def, spa, spd, spe }, moves,
});
const dex = {
  pokemon: [
    mon(1, 'Bulbasaur', ['grass', 'poison'], [45, 49, 49, 65, 65, 45], [[1, 33], [1, 45], [3, 22]]),
    mon(4, 'Charmander', ['fire'], [39, 52, 43, 60, 50, 65], [[1, 10], [1, 45], [4, 52], [8, 108], [12, 82]]),
    mon(7, 'Squirtle', ['water'], [44, 48, 65, 50, 64, 43], [[1, 33], [3, 55]]),
    mon(74, 'Geodude', ['rock', 'ground'], [40, 80, 100, 30, 30, 20], [[1, 33], [1, 111]]),
  ],
  moves: {
    10: { name: 'Scratch', type: 'normal', power: 40, accuracy: 100, pp: 35, class: 'physical' },
    22: { name: 'Vine Whip', type: 'grass', power: 45, accuracy: 100, pp: 25, class: 'physical' },
    33: { name: 'Tackle', type: 'normal', power: 40, accuracy: 100, pp: 35, class: 'physical' },
    45: { name: 'Growl', type: 'normal', power: null, accuracy: 100, pp: 40, class: 'status' },
    52: { name: 'Ember', type: 'fire', power: 40, accuracy: 100, pp: 25, class: 'special' },
    75: { name: 'Razor Leaf', type: 'grass', power: 55, accuracy: 95, pp: 25, class: 'physical' },
    55: { name: 'Water Gun', type: 'water', power: 40, accuracy: 100, pp: 25, class: 'special' },
    82: { name: 'Dragon Rage', type: 'dragon', power: null, accuracy: 100, pp: 10, class: 'special' },
    108: { name: 'Smokescreen', type: 'normal', power: null, accuracy: 100, pp: 20, class: 'status' },
    111: { name: 'Defense Curl', type: 'normal', power: null, accuracy: null, pp: 40, class: 'status' },
  },
  efficacy: {
    normal: { rock: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, rock: 0.5 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, rock: 2 },
  },
};

test('stats com IV 31, EV 0 e natureza neutra, e os 4 ultimos golpes aprendidos ate o nivel', () => {
  const state = createBattle([{ species: 4, level: 100 }], [{ species: 74, level: 12, moves: [33, 111] }], dex);
  const [charmander] = state.sides[0].team;
  assert.deepEqual(charmander.stats, { hp: 219, atk: 140, def: 122, spa: 156, spd: 136, spe: 166 });
  assert.equal(charmander.hp, 219);
  assert.deepEqual(charmander.moves, [45, 52, 108, 82]);
  assert.deepEqual(createBattle([{ species: 4, level: 10 }], [], dex).sides[0].team[0].moves, [10, 45, 52, 108]);
  // O time do lider ja vem com os golpes do jogo.
  assert.deepEqual(state.sides[1].team[0].moves, [33, 111]);
});

// Sorteios em sequencia, repetindo. Cada golpe gasta tres: acerto (< precisao
// em %), critico (< 1/24) e fator de dano (85 a 100%).
const rolls = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const HIT_MAX = [0, 0.5, 0.999];

test('no turno o mais rapido ataca primeiro, cada um com o golpe que a IA acha melhor, pela formula de dano', () => {
  const battle = createBattle([{ species: 4, level: 10 }], [{ species: 1, level: 10, moves: [33, 45, 22] }], dex);
  const { state, events } = turn(battle, rolls(...HIT_MAX));
  // Ember: floor(floor(6 * 40 * 20 / 21) / 50) + 2 = 6; x1,5 mesmo tipo = 9;
  // x2 contra grama = 18. Tackle: floor(floor(6 * 40 * 17 / 16) / 50) + 2 = 7.
  assert.deepEqual(events, [
    { side: 0, move: 52, damage: 18, effectiveness: 2, crit: false },
    { side: 1, move: 33, damage: 7, effectiveness: 1, crit: false },
  ]);
  assert.equal(state.sides[1].team[0].hp, 32 - 18);
  assert.equal(state.sides[0].team[0].hp, 30 - 7);
  // O estado de antes nao muda: a tela anima de um para o outro.
  assert.equal(battle.sides[1].team[0].hp, 32);
});

test('quem desmaia nao ataca, o proximo do time entra no fim do turno e sem ninguem a luta acaba', () => {
  const battle = createBattle([{ species: 4, level: 10 }],
    [{ species: 1, level: 3, moves: [33] }, { species: 74, level: 3, moves: [33] }], dex);
  assert.equal(battle.winner, null);
  const { state, events } = turn(battle, rolls(...HIT_MAX));
  // Bulbasaur nivel 3 tem 16 de vida; o Ember tira 36.
  assert.deepEqual(events, [
    { side: 0, move: 52, damage: 36, effectiveness: 2, crit: false },
    { side: 1, fainted: true },
    { side: 1, switchedTo: 1 },
  ]);
  assert.equal(state.sides[1].active, 1);

  let current = state;
  for (let i = 0; i < 20 && current.winner === null; i++) current = turn(current, rolls(...HIT_MAX)).state;
  assert.equal(current.winner, 0);
});

test('sem golpe de dano, o pokemon usa Struggle: poder 50, sem tipo e sem errar', () => {
  const battle = createBattle([{ species: 4, level: 10 }], [{ species: 74, level: 10, moves: [111] }], dex);
  const { events } = turn(battle, rolls(0, 0.5, 0.999, 0.5, 0.999));
  // Ember no Geodude (pedra/terra): 8, x1,5 = 12, x0,5 = 6. Struggle:
  // floor(floor(6 * 50 * 24 / 16) / 50) + 2 = 11, sem mesmo tipo nem efetividade.
  assert.deepEqual(events, [
    { side: 0, move: 52, damage: 6, effectiveness: 0.5, crit: false },
    { side: 1, move: 165, damage: 11, effectiveness: 1, crit: false },
  ]);
});

test('golpe erra quando o sorteio passa da precisao; critico multiplica por 1,5 antes do fator', () => {
  const battle = createBattle([{ species: 4, level: 10 }], [{ species: 1, level: 10, moves: [75] }], dex);
  const { events } = turn(battle, rolls(0, 0, 0.999, 0.96));
  // Ember critico: 6 x1,5 = 9, x1,5 mesmo tipo = 13, x2 = 26. Razor Leaf tem
  // precisao 95: o sorteio 96 erra.
  assert.deepEqual(events, [
    { side: 0, move: 52, damage: 26, effectiveness: 2, crit: true },
    { side: 1, move: 75, missed: true },
  ]);
});

test('a ficha mostra os stats no nivel e os 4 golpes de agora, com tipo, poder, precisao e PP', () => {
  const info = summary({ species: 4, level: 10 }, dex);
  assert.deepEqual(info.stats, { hp: 30, atk: 18, def: 16, spa: 20, spd: 18, spe: 21 });
  assert.deepEqual(info.moves.map((m) => [m.id, m.name, m.type, m.power, m.accuracy, m.pp, m.class]), [
    [10, 'Scratch', 'normal', 40, 100, 35, 'physical'],
    [45, 'Growl', 'normal', null, 100, 40, 'status'],
    [52, 'Ember', 'fire', 40, 100, 25, 'special'],
    [108, 'Smokescreen', 'normal', null, 100, 20, 'status'],
  ]);
});

test('a ficha lista os golpes que ainda vai aprender, em ordem de nivel', () => {
  assert.deepEqual(summary({ species: 4, level: 4 }, dex).upcoming.map((m) => [m.level, m.name]),
    [[8, 'Smokescreen'], [12, 'Dragon Rage']]);
  assert.deepEqual(summary({ species: 4, level: 12 }, dex).upcoming, []);
});

test('a ficha diz quanto cada tipo de ataque tira dele, so o que foge do normal', () => {
  // Bulbasaur (planta/veneno): fogo x2 na planta; agua x0,5; planta x0,5 nos dois.
  assert.deepEqual(summary({ species: 1, level: 5 }, dex).matchups, { fire: 2, water: 0.5, grass: 0.25 });
});
