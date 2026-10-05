import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPokedex, parseCsv } from './build.js';

// As tabelas de teste sao recortes reais dos CSVs da PokeAPI.
const csv = (strings) => parseCsv(strings.join('').replace(/^\n/, '').replace(/^ +/gm, ''));

const base = {
  pokemon_species: csv`
    id,identifier,generation_id,evolves_from_species_id,evolution_chain_id,color_id,shape_id,habitat_id,gender_rate,capture_rate,base_happiness,is_baby,hatch_counter,has_gender_differences,growth_rate_id,forms_switchable,is_legendary,is_mythical,order,conquest_order
    1,bulbasaur,1,,1,5,8,3,1,45,70,0,20,0,4,0,0,0,1,
    4,charmander,1,,2,8,6,4,1,45,70,0,20,0,4,0,0,0,5,
    151,mew,1,,63,6,6,5,-1,45,100,0,120,0,4,0,0,1,215,
  `,
  pokemon_species_names: csv`
    pokemon_species_id,local_language_id,name,genus
    1,5,Bulbizarre,Pokémon Graine
    1,9,Bulbasaur,Seed Pokémon
    4,9,Charmander,Lizard Pokémon
    151,9,Mew,New Species Pokémon
  `,
  pokemon: csv`
    id,identifier,species_id,height,weight,base_experience,order,is_default
    1,bulbasaur,1,7,69,64,1,1
    4,charmander,4,6,85,62,5,1
    151,mew,151,4,40,300,215,1
    10196,charmander-mega,4,6,85,62,6,0
  `,
  pokemon_types: csv`
    pokemon_id,type_id,slot
    1,12,1
    1,4,2
    4,10,1
    151,14,1
  `,
  pokemon_stats: csv`
    pokemon_id,stat_id,base_stat,effort
    1,1,45,0
    1,2,49,0
    1,3,49,0
    1,4,65,1
    1,5,65,0
    1,6,45,0
    4,1,39,0
    4,2,52,0
    4,3,43,0
    4,4,60,0
    4,5,50,0
    4,6,65,1
    151,1,100,3
    151,2,100,0
    151,3,100,0
    151,4,100,0
    151,5,100,0
    151,6,100,0
  `,
  types: csv`
    id,identifier,generation_id,damage_class_id
    4,poison,1,2
    10,fire,1,3
    12,grass,1,3
    14,psychic,1,3
  `,
  growth_rates: csv`
    id,identifier,formula
    4,medium-slow,x
  `,
  pokemon_evolution: [],
  evolution_triggers: [],
  items: [],
  pokemon_moves: [],
  version_groups: [],
  moves: [],
  move_names: [],
  type_efficacy: [],
  experience: [],
};

test('cada especie vira um pokemon com nome em ingles, tipos na ordem, stats base, captura e curva de XP', () => {
  const { pokemon } = buildPokedex(base);
  assert.deepEqual(pokemon.map((p) => p.id), [1, 4, 151]);
  assert.deepEqual(pokemon[0], {
    id: 1,
    name: 'Bulbasaur',
    gen: 1,
    types: ['grass', 'poison'],
    stats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
    capture: 45,
    baseXp: 64,
    happiness: 70,
    growth: 'medium-slow',
    legendary: false,
    mythical: false,
    evolvesFrom: null,
    evolutions: [],
    moves: [],
  });
  assert.equal(pokemon[2].mythical, true);
});

test('os golpes sao os aprendidos por nivel no jogo principal mais recente da especie', () => {
  const t = {
    ...base,
    version_groups: csv`
      id,identifier,generation_id,order
      20,sword-shield,8,22
      25,scarlet-violet,9,27
      30,legends-za,9,30
    `,
    pokemon_moves: csv`
      pokemon_id,version_group_id,move_id,pokemon_move_method_id,level,order,mastery
      1,20,33,1,1,1,
      1,25,22,1,3,2,
      1,25,33,1,1,1,
      1,25,92,4,0,,
      1,30,75,1,9,1,
      4,20,52,1,4,2,
      4,20,10,1,1,1,
    `,
    moves: csv`
      id,identifier,generation_id,type_id,power,pp,accuracy,priority,target_id,damage_class_id,effect_id,effect_chance,contest_type_id,contest_effect_id,super_contest_effect_id
      10,scratch,1,1,40,35,100,0,10,2,1,,5,1,5
      22,vine-whip,1,12,45,25,100,0,10,2,1,,1,4,5
      33,tackle,1,1,40,35,100,0,10,2,1,,5,1,5
      45,growl,1,1,,40,100,0,11,1,19,,2,7,6
      52,ember,1,10,40,25,100,0,10,3,5,10,1,4,4
      75,razor-leaf,1,12,55,25,95,0,11,2,44,,1,4,5
      92,toxic,1,4,,10,90,0,10,1,34,,3,5,5
    `,
    move_names: csv`
      move_id,local_language_id,name
      10,9,Scratch
      22,5,Fouet Lianes
      22,9,Vine Whip
      33,9,Tackle
      45,9,Growl
      52,9,Ember
      75,9,Razor Leaf
      92,9,Toxic
    `,
    types: [...base.types, { id: '1', identifier: 'normal' }],
  };
  const dex = buildPokedex(t);
  const byId = new Map(dex.pokemon.map((p) => [p.id, p]));

  // Bulbasaur: scarlet-violet (legends-za nao e jogo principal; toxic e por TM).
  assert.deepEqual(byId.get(1).moves, [[1, 33], [3, 22]]);
  // Charmander nao tem dados de scarlet-violet: fica o sword-shield.
  assert.deepEqual(byId.get(4).moves, [[1, 10], [4, 52]]);
  assert.deepEqual(Object.keys(dex.moves).sort(), ['10', '22', '33', '52']);
  assert.deepEqual(dex.moves[22], { name: 'Vine Whip', type: 'grass', power: 45, accuracy: 100, pp: 25, class: 'physical' });
  assert.equal(dex.moves[52].class, 'special');
});

test('a tabela de tipos traz so os tipos de batalha e os multiplicadores diferentes de 1', () => {
  const t = {
    ...base,
    types: csv`
      id,identifier,generation_id,damage_class_id
      1,normal,1,2
      8,ghost,1,2
      10,fire,1,3
      11,water,1,3
      12,grass,1,3
      19,stellar,9,
      10001,unknown,2,
    `,
    type_efficacy: csv`
      damage_type_id,target_type_id,damage_factor
      1,1,100
      1,8,0
      10,10,50
      10,11,50
      10,12,200
      11,10,200
    `,
  };
  const dex = buildPokedex(t);
  assert.deepEqual(dex.types, ['normal', 'ghost', 'fire', 'water', 'grass']);
  assert.deepEqual(dex.efficacy, {
    normal: { ghost: 0 },
    fire: { fire: 0.5, water: 0.5, grass: 2 },
    water: { fire: 2 },
  });
});

test('cada curva de XP lista o total acumulado para chegar em cada nivel, a partir do 1', () => {
  const t = {
    ...base,
    growth_rates: csv`
      id,identifier,formula
      3,fast,\frac{4x^3}{5}
      4,medium-slow,x
    `,
    experience: csv`
      growth_rate_id,level,experience
      3,2,6
      3,1,0
      3,3,21
      4,1,0
      4,2,9
      4,3,57
    `,
  };
  assert.deepEqual(buildPokedex(t).growth, { fast: [0, 6, 21], 'medium-slow': [0, 9, 57] });
});

// Acrescenta especies com o minimo nas outras tabelas, para testes que so
// olham uma parte (evolucao, golpes).
const withSpecies = (t, list) => ({
  ...t,
  pokemon_species: [...t.pokemon_species, ...list.map(([id, identifier, from = '']) => ({
    ...t.pokemon_species[0], id: String(id), identifier, evolves_from_species_id: String(from),
  }))],
  pokemon_species_names: [...t.pokemon_species_names, ...list.map(([id, identifier]) => ({
    pokemon_species_id: String(id), local_language_id: '9', name: identifier,
  }))],
  pokemon: [...t.pokemon, ...list.map(([id, identifier]) => ({
    ...t.pokemon[0], id: String(id), identifier, species_id: String(id),
  }))],
  pokemon_types: [...t.pokemon_types, ...list.map(([id]) => ({ pokemon_id: String(id), type_id: '14', slot: '1' }))],
  pokemon_stats: [...t.pokemon_stats, ...list.flatMap(([id]) => [1, 2, 3, 4, 5, 6].map((s) => ({
    pokemon_id: String(id), stat_id: String(s), base_stat: '50', effort: '0',
  })))],
});

test('a evolucao fica na especie de origem, com o gatilho e as condicoes que importam', () => {
  const t = withSpecies(base, [
    [2, 'ivysaur', 1], [25, 'pikachu'], [26, 'raichu', 25], [133, 'eevee'], [196, 'espeon', 133], [470, 'leafeon', 133],
  ]);
  t.pokemon_evolution = csv`
    id,evolved_species_id,evolution_trigger_id,version_group_id,is_default,trigger_item_id,minimum_level,gender_id,location_id,held_item_id,time_of_day,known_move_id,known_move_type_id,minimum_happiness,minimum_beauty,minimum_affection,relative_physical_stats,party_species_id,party_type_id,trade_species_id,needs_overworld_rain,turn_upside_down,needs_multiplayer,near_special_rock,region_id,required_pokemon_form_id,evolved_pokemon_form_id,used_move_id,minimum_move_count,minimum_steps,minimum_damage_taken,nature_bitmask,condition_expression,percentage_chance
    1,2,1,1,1,,16,,,,,,,,,,,,,,0,0,0,0,,,,,,,,,,
    17,26,3,1,1,83,,,,,,,,,,,,,,,0,0,0,0,,25,,,,,,,,
    109,196,1,3,1,,,,,,day,,,160,,,,,,,0,0,0,0,,133,,,,,,,,
    238,470,1,8,0,,,,8,,,,,,,,,,,,0,0,0,1,,133,,,,,,,,
    407,470,3,20,1,85,,,,,,,,,,,,,,,0,0,0,0,,133,,,,,,,,
    517,26,3,17,1,83,,,,,,,,,,,,,,,0,0,0,0,7,25,10202,,,,,,,
  `;
  t.evolution_triggers = csv`
    id,identifier
    1,level-up
    3,use-item
  `;
  t.items = csv`
    id,identifier,category_id,cost,fling_power,fling_effect_id
    83,thunder-stone,10,3000,30,
    85,leaf-stone,10,3000,30,
  `;
  const byId = new Map(buildPokedex(t).pokemon.map((p) => [p.id, p]));

  assert.deepEqual(byId.get(1).evolutions, [{ to: 2, trigger: 'level-up', level: 16 }]);
  assert.equal(byId.get(2).evolvesFrom, 1);
  // O Raichu de Alola sai do mesmo Pikachu com a mesma pedra: uma entrada so.
  assert.deepEqual(byId.get(25).evolutions, [{ to: 26, trigger: 'use-item', item: 'thunder-stone' }]);
  // Leafeon perto da pedra musgosa so vale em jogos antigos (is_default 0).
  assert.deepEqual(byId.get(133).evolutions, [
    { to: 196, trigger: 'level-up', happiness: 160, time: 'day' },
    { to: 470, trigger: 'use-item', item: 'leaf-stone' },
  ]);
});

test('so vale a evolucao que parte da forma padrao, chegue ela em qualquer forma da especie', () => {
  const t = withSpecies(base, [[664, 'scatterbug'], [665, 'spewpa', 664], [666, 'vivillon', 665]]);
  t.pokemon_evolution = csv`
    id,evolved_species_id,evolution_trigger_id,version_group_id,is_default,trigger_item_id,minimum_level,gender_id,location_id,held_item_id,time_of_day,known_move_id,known_move_type_id,minimum_happiness,minimum_beauty,minimum_affection,relative_physical_stats,party_species_id,party_type_id,trade_species_id,needs_overworld_rain,turn_upside_down,needs_multiplayer,near_special_rock,region_id,required_pokemon_form_id,evolved_pokemon_form_id,used_move_id,minimum_move_count,minimum_steps,minimum_damage_taken,nature_bitmask,condition_expression,percentage_chance
    342,665,1,15,1,,9,,,,,,,,,,,,,,0,0,0,0,,664,665,,,,,,,
    582,665,1,15,1,,9,,,,,,,,,,,,,,0,0,0,0,,10271,10290,,,,,,,
    341,666,1,15,1,,12,,,,,,,,,,,,,,0,0,0,0,,665,10086,,,,,,,
    601,666,1,15,1,,12,,,,,,,,,,,,,,0,0,0,0,,10290,10087,,,,,,,
  `;
  t.evolution_triggers = csv`
    id,identifier
    1,level-up
  `;
  const byId = new Map(buildPokedex(t).pokemon.map((p) => [p.id, p]));
  assert.deepEqual(byId.get(664).evolutions, [{ to: 665, trigger: 'level-up', level: 9 }]);
  // O Spewpa padrao vira um Vivillon de outra estampa: ainda e um Vivillon.
  assert.deepEqual(byId.get(665).evolutions, [{ to: 666, trigger: 'level-up', level: 12 }]);
});

test('le o CSV como objetos pelo cabecalho, com aspas, virgula e quebra de linha dentro do campo', () => {
  const text = 'id,identifier,formula\n1,slow,x^3\n5,erratic,"a, ""b""\nc"\n';
  assert.deepEqual(parseCsv(text), [
    { id: '1', identifier: 'slow', formula: 'x^3' },
    { id: '5', identifier: 'erratic', formula: 'a, "b"\nc' },
  ]);
});
