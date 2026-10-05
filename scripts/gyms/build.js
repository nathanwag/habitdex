/* Le os arquivos leagues/<jogo>.txt do nuzlocke.data (times dos chefes de
 * cada jogo) e monta ginasios, Elite Four e campeao de uma regiao.
 *
 * Formato: "--id|Nome|tipo|imagem" abre um chefe; cada linha seguinte e
 * "especie|nivel|golpes|habilidade|item|inicial". Puro: o texto e os mapas
 * de identificador para id da PokeAPI entram prontos. */

function parse(text) {
  const bosses = new Map();
  let current = null;
  for (const line of text.split('\n').map((l) => l.trim())) {
    if (line.startsWith('--')) {
      const [id, name, type] = line.slice(2).split('|');
      current = { name, type: type || null, team: [] };
      bosses.set(id, current);
    } else if (current && line && !line.startsWith('#') && !line.startsWith('==')) {
      current.team.push(line.split('|'));
    }
  }
  return bosses;
}

export function buildLeague(text, layout, ids) {
  const bosses = parse(text);
  const boss = (id) => {
    const { name, type, team } = bosses.get(id);
    const find = (kind, map, key) => {
      if (!map.has(key)) throw new Error(`${name}: ${kind} "${key}" nao existe na PokeAPI`);
      return map.get(key);
    };
    return {
      name,
      type,
      team: team.map(([species, level, moves, , , starter]) => {
        // "aegislash-shield>aegislash": a forma da PokeAPI vem antes do ">".
        const p = {
          species: find('especie', ids.species, species.split('>')[0]),
          level: Number(level),
          moves: moves.split(',').map((m) => find('golpe', ids.moves, m)),
        };
        if (starter) p.starter = starter;
        return p;
      }),
    };
  };
  return { gyms: layout.gyms.map(boss), elite: layout.elite.map(boss), champion: boss(layout.champion) };
}
