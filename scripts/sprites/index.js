// Baixa os sprites animados 3D (os do Pokemon Showdown, espelhados no repo de
// sprites da PokeAPI) para www/sprites/<id>/{front,back}.gif e gera
// www/data/sprites.json. Uso: npm run sprites (depois do npm run data).

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown';
const WWW = new URL('../../www/', import.meta.url);

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt === 4) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

const dex = JSON.parse(await readFile(new URL('data/pokedex.json', WWW), 'utf8'));
await rm(new URL('sprites/', WWW), { recursive: true, force: true });

const ok = [];
const missing = [];
const queue = dex.pokemon.map((p) => p.id);
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const id = queue.shift();
    const [front, back] = await Promise.all([get(`${SOURCE}/${id}.gif`), get(`${SOURCE}/back/${id}.gif`)]);
    // Sem um dos lados nao da para batalhar: fica de fora inteiro.
    if (front && back) {
      await mkdir(new URL(`sprites/${id}/`, WWW), { recursive: true });
      await writeFile(new URL(`sprites/${id}/front.gif`, WWW), front);
      await writeFile(new URL(`sprites/${id}/back.gif`, WWW), back);
      ok.push(id);
    } else missing.push(id);
    const done = ok.length + missing.length;
    if (done % 100 === 0) console.log(`${done}/${dex.pokemon.length}`);
  }
}));

ok.sort((a, b) => a - b);
missing.sort((a, b) => a - b);
await writeFile(new URL('data/sprites.json', WWW), `${JSON.stringify({ ids: ok })}\n`);
console.log(`${ok.length} com sprite; sem sprite (${missing.length}): ${missing.join(' ')}`);
