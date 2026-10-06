/* Batalha de ginasio, turno a turno, com stats, tipos e golpes reais. Puro:
 * o sorteio entra por parametro (`rng`, que devolve [0, 1)), entao a mesma
 * sequencia de sorteios da sempre a mesma luta. O estado leva junto os
 * golpes usados e a tabela de tipos, para `turn` nao precisar da Pokedex. */

// Formula da Gen 3+ com IV 31, EV 0 e natureza neutra.
function statsAt(base, level) {
  const stat = (b) => Math.floor(((2 * b + 31) * level) / 100);
  return {
    hp: stat(base.hp) + level + 10,
    atk: stat(base.atk) + 5,
    def: stat(base.def) + 5,
    spa: stat(base.spa) + 5,
    spd: stat(base.spd) + 5,
    spe: stat(base.spe) + 5,
  };
}

// Como um selvagem no jogo: os 4 ultimos golpes aprendidos ate o nivel.
function learned(species, level) {
  const ids = species.moves.filter(([at]) => at <= level).map(([, id]) => id);
  return [...new Set(ids.reverse())].slice(0, 4).reverse();
}

export function createBattle(mine, theirs, dex) {
  const byId = new Map(dex.pokemon.map((p) => [p.id, p]));
  const fighter = (m) => {
    const species = byId.get(m.species);
    const stats = statsAt(species.stats, m.level);
    return {
      species: m.species, level: m.level, types: species.types,
      moves: m.moves ?? learned(species, m.level), stats, hp: stats.hp,
    };
  };
  const sides = [mine, theirs].map((team) => ({ team: team.map(fighter), active: 0 }));
  const used = new Set(sides.flatMap((s) => s.team.flatMap((f) => f.moves)));
  const moves = Object.fromEntries([...used].map((id) => [id, dex.moves[id]]));
  return { sides, moves, efficacy: dex.efficacy, winner: null };
}

/** Ficha de um pokemon do jogador, com os mesmos numeros da batalha. */
export function summary(mon, dex) {
  const species = dex.pokemon.find((p) => p.id === mon.species);
  return {
    stats: statsAt(species.stats, mon.level),
    moves: learned(species, mon.level).map((id) => ({ id, ...dex.moves[id] })),
    upcoming: species.moves.filter(([at]) => at > mon.level)
      .map(([level, id]) => ({ level, id, ...dex.moves[id] })),
    matchups: Object.fromEntries(Object.keys(dex.efficacy)
      .map((type) => [type, effectiveness(dex, type, species)])
      .filter(([, x]) => x !== 1)),
  };
}

// Golpe de quem nao tem golpe de dano (id 165 na PokeAPI). Sem tipo: nao
// tem mesmo tipo nem efetividade. O recuo do jogo fica de fora.
const STRUGGLE = 165;
const STRUGGLE_MOVE = { name: 'Struggle', type: null, power: 50, accuracy: null, class: 'physical' };

const effectiveness = (state, type, target) => target.types
  .reduce((m, t) => m * (state.efficacy[type]?.[t] ?? 1), 1);

const attackStat = (move, attacker, target) => (move.class === 'physical'
  ? attacker.stats.atk / target.stats.def
  : attacker.stats.spa / target.stats.spd);

// IA: o golpe de dano com maior dano esperado. Golpes de status (e os de dano
// fixo, sem poder) nao fazem nada aqui e ficam de fora.
function bestMove(state, attacker, target) {
  let best = null;
  let bestScore = -1;
  for (const id of attacker.moves) {
    const move = state.moves[id];
    if (!move.power) continue;
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;
    const score = move.power * stab * effectiveness(state, move.type, target)
      * ((move.accuracy ?? 100) / 100) * attackStat(move, attacker, target);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best ?? STRUGGLE;
}

// Formula de dano da Gen 5: base, critico x1,5, fator 85-100%, mesmo tipo
// x1,5 e efetividade, arredondando para baixo a cada passo.
function hit(state, side, attacker, target, id, rng) {
  const move = id === STRUGGLE ? STRUGGLE_MOVE : state.moves[id];
  if (move.accuracy !== null && rng() * 100 >= move.accuracy) return { side, move: id, missed: true };
  const crit = rng() < 1 / 24;
  const roll = 85 + Math.floor(rng() * 16);
  const [a, d] = move.class === 'physical'
    ? [attacker.stats.atk, target.stats.def] : [attacker.stats.spa, target.stats.spd];
  let damage = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.power * a) / d) / 50) + 2;
  if (crit) damage = Math.floor(damage * 1.5);
  damage = Math.floor((damage * roll) / 100);
  if (attacker.types.includes(move.type)) damage = Math.floor(damage * 1.5);
  const eff = move.type ? effectiveness(state, move.type, target) : 1;
  damage = eff === 0 ? 0 : Math.max(1, Math.floor(damage * eff));
  target.hp = Math.max(0, target.hp - damage);
  return { side, move: id, damage, effectiveness: eff, crit };
}

export function turn(before, rng) {
  const state = structuredClone(before);
  const active = state.sides.map((s) => s.team[s.active]);
  const order = active[0].stats.spe === active[1].stats.spe
    ? (rng() < 0.5 ? [0, 1] : [1, 0])
    : active[0].stats.spe > active[1].stats.spe ? [0, 1] : [1, 0];
  const events = [];
  for (const side of order) {
    const attacker = active[side];
    const target = active[1 - side];
    if (attacker.hp === 0 || target.hp === 0) continue;
    const id = bestMove(state, attacker, target);
    events.push(hit(state, side, attacker, target, id, rng));
    if (target.hp === 0) events.push({ side: 1 - side, fainted: true });
  }
  // Fim do turno: o proximo de pe entra no lugar de quem caiu.
  state.sides.forEach((s, side) => {
    if (s.team[s.active].hp > 0) return;
    const next = s.team.findIndex((f) => f.hp > 0);
    if (next === -1) {
      state.winner = 1 - side;
      return;
    }
    s.active = next;
    events.push({ side, switchedTo: next });
  });
  return { state, events };
}
