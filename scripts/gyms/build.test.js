import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeague } from './build.js';

// Recortes de leagues/*.txt do nuzlocke.data; ids da PokeAPI.
const ids = {
  species: new Map([['geodude', 74], ['onix', 95], ['dewgong', 87], ['pidgeot', 18], ['exeggutor', 103],
    ['venusaur', 3], ['charizard', 6], ['aegislash-shield', 681], ['jellicent', 593]]),
  moves: new Map([['tackle', 33], ['defense-curl', 111], ['screech', 103], ['bide', 117], ['growl', 45],
    ['aurora-beam', 62], ['wing-attack', 17], ['stomp', 23], ['slash', 163], ['razor-leaf', 75],
    ['kings-shield', 588], ['night-shade', 101]]),
};

const kanto = `# Rival fights

--r1|Blue||/leaders/frlg-blue-1
charmander|5|scratch,growl|||grass

# Gym leaders
--1|Brock|rock|/leaders/frlg-brock
geodude|12|tackle,defense-curl
onix|14|tackle,screech,bide

# Elite four
--e1|Lorelei|ice|/leaders/frlg-lorelei
dewgong|54|growl,aurora-beam

--c|Blue||/leaders/frlg-blue-3
pidgeot|61|wing-attack
exeggutor|61|stomp|||grass
venusaur|65|razor-leaf|||water
charizard|65|slash|||grass
`;

test('monta ginasios, Elite Four e campeao pelos ids das secoes, com especie, nivel e golpes', () => {
  const league = buildLeague(kanto, { gyms: ['1'], elite: ['e1'], champion: 'c' }, ids);
  assert.deepEqual(league.gyms, [{
    name: 'Brock',
    type: 'rock',
    team: [
      { species: 74, level: 12, moves: [33, 111] },
      { species: 95, level: 14, moves: [33, 103, 117] },
    ],
  }]);
  assert.deepEqual(league.elite, [{ name: 'Lorelei', type: 'ice', team: [{ species: 87, level: 54, moves: [45, 62] }] }]);
  assert.equal(league.champion.name, 'Blue');
  assert.equal(league.champion.type, null);
});

test('guarda o inicial de que depende cada pokemon do time e le a forma antes do ">"', () => {
  const text = `${kanto}
--ca|Champion Leon||/leaders/swsh-leon
==double:true
aegislash-shield>aegislash|62|kings-shield|stance-change||
jellicent|60|night-shade|water-absorb|sitrus-berry|
`;
  const { champion } = buildLeague(text, { gyms: [], elite: [], champion: 'ca' }, ids);
  assert.deepEqual(champion.team, [
    { species: 681, level: 62, moves: [588] },
    { species: 593, level: 60, moves: [101] },
  ]);
  const blue = buildLeague(kanto, { gyms: [], elite: [], champion: 'c' }, ids).champion;
  assert.deepEqual(blue.team.map((p) => [p.species, p.starter]), [[18, undefined], [103, 'grass'], [3, 'water'], [6, 'grass']]);
  assert.equal('starter' in blue.team[0], false);
});

test('especie ou golpe desconhecido para o build com o nome do chefe', () => {
  const text = '--1|Misty|water|\nstarmie|21|tackle,bubblebeam\n';
  const layout = { gyms: ['1'], elite: [], champion: '1' };
  assert.throws(() => buildLeague(text, layout, ids), /Misty: especie "starmie"/);
  const withStarmie = { ...ids, species: new Map([...ids.species, ['starmie', 121]]) };
  assert.throws(() => buildLeague(text, layout, withStarmie), /Misty: golpe "bubblebeam"/);
});
