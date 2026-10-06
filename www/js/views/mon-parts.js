/* Pedacos das fichas de pokemon, iguais no Time (#/pokemon) e na Pokedex
 * (#/pokedex/pokemon). */

import { sprite, TYPE_NAMES } from '../pokemon.js';
import { html, raw } from '../ui.js';

const STATS = [
  ['hp', 'PS'], ['atk', 'Ataque'], ['def', 'Defesa'],
  ['spa', 'At. Esp.'], ['spd', 'Def. Esp.'], ['spe', 'Velocidade'],
];
const CLASSES = { physical: 'Físico', special: 'Especial', status: 'Status' };

export const typeTag = (t) => html`<span class="type type--${t}">${TYPE_NAMES[t] ?? t}</span>`;
const times = (x) => `×${String(x).replace('.', ',')}`;

export function hero(species, sub, { pic = true } = {}) {
  return html`
    <section class="mon-hero">
      <span class="mon-hero__pic">${raw(pic ? html`<img class="sprite" src="${sprite(species.id)}" alt="">` : '')}</span>
      <span class="mon-hero__num">#${String(species.id).padStart(3, '0')}</span>
      <h2 class="mon-hero__name">${species.name}</h2>
      <span class="mon-hero__types">${raw(species.types.map(typeTag).join(''))}</span>
      <span class="mon-hero__sub">${sub}</span>
    </section>`;
}

/** Status: `values` e o numero mostrado; a barra e sempre a base da especie. */
export function statsCard(title, values, base) {
  return html`
    <section class="sec">
      <h2 class="section-title">${title}</h2>
      <div class="card card__pad">
        <ul class="statlist">
          ${raw(STATS.map(([k, label]) => html`
            <li class="mon-stat">
              <span class="mon-stat__label">${label}</span>
              <span class="mon-stat__value">${values[k]}</span>
              <span class="mon-stat__bar"><span style="width:${Math.min(100, Math.round((base[k] / 180) * 100))}%"></span></span>
            </li>`).join(''))}
        </ul>
      </div>
    </section>`;
}

// So o que o golpe tem: sem poder (status, dano fixo), a parte do poder some.
const moveLine = (m, full) => [
  CLASSES[m.class] ?? m.class,
  m.power && `Poder ${m.power}`,
  full && (m.accuracy == null ? 'Sempre acerta' : `Precisão ${m.accuracy}%`),
  full && m.pp && `PP ${m.pp}`,
].filter(Boolean).join(' · ');

export const moveCard = (m) => html`
  <li class="move${m.power ? '' : ' is-inert'}">
    <span class="move__head">
      <strong class="grow">${m.name}</strong>
      ${raw(typeTag(m.type))}
    </span>
    <span class="move__sub">${moveLine(m, true)}</span>
  </li>`;

/** Golpes com o nivel em que sao aprendidos (0 = ao evoluir). */
export const learnList = (title, moves) => (moves.length ? html`
  <section class="sec">
    <h2 class="section-title">${title}</h2>
    <ul class="moves">${raw(moves.map((m) => html`
      <li class="move move--next${m.power ? '' : ' is-inert'}">
        <span class="move__level">${m.level ? `Nv ${m.level}` : 'Evol.'}</span>
        <span class="grow"><strong>${m.name}</strong><br>
          <span class="move__sub">${moveLine(m, false)}</span></span>
        ${raw(typeTag(m.type))}
      </li>`).join(''))}</ul>
  </section>` : '');

export function matchupsCard(matchups) {
  const byFactor = (keep) => Object.entries(matchups).filter(([, x]) => keep(x))
    .sort((a, b) => b[1] - a[1]);
  const group = (title, list) => (list.length ? html`
    <div class="matchup">
      <span class="matchup__title">${title}</span>
      <span class="matchup__list">${raw(list.map(([t, x]) => html`
        <span class="matchup__item">${raw(typeTag(t))}<small>${times(x)}</small></span>`).join(''))}</span>
    </div>` : '');
  return html`
    <section class="sec">
      <h2 class="section-title">Tipos contra ele</h2>
      <div class="card card__pad stack">
        ${raw(group('Fraco a', byFactor((x) => x > 1)))}
        ${raw(group('Resiste a', byFactor((x) => x > 0 && x < 1)))}
        ${raw(group('Imune a', byFactor((x) => x === 0)))}
      </div>
    </section>`;
}

/** Uma linha de evolucao: sprite, nome e a condicao, com link opcional. */
export const evoRow = (id, name, when, { href = null, inert = false } = {}) => html`
  <${href ? 'a' : 'div'} class="evo card card__pad${inert ? ' is-inert' : ''}"${raw(href ? ` href="${href}"` : '')}>
    <span class="evo__pic"><img class="sprite" src="${sprite(id)}" alt="" loading="lazy" onerror="this.remove()"></span>
    <span class="grow"><strong>${name}</strong><br><span class="hint">${when}</span></span>
  </${href ? 'a' : 'div'}>`;
