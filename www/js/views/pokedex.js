/* Pokedex — os 1025, por geracao. Sprite so de quem ja foi visto: carregar
 * os 1025 GIFs de uma vez pesaria ~140 MB. */

import { game, sprite, ball } from '../pokemon.js';
import { html, raw, setTop } from '../ui.js';

const num = (id) => `#${String(id).padStart(4, '0')}`;

export async function render(view) {
  setTop({ title: 'Pokédex' });
  const { dex, state } = await game();
  const caught = new Set(state.caught ?? []);
  const seen = new Set(state.seen ?? []);
  const sprites = new Set(dex.sprites);

  const cell = (p) => {
    if (!seen.has(p.id)) {
      return html`<li class="dex__cell is-unknown"><span class="dex__num">${num(p.id)}</span><span class="dex__q">?</span></li>`;
    }
    return html`
      <li class="dex__cell${caught.has(p.id) ? ' is-caught' : ''}">
        <span class="dex__num">${num(p.id)}</span>
        ${raw(sprites.has(p.id) ? html`<img class="sprite" src="${sprite(p.id)}" alt="" loading="lazy">` : '<span class="dex__q">·</span>')}
        <span class="dex__name">${p.name}</span>
      </li>`;
  };

  const gens = [...new Set(dex.pokemon.map((p) => p.gen))];
  view.innerHTML = html`
    <div class="dex-stats">
      <span class="pill">${raw(ball(18))}${caught.size} capturados</span>
      <span class="pill">${seen.size} vistos</span>
      <span class="pill">${dex.pokemon.length} no total</span>
    </div>
    ${raw(gens.map((g) => html`
      <section class="sec">
        <h2 class="section-title">Geração ${g}</h2>
        <ul class="dex">${raw(dex.pokemon.filter((p) => p.gen === g).map(cell).join(''))}</ul>
      </section>`).join(''))}
  `;
}
