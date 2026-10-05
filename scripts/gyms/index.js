// Gera www/data/gyms.json: ginasios, Elite Four e campeao de cada regiao, com
// os times dos jogos (nuzlocke.data). Uso: npm run gyms

import { writeFile } from 'node:fs/promises';
import { parseCsv } from '../pokedex/build.js';
import { buildLeague } from './build.js';

const LEAGUES = 'https://raw.githubusercontent.com/domtronn/nuzlocke.data/HEAD/leagues';
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const OUT = new URL('../../www/data/gyms.json', import.meta.url);

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
// Versoes escolhidas: Black (Drayden) e Sword (Bea, Gordie). Alola nao tem
// ginasio: entram as 10 provas e grandes provas, na ordem do jogo. Galar nao
// tem Elite Four: entram os finalistas da Champion Cup.
const REGIONS = [
  { id: 'kanto', name: 'Kanto', game: 'Red/Blue', file: 'rb', gyms: range('', 8), elite: range('e', 4), champion: 'c' },
  { id: 'johto', name: 'Johto', game: 'Gold/Silver', file: 'gsc', gyms: range('', 8), elite: range('e', 4), champion: 'c' },
  { id: 'hoenn', name: 'Hoenn', game: 'Ruby/Sapphire', file: 'rs', gyms: range('', 8), elite: range('e', 4), champion: 'c' },
  { id: 'sinnoh', name: 'Sinnoh', game: 'Diamond/Pearl', file: 'dp', gyms: range('', 8), elite: range('e', 4), champion: 'c' },
  { id: 'unova', name: 'Unova', game: 'Black', file: 'bw', gyms: [...range('', 7), '8a'], elite: range('e', 4), champion: 'c' },
  { id: 'kalos', name: 'Kalos', game: 'X/Y', file: 'xy', gyms: range('', 8), elite: range('e', 4), champion: 'c1' },
  { id: 'alola', name: 'Alola', game: 'Sun/Moon', file: 'sm', gyms: ['1', '2', '3', '4', '6', '7', '8', '9', '10', '11'], elite: range('e', 4), champion: 'c' },
  { id: 'galar', name: 'Galar', game: 'Sword', file: 'swsh', gyms: ['1', '2', '3', '4a', '5', '6a', '7', '8'], elite: ['e4', 'e5a', 'e6'], champion: 'ca' },
  { id: 'paldea', name: 'Paldea', game: 'Scarlet/Violet', file: 'sv', gyms: range('', 8), elite: range('e', 4), champion: 'ec' },
];

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
};

const [pokemon, species, moves] = await Promise.all(['pokemon', 'pokemon_species', 'moves']
  .map(async (name) => parseCsv(await get(`${CSV}/${name}.csv`))));
// Formas (aegislash-shield) pela tabela pokemon; nomes so de especie
// (jellicent, tatsugiri), cuja forma padrao tem outro nome, pela de especies.
const ids = {
  species: new Map([...species.map((s) => [s.identifier, Number(s.id)]),
    ...pokemon.map((p) => [p.identifier, Number(p.species_id)])]),
  moves: new Map(moves.map((m) => [m.identifier, Number(m.id)])),
};

// Erros de tipo na fonte (so o rotulo; o time esta certo).
const TYPE_FIXES = { hoenn: { Drake: 'dragon' } };

const regions = await Promise.all(REGIONS.map(async ({ file, ...region }) => {
  const league = buildLeague(await get(`${LEAGUES}/${file}.txt`), region, ids);
  for (const b of [...league.gyms, ...league.elite, league.champion]) {
    b.type = TYPE_FIXES[region.id]?.[b.name] ?? b.type;
  }
  return { id: region.id, name: region.name, game: region.game, ...league };
}));

// Um chefe por linha: o diff de uma atualizacao fica legivel.
const boss = (b) => `    ${JSON.stringify(b)}`;
const json = `{
"regions": [
${regions.map((r) => `  {"id": ${JSON.stringify(r.id)}, "name": ${JSON.stringify(r.name)}, "game": ${JSON.stringify(r.game)},
  "gyms": [
${r.gyms.map(boss).join(',\n')}
  ],
  "elite": [
${r.elite.map(boss).join(',\n')}
  ],
  "champion":
${boss(r.champion)}
  }`).join(',\n')}
]
}
`;
JSON.parse(json);
await writeFile(OUT, json);
for (const r of regions) {
  console.log(`${r.name}: ${[...r.gyms, ...r.elite, r.champion].map((b) => `${b.name}(${b.type ?? '-'} ${Math.max(...b.team.map((p) => p.level))})`).join(', ')}`);
}
