// Gera www/data/pokedex.json a partir dos CSVs da PokeAPI.
// Uso: npm run data

import { mkdir, writeFile } from 'node:fs/promises';
import { buildPokedex, parseCsv } from './build.js';

const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const OUT = new URL('../../www/data/pokedex.json', import.meta.url);
const TABLES = [
  'pokemon_species', 'pokemon_species_names', 'pokemon', 'pokemon_types', 'pokemon_stats', 'types',
  'growth_rates', 'experience', 'pokemon_evolution', 'evolution_triggers', 'items', 'pokemon_moves',
  'version_groups', 'moves', 'move_names', 'type_efficacy',
];

const tables = Object.fromEntries(await Promise.all(TABLES.map(async (name) => {
  const res = await fetch(`${SOURCE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  return [name, parseCsv(await res.text())];
})));

const dex = buildPokedex(tables);

// Um pokemon e um golpe por linha: o diff de uma atualizacao fica legivel.
const lines = (entries) => entries.map((e) => `  ${e}`).join(',\n');
const json = `{
"types": ${JSON.stringify(dex.types)},
"efficacy": ${JSON.stringify(dex.efficacy)},
"growth": ${JSON.stringify(dex.growth)},
"moves": {
${lines(Object.entries(dex.moves).map(([id, m]) => `${JSON.stringify(id)}: ${JSON.stringify(m)}`))}
},
"pokemon": [
${lines(dex.pokemon.map((p) => JSON.stringify(p)))}
]
}
`;
await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, json);
console.log(`${dex.pokemon.length} pokemon, ${Object.keys(dex.moves).length} golpes, ${(json.length / 1024).toFixed(0)} KB`);
