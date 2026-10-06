import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play } from './game.js';

// Pokedex de mentira no formato de www/data/pokedex.json.
const species = (id, name, extra = {}) => ({
  id, name, gen: 1, types: ['normal'], capture: 45, growth: 'medium-fast', legendary: false, mythical: false,
  evolvesFrom: null, evolutions: [], ...extra,
});
const dex = {
  pokemon: [
    species(4, 'Charmander', { types: ['fire'], evolutions: [{ to: 5, trigger: 'level-up', level: 16 }] }),
    species(5, 'Charmeleon', { evolvesFrom: 4 }),
    species(16, 'Pidgey', { capture: 255 }),
  ],
  sprites: [4, 5, 16],
};

const daily = (id) => ({ id, name: `h${id}`, schedule: { kind: 'daily' }, createdDay: '2026-09-01', order: id });
const base = { habits: [daily(1)], checks: [], events: [], today: '2026-10-05', goal: 0.8 };

test('sem inicial o jogo nao comecou; com ele, o time e o inicial no nivel 1', () => {
  assert.equal(play(base, dex).started, false);
  const state = play({ ...base, events: [{ type: 'start', day: '2026-10-05', species: 4 }] }, dex);
  assert.equal(state.started, true);
  assert.deepEqual(state.party, [{ uid: 1, species: 4, level: 1 }]);
});

const check = (habitId, day) => ({ habitId, day, at: `${day}T12:00:00.000Z` });
const started = (day = '2026-10-05', extra = {}) => ({
  ...base, events: [{ type: 'start', day, species: 4 }], ...extra,
});
// Um check do habito 1 em cada dia de `from` ate `to`.
const everyDay = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(check(1, d.toISOString().slice(0, 10)));
  }
  return out;
};

test('bater a meta sobe o time um nivel na hora; abaixo dela nao sobe, e desmarcar desfaz', () => {
  const two = (checks) => play(started('2026-10-05', { habits: [daily(1), daily(2)], checks }), dex).party[0].level;
  assert.equal(two([check(1, '2026-10-05'), check(2, '2026-10-05')]), 2);
  // 1 de 2 e 50%, abaixo da meta de 80%.
  assert.equal(two([check(1, '2026-10-05')]), 1);
  // Check de antes do inicio nao conta.
  assert.equal(two([check(1, '2026-10-04'), check(2, '2026-10-04')]), 1);
});

test('ao chegar no nivel de evolucao, o pokemon evolui', () => {
  // 21/09 a 05/10 sao 15 dias na meta: 1 + 15 = 16.
  const at16 = play(started('2026-09-21', { checks: everyDay('2026-09-21', '2026-10-05') }), dex).party[0];
  assert.deepEqual([at16.species, at16.level], [5, 16]);
  const at15 = play(started('2026-09-22', { checks: everyDay('2026-09-22', '2026-10-05') }), dex).party[0];
  assert.deepEqual([at15.species, at15.level], [4, 15]);
});

test('dia que termina abaixo da meta derruba um nivel, nunca abaixo do 1 e sem desevoluir', () => {
  // 03/10 na meta (2); 04/10 em branco (1). Hoje (05/10) ainda nao acabou.
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03')] }), dex);
  assert.deepEqual(state.party[0], { uid: 1, species: 4, level: 1 });
  assert.equal(play(started('2026-10-03'), dex).party[0].level, 1);

  // Charmeleon nivel 16 que cai para 15 continua Charmeleon.
  const evolved = play(started('2026-09-20', { checks: everyDay('2026-09-20', '2026-10-04'), today: '2026-10-06' }), dex);
  assert.deepEqual(evolved.party[0], { uid: 1, species: 5, level: 15 });
});

test('comeca com 5 Pokebolas e ganha uma a cada dia que fecha na meta', () => {
  assert.equal(play(started(), dex).balls, 5);
  // 10-03 na meta (+1), 10-04 abaixo (nada); hoje ainda nao fechou.
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03'), check(1, '2026-10-05')] }), dex);
  assert.equal(state.balls, 6);
});

test('o selvagem do dia e sempre o mesmo naquela data e e uma forma basica com sprite, lendarios inclusive', () => {
  const wider = {
    ...dex,
    pokemon: [...dex.pokemon,
      species(150, 'Mewtwo', { legendary: true, capture: 3 }),
      species(151, 'Mew', { mythical: true, capture: 45 }),
      species(19, 'Rattata'),
      species(906, 'Sprigatito', { gen: 9 })],
    sprites: [...dex.sprites, 150, 151, 906], // Rattata sem sprite
  };
  const seen = new Set();
  for (let i = 1; i <= 28; i++) {
    const today = `2026-10-${String(i).padStart(2, '0')}`;
    const input = started('2026-10-01', { today });
    const { wild } = play(input, wider);
    assert.equal(play(input, wider).wild.species, wild.species);
    seen.add(wild.species);
  }
  // O Charmander e o inicial: ja capturado, nao aparece.
  assert.deepEqual([...seen].sort((a, b) => a - b), [16, 150, 151, 906]);
});

test('o selvagem nunca e quem voce ja capturou; o que escapou pode voltar', () => {
  const two = { ...dex, pokemon: [...dex.pokemon, species(19, 'Rattata')], sprites: [...dex.sprites, 19] };
  const wildsFrom = (events, from) => {
    const out = new Set();
    for (let i = from; i <= 28; i++) {
      const today = `2026-10-${String(i).padStart(2, '0')}`;
      out.add(play(started('2026-10-01', { today, events }), two).wild.species);
    }
    return [...out].sort((a, b) => a - b);
  };
  const start = { type: 'start', day: '2026-10-01', species: 4 };
  assert.deepEqual(wildsFrom([start], 1), [16, 19]);
  // Pidgey capturado no dia 2: dali em diante so Rattata.
  assert.deepEqual(wildsFrom([start, { type: 'catch', day: '2026-10-02', species: 16, level: 2, caught: true }], 3), [19]);
  // Todos pegos: nao aparece mais selvagem na regiao.
  const all = [start, { type: 'catch', day: '2026-10-02', species: 16, level: 2, caught: true },
    { type: 'catch', day: '2026-10-03', species: 19, level: 2, caught: true }];
  assert.equal(play(started('2026-10-01', { today: '2026-10-04', events: all }), two).wild, null);
  // Pidgey que escapou continua aparecendo.
  assert.deepEqual(wildsFrom([start, { type: 'catch', day: '2026-10-02', species: 16, level: 2, caught: false }], 3), [16, 19]);
});

test('cada habito feito hoje enfraquece o selvagem; a chance segue a formula oficial e so da para jogar na meta', () => {
  const onlyRattata = { ...dex, pokemon: [...dex.pokemon, species(19, 'Rattata')], sprites: [4, 5, 19] };
  const today = (checks) => play(started('2026-10-05', { habits: [daily(1), daily(2)], checks }), onlyRattata).wild;

  // Taxa 45, Pokebola comum: (3*max - 2*vida) * 45 / (3*max), sobre 255.
  const none = today([]);
  assert.deepEqual(none, { species: 19, level: 2, hp: 1, chance: 15 / 255, caught: false, canThrow: false });
  const half = today([check(1, '2026-10-05')]);
  assert.deepEqual([half.hp, half.chance, half.canThrow], [0.5, 30 / 255, false]);
  // Vida minima de 1 em 100: (300 - 2) * 45 / 300 = 44,7, arredonda para 44.
  const all = today([check(1, '2026-10-05'), check(2, '2026-10-05')]);
  assert.deepEqual([all.hp, all.chance, all.canThrow], [0, 44 / 255, true]);
});

test('cada arremesso gasta uma Pokebola e a captura entra no time no nivel 1', () => {
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
  // O Charmander sobe nos dois dias; o Pidgey entra no 1, mesmo pego no nivel
  // 3, e nao sobe no dia em que foi pego (a meta ja estava batida).
  assert.deepEqual(state.party, [
    { uid: 1, species: 4, level: 3 },
    { uid: 2, species: 16, level: 1 },
  ]);
});

test('do setimo em diante a captura vai para a caixa, que fica congelada: nao sobe nem cai', () => {
  const catches = Array.from({ length: 6 }, () => ({ type: 'catch', day: '2026-10-03', species: 16, level: 3, caught: true }));
  const state = play(started('2026-10-01', {
    today: '2026-10-04',
    checks: [check(1, '2026-10-01'), check(1, '2026-10-02')],
    events: [{ type: 'start', day: '2026-10-01', species: 4 }, ...catches],
  }), dex);
  assert.equal(state.party.length, 6);
  // 03/10 em branco: o time cai um nivel (os do 1 ficam no 1); a caixa congela.
  assert.deepEqual(state.party.map((m) => m.level), [2, 1, 1, 1, 1, 1]);
  assert.deepEqual(state.box, [{ uid: 7, species: 16, level: 1 }]);
  assert.equal(state.balls, 1);
});

test('o selvagem de hoje, depois de capturado, nao aceita mais Pokebola', () => {
  const input = started('2026-10-05', { checks: [check(1, '2026-10-05')] });
  const { wild } = play(input, dex);
  const events = [...input.events, { type: 'catch', day: '2026-10-05', species: wild.species, level: wild.level, caught: true }];
  const after = play({ ...input, events }, dex).wild;
  assert.deepEqual([after.caught, after.canThrow], [true, false]);
  // Com ele no time a media cai, mas o selvagem de hoje fica no nivel em que foi pego.
  assert.equal(after.level, wild.level);
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

test('vencer o campeao manda time e caixa para o Hall da Fama e pede um inicial para a proxima regiao', () => {
  const events = [...started().events, ...wins(4)];
  const state = play(started('2026-10-05', { events }), leagueDex);
  assert.deepEqual([state.challenge.region, state.challenge.name], ['johto', 'Falkner']);
  assert.deepEqual(state.hall, [{ region: 'kanto', team: [{ uid: 1, species: 4, level: 1 }], box: [] }]);
  assert.deepEqual([state.party, state.box, state.wild], [[], [], null]);
  assert.deepEqual(state.needsStarter, { region: 'johto', gen: 2 });
});

test('com o novo inicial a jornada recomeca no nivel 1', () => {
  const events = [...started().events, ...wins(4), { type: 'start', day: '2026-10-05', species: 7 }];
  const state = play(started('2026-10-05', { events }), leagueDex);
  assert.deepEqual(state.party, [{ uid: 2, species: 7, level: 1 }]);
  assert.equal(state.needsStarter, null);
  assert.deepEqual(state.caught, [4, 7]);
});

test('a Pokedex marca como capturado o que voce teve (evolucoes inclusive) e como visto tambem os selvagens de cada dia', () => {
  const onlyPidgeyWild = { ...dex, sprites: [16] };
  const state = play(started('2026-09-21', {
    checks: everyDay('2026-09-21', '2026-10-05'),
    events: [
      { type: 'start', day: '2026-09-21', species: 4 },
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

test('cada dia na meta da um Doce Raro, ja no dia', () => {
  // 03/10 na meta, 04/10 em branco, hoje (05/10) na meta.
  const state = play(started('2026-10-03', { checks: [check(1, '2026-10-03'), check(1, '2026-10-05')] }), dex);
  assert.equal(state.candies, 2);
});

test('o Doce Raro sobe 1 nivel de quem esta abaixo do mais alto do time, ate empatar; no mais alto, nao vale', () => {
  const candy = (uid) => ({ type: 'candy', day: '2026-10-03', uid });
  const state = play(started('2026-10-01', {
    today: '2026-10-03',
    checks: everyDay('2026-10-01', '2026-10-03'),
    events: [
      { type: 'start', day: '2026-10-01', species: 4 },
      { type: 'catch', day: '2026-10-02', species: 16, level: 3, caught: true },
      candy(2), candy(2), candy(2), candy(1),
    ],
  }), dex);
  // Charmander: 1 + 3 dias = 4. Pidgey: entra no 1 em 02/10, sobe em 03/10
  // (2) e com dois doces empata no 4; o terceiro e o do Charmander nao valem.
  assert.deepEqual(state.party.map((m) => m.level), [4, 4]);
  assert.equal(state.candies, 3 - 2);
});

test('voce escolhe quem fica no time e em que ordem; o resto vai para a caixa', () => {
  const catches = Array.from({ length: 6 }, () => ({ type: 'catch', day: '2026-10-01', species: 16, level: 3, caught: true }));
  const state = play(started('2026-10-01', {
    today: '2026-10-02',
    checks: everyDay('2026-10-01', '2026-10-02'),
    events: [
      { type: 'start', day: '2026-10-01', species: 4 },
      ...catches,
      { type: 'party', day: '2026-10-02', uids: [7, 1, 3, 4, 5, 6] },
    ],
  }), dex);
  assert.deepEqual(state.party.map((m) => m.uid), [7, 1, 3, 4, 5, 6]);
  assert.deepEqual(state.box, [{ uid: 2, species: 16, level: 1 }]);
  // O 7 entrou no time e subiu em 02/10; o 2 foi para a caixa e congelou.
  assert.equal(state.party[0].level, 2);
});

test('o desafio traz todos os passos da regiao, com o time de cada chefe ja na variante do seu inicial', () => {
  const { challenge } = play(started(), leagueDex);
  assert.deepEqual(challenge.steps.map((s) => [s.kind, s.index, s.name]), [
    ['gym', 0, 'Brock'], ['gym', 1, 'Misty'], ['elite', 0, 'Lorelei'], ['champion', 0, 'Blue'],
  ]);
  assert.equal(challenge.current, 0);
  // Charmander: o Blue leva o Blastoise.
  assert.deepEqual(challenge.steps[3].team.map((p) => p.species), [18, 9]);
});

test('cada 7 dias seguidos na meta dao uma Pedra da Evolucao, ja no setimo; dia abaixo da meta zera a contagem', () => {
  const stones = (checks, today = '2026-10-14') => play(started('2026-10-01', { checks, today }), dex).stones;
  assert.equal(stones([]), 0);
  // 01 a 06: seis dias seguidos, ainda nao.
  assert.equal(stones(everyDay('2026-10-01', '2026-10-06')), 0);
  // 01 a 07: a pedra vem no setimo, na hora.
  assert.equal(stones(everyDay('2026-10-01', '2026-10-07'), '2026-10-07'), 1);
  // 01 a 14: duas.
  assert.equal(stones(everyDay('2026-10-01', '2026-10-14')), 2);
  // 01 a 05, falha no 06, 07 a 13 (sete de novo): so a segunda sequencia conta.
  assert.equal(stones([...everyDay('2026-10-01', '2026-10-05'), ...everyDay('2026-10-07', '2026-10-13')]), 1);
  assert.equal(play(started('2026-10-01', { checks: everyDay('2026-10-01', '2026-10-09'), today: '2026-10-09' }), dex).metStreak, 9);
});

test('a Pedra evolui qualquer pokemon que evolui por pedra, troca ou amizade, para a evolucao escolhida', () => {
  const stoneDex = {
    ...dex,
    pokemon: [...dex.pokemon,
      species(133, 'Eevee', {
        evolutions: [{ to: 134, trigger: 'use-item', item: 'water-stone' }, { to: 196, trigger: 'level-up', happiness: 160 }],
      }),
      species(134, 'Vaporeon', { evolvesFrom: 133 }), species(196, 'Espeon', { evolvesFrom: 133 })],
  };
  const week = everyDay('2026-10-01', '2026-10-07');
  const withEevee = (stoneEvents, starter = 133) => play(started('2026-10-01', {
    today: '2026-10-07',
    checks: week,
    events: [{ type: 'start', day: '2026-10-01', species: starter }, ...stoneEvents],
  }), stoneDex);
  const use = (to, day = '2026-10-07') => ({ type: 'stone', day, uid: 1, to });

  const espeon = withEevee([use(196)]);
  assert.deepEqual([espeon.party[0].species, espeon.stones], [196, 0]);
  assert.ok(espeon.caught.includes(196));
  // Sem pedra ainda (dia 6), nao evolui.
  assert.equal(withEevee([use(134, '2026-10-06')]).party[0].species, 133);
  // So uma pedra: a segunda tentativa e ignorada.
  assert.deepEqual(withEevee([use(134), { ...use(134), uid: 1 }]).party[0].species, 134);
  // Evolucao por nivel nao vale pedra (Charmander -> Charmeleon), nem especie que nao e evolucao dele.
  assert.deepEqual([withEevee([use(5)], 4).party[0].species, withEevee([use(5)], 4).stones], [4, 1]);
  assert.equal(withEevee([use(16)]).party[0].species, 133);
});

test('o selvagem e a primeira forma da familia, de qualquer geracao, em qualquer regiao', () => {
  const babies = {
    ...dex,
    pokemon: [...dex.pokemon,
      species(25, 'Pikachu', { evolvesFrom: 172 }), species(26, 'Raichu', { evolvesFrom: 25 }),
      species(172, 'Pichu', { gen: 2 })],
    sprites: [25, 26, 172],
  };
  const seen = new Set();
  for (let i = 1; i <= 28; i++) {
    seen.add(play(started('2026-10-01', { today: `2026-10-${String(i).padStart(2, '0')}` }), babies).wild.species);
  }
  // Em Kanto aparece o Pichu, mesmo sendo da geracao 2; Pikachu e Raichu vem por evolucao.
  assert.deepEqual([...seen], [172]);
});
