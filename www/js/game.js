/* Motor do jogo: o estado inteiro (time, niveis, Pokebolas, selvagem do dia)
 * sai do historico, dia a dia, a partir dos checks e das escolhas do
 * jogador (`events`). Marcar um dia passado refaz a conta sozinho. Puro, pra
 * rodar sob node --test; a Pokedex (www/data/pokedex.json) entra pronta. */

import { dayProgress, todayList, weekMisses } from './habits.js';
import { addDays, weekOf } from './reminder.js';

// Todo pokemon novo, inicial ou capturado, entra no nivel 1.
const START_LEVEL = 1;
const START_BALLS = 5;
const BALLS_PER_DAY = 3;
const PARTY_SIZE = 6;
const STONE_STREAK = 7;

// Sorteio que depende so da data: o selvagem de um dia e sempre o mesmo,
// em qualquer aparelho e a cada recalculo. FNV-1a + um passo do mulberry32.
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 2 ** 32;
}

// Evolucao por nivel puro (sem horario, item ou outra condicao): acontece
// sozinha ao subir de nivel. Todas as outras (pedra, troca, amizade...) so
// com a Pedra da Evolucao, para a que o jogador escolher.
export const byLevel = (e) => e.trigger === 'level-up' && e.level && Object.keys(e).length === 3;

/** As evolucoes da especie que pedem a Pedra da Evolucao. */
export const stoneEvolutions = (species) => species.evolutions.filter((e) => !byLevel(e));

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
  // Dias seguidos na meta (hoje entra quando bate); a cada 7, uma Pedra.
  let metStreak = 0;
  let stones = 0;
  let lastDay = null;
  let lastWeek = null;
  const caught = new Set();
  // Pegos hoje: continuam podendo ser o selvagem de hoje (o que acabou de ser
  // capturado), mas nao o de amanha.
  let caughtToday = new Set();
  const seen = new Set();
  const plain = (list) => list.map(({ caughtOn: _, ...m }) => m);

  // So existe um inicial, o do comeco do jogo; outros `start` sao ignorados.
  const begin = (e) => {
    if (e !== start) return;
    party.push({ uid: nextUid++, species: e.species, level: START_LEVEL });
    caught.add(e.species);
  };

  const avgLevel = () => Math.round(party.reduce((s, m) => s + m.level, 0) / party.length);
  const progressOf = (day) => dayProgress(todayList(input.habits, input.checks, day));

  // Evolucao dividida no mesmo nivel (Tyrogue, Wurmple): vai para o ramo que
  // ainda nao foi pego, para dar para ter todos.
  const evolve = (mon) => {
    const ready = byId.get(mon.species).evolutions.filter((e) => byLevel(e) && mon.level >= e.level);
    const next = ready.find((e) => !caught.has(e.to)) ?? ready[0];
    if (!next) return;
    mon.species = next.to;
    caught.add(mon.species);
    evolve(mon);
  };

  // Dia na meta: o time sobe um nivel, ja no dia (desmarcar desfaz, porque
  // tudo e recalculado). Na virada, dia na meta ainda ganha 3 Pokebolas;
  // abaixo dela o time cai um nivel (nunca abaixo do 1) sem desevoluir.
  const levelUp = (day) => {
    const progress = progressOf(day);
    if (progress === null || progress < input.goal) return;
    candies++;
    metStreak++;
    if (metStreak % STONE_STREAK === 0) stones++;
    // Quem foi pego hoje entra no nivel da captura: a meta ja estava batida.
    for (const mon of party.filter((m) => m.caughtOn !== day)) {
      mon.level = Math.min(100, mon.level + 1);
      evolve(mon);
    }
  };
  // A caixa fica congelada: so o time sobe e cai.
  const levelDown = (levels) => {
    for (const mon of party) mon.level = Math.max(1, mon.level - levels);
  };
  const turnover = (day) => {
    const progress = progressOf(day);
    if (progress !== null) {
      lastDay = { day, progress, met: progress >= input.goal };
      if (lastDay.met) balls += BALLS_PER_DAY;
      else { metStreak = 0; levelDown(1); }
    }
    // Na virada do domingo, cada vez que faltou num semanal tira 1 nivel. A
    // semana em que o jogo comecou no meio nao cobra.
    if (weekOf(addDays(day, 1)) === addDays(day, 1) && start.day <= weekOf(day)) {
      lastWeek = { week: weekOf(day), missing: weekMisses(input.habits, input.checks, weekOf(day)) };
      levelDown(lastWeek.missing);
    }
  };

  // A tela sorteia o arremesso com a chance de `wild` e grava o resultado:
  // o recalculo nao sorteia de novo.
  const throwBall = (e) => {
    balls--;
    if (!e.caught) return;
    if (!caught.has(e.species)) caughtToday.add(e.species);
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

  // Pedra da Evolucao: qualquer pokemon (time ou caixa) para uma das suas
  // evolucoes que nao sao por nivel. Sem pedra ou destino invalido, ignorado.
  const useStone = (e) => {
    const mon = [...party, ...box].find((m) => m.uid === e.uid);
    if (stones <= 0 || !mon || !stoneEvolutions(byId.get(mon.species)).some((x) => x.to === e.to)) return;
    stones--;
    mon.species = e.to;
    caught.add(mon.species);
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
  // Vencer o campeao fecha a jornada: o time vencedor vai para o Hall da Fama
  // e sai de uso. A caixa vira o time da proxima regiao, todos no nivel 1 (sem
  // desevoluir), para os niveis originais da liga seguinte valerem.
  const fight = (e) => {
    if (!e.won) { lostOn = e.day; return; }
    lostOn = null;
    step++;
    if (step < stepsOf(regions[region]).length) return;
    hall.push({ region: regions[region].id, team: plain(party) });
    const rest = box.splice(0);
    for (const mon of rest) mon.level = START_LEVEL;
    party.splice(0, party.length, ...rest.slice(0, PARTY_SIZE));
    box.push(...rest.slice(PARTY_SIZE));
    region++;
    step = 0;
  };

  // Selvagens: a primeira forma de cada familia, de qualquer geracao e em
  // qualquer regiao (as evolucoes vem por nivel ou pedra). Lendarios e
  // miticos inclusive e so quem tem sprite. Volta a aparecer so enquanto
  // falta alguem da familia que nao foi pego nem e alcancavel pelos seus (time
  // e caixa; o Hall nao conta): um Eevee ja virado Vaporeon traz outro Eevee,
  // um ainda sem evoluir nao. Sem ninguem para pegar, nao aparece selvagem.
  const sprites = new Set(dex.sprites);
  const basics = dex.pokemon.filter((p) => p.evolvesFrom === null && sprites.has(p.id));
  const families = new Map();
  const familyOf = (id) => {
    if (!families.has(id)) {
      const next = byId.get(id)?.evolutions ?? [];
      families.set(id, [id, ...next.flatMap((e) => familyOf(e.to))]);
    }
    return families.get(id);
  };
  const wildOf = (day) => {
    const reachable = new Set([...party, ...box].flatMap((m) => familyOf(m.species)));
    const missing = (p) => familyOf(p.id).some((id) => !caught.has(id) && !reachable.has(id));
    const pool = basics.filter((p) => missing(p) || caughtToday.has(p.id));
    return pool.length ? pool[Math.floor(seeded(day) * pool.length)] : null;
  };

  for (let day = start.day; day <= input.today; day = addDays(day, 1)) {
    caughtToday = new Set();
    for (const e of input.events) {
      if (e.day !== day) continue;
      if (e.type === 'start') begin(e);
      if (e.type === 'catch') throwBall(e);
      if (e.type === 'battle') fight(e);
      if (e.type === 'party') arrange(e);
    }
    // Sem time (caixa vazia depois de um campeao), o selvagem ainda aparece:
    // a primeira captura forma o time.
    const wild = wildOf(day);
    if (wild) seen.add(wild.id);
    levelUp(day);
    // Doce e pedra depois da subida do dia: os ganhos hoje ja valem hoje.
    for (const e of input.events) {
      if (e.day !== day) continue;
      if (e.type === 'candy') useCandy(e);
      if (e.type === 'stone') useStone(e);
    }
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
    started: true, party: plain(party), box: plain(box), hall, balls, candies, stones, metStreak, challenge, lastDay, lastWeek,
    caught: sorted(caught), seen: sorted(new Set([...seen, ...caught])),
    wild: null,
  };

  const species = wildOf(input.today);
  if (!species) return result;
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
    level: catchToday?.level ?? (party.length ? Math.max(2, avgLevel() - 2) : 2),
    hp,
    chance: Math.min(1, odds / 255),
    caught: Boolean(catchToday),
  };
  wild.canThrow = !wild.caught && progress !== null && progress >= input.goal && balls > 0;
  return { ...result, wild };
}
