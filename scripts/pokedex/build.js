/* Transforma os CSVs da PokeAPI (data/v2/csv) nos dados que o app usa.
 * Puro: recebe as tabelas ja lidas, nao baixa nem grava nada. */

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
}

const EN = '9';
const STATS = { 1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe' };
const DAMAGE_CLASS = { 1: 'status', 2: 'physical', 3: 'special' };
const LEVEL_UP = '1';
// Jogos fora da serie principal: golpes e niveis com outras regras
// (Legends tem "maestria", Let's Go tem lista reduzida).
const SPIN_OFFS = new Set([
  'colosseum', 'xd', 'lets-go-pikachu-lets-go-eevee', 'legends-arceus', 'legends-za', 'mega-dimension', 'champions',
]);

const groupBy = (rows, key) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
};

export function buildPokedex(t) {
  const names = new Map(t.pokemon_species_names.filter((r) => r.local_language_id === EN)
    .map((r) => [r.pokemon_species_id, r.name]));
  // Stats, tipos e golpes sao da forma padrao da especie (sem mega, regional...).
  const forms = new Map(t.pokemon.filter((r) => r.is_default === '1').map((r) => [r.species_id, r]));
  const typeNames = new Map(t.types.map((r) => [r.id, r.identifier]));
  const growth = new Map(t.growth_rates.map((r) => [r.id, r.identifier]));
  const types = groupBy(t.pokemon_types, 'pokemon_id');
  const stats = groupBy(t.pokemon_stats, 'pokemon_id');
  const triggers = new Map(t.evolution_triggers.map((r) => [r.id, r.identifier]));
  const items = new Map(t.items.map((r) => [r.id, r.identifier]));
  // is_default 0 sao condicoes de jogos antigos. O app so tem a forma padrao
  // de cada especie, cujo id de forma e o da especie (exceto o Xerneas, que
  // nao evolui): vale a linha que parte dela, chegue em que forma chegar
  // (Raichu de Alola e Lycanroc da meia-noite ainda sao Raichu e Lycanroc).
  const evoRows = groupBy(t.pokemon_evolution.filter((r) => r.is_default === '1'), 'evolved_species_id');
  const evolutions = new Map();
  for (const s of t.pokemon_species) {
    const from = s.evolves_from_species_id;
    if (!from) continue;
    if (!evolutions.has(from)) evolutions.set(from, []);
    const seen = new Set();
    for (const r of evoRows.get(s.id) ?? []) {
      if (r.required_pokemon_form_id && r.required_pokemon_form_id !== from) continue;
      const evo = { to: Number(s.id), trigger: triggers.get(r.evolution_trigger_id) };
      if (r.minimum_level) evo.level = Number(r.minimum_level);
      if (r.trigger_item_id) evo.item = items.get(r.trigger_item_id);
      if (r.minimum_happiness) evo.happiness = Number(r.minimum_happiness);
      if (r.time_of_day) evo.time = r.time_of_day;
      const key = JSON.stringify(evo);
      if (seen.has(key)) continue;
      seen.add(key);
      evolutions.get(from).push(evo);
    }
  }

  const groupOrder = new Map(t.version_groups.filter((r) => !SPIN_OFFS.has(r.identifier))
    .map((r) => [r.id, Number(r.order)]));
  const learned = groupBy(t.pokemon_moves.filter((r) => r.pokemon_move_method_id === LEVEL_UP
    && groupOrder.has(r.version_group_id)), 'pokemon_id');
  const learnset = (pokemonId) => {
    const rows = learned.get(pokemonId) ?? [];
    const latest = Math.max(...rows.map((r) => groupOrder.get(r.version_group_id)));
    return rows.filter((r) => groupOrder.get(r.version_group_id) === latest)
      .sort((a, b) => a.level - b.level || a.order - b.order)
      .map((r) => [Number(r.level), Number(r.move_id)]);
  };

  const pokemon = t.pokemon_species.map((s) => {
    const form = forms.get(s.id);
    return {
      id: Number(s.id),
      name: names.get(s.id),
      gen: Number(s.generation_id),
      types: types.get(form.id).sort((a, b) => a.slot - b.slot).map((r) => typeNames.get(r.type_id)),
      stats: Object.fromEntries(stats.get(form.id).map((r) => [STATS[r.stat_id], Number(r.base_stat)])),
      capture: Number(s.capture_rate),
      baseXp: Number(form.base_experience),
      happiness: Number(s.base_happiness),
      growth: growth.get(s.growth_rate_id),
      legendary: s.is_legendary === '1',
      mythical: s.is_mythical === '1',
      evolvesFrom: s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null,
      evolutions: evolutions.get(s.id) ?? [],
      moves: learnset(form.id),
    };
  });

  const moveNames = new Map(t.move_names.filter((r) => r.local_language_id === EN).map((r) => [r.move_id, r.name]));
  const moves = Object.fromEntries(t.moves.map((m) => [m.id, {
    name: moveNames.get(m.id),
    type: typeNames.get(m.type_id),
    power: m.power ? Number(m.power) : null,
    accuracy: m.accuracy ? Number(m.accuracy) : null,
    pp: Number(m.pp),
    class: DAMAGE_CLASS[m.damage_class_id],
  }]));
  // Stellar, unknown e shadow nao tem multiplicadores: nao sao tipos de batalha.
  const inChart = new Set(t.type_efficacy.flatMap((r) => [r.damage_type_id, r.target_type_id]));
  const battleTypes = t.types.filter((r) => inChart.has(r.id)).sort((a, b) => a.id - b.id);
  const efficacy = {};
  for (const r of t.type_efficacy) {
    if (r.damage_factor === '100') continue;
    const attacker = typeNames.get(r.damage_type_id);
    efficacy[attacker] ??= {};
    efficacy[attacker][typeNames.get(r.target_type_id)] = r.damage_factor / 100;
  }

  const curves = {};
  for (const [id, rows] of groupBy(t.experience, 'growth_rate_id')) {
    curves[growth.get(id)] = rows.sort((a, b) => a.level - b.level).map((r) => Number(r.experience));
  }

  return { pokemon, moves, types: battleTypes.map((r) => r.identifier), efficacy, growth: curves };
}
