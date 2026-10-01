/* Todos os hábitos — inclusive os que não valem hoje e os arquivados — e a
 * ordem em que aparecem no Hoje. */

import * as db from '../db.js';
import { html, raw, setTop } from '../ui.js';
import { scheduleText } from './habit.js';
import { CHEVRON } from './today.js';

const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function row(habit, index, total) {
  const move = (dir, svg, label, disabled) => html`
    <button class="icon-btn" type="button" data-move="${dir}" data-id="${habit.id}" aria-label="${label} ${habit.name}"
      ${disabled ? 'disabled' : ''}>${raw(svg)}</button>`;
  return html`
    <li class="list__row">
      <a class="habit__body" href="#/habito?id=${habit.id}">
        <span class="habit__name">${habit.name}</span>
        <span class="habit__sub">${scheduleText(habit.schedule)}${habit.remindAt ? ` · ${habit.remindAt}` : ''}</span>
      </a>
      ${habit.archived ? raw(html`<a class="habit__chev" href="#/habito?id=${habit.id}" aria-hidden="true" tabindex="-1">${raw(CHEVRON)}</a>`)
    : raw(move(-1, UP, 'Subir', index === 0) + move(1, DOWN, 'Descer', index === total - 1))}
    </li>`;
}

export async function render(view) {
  setTop({ title: 'Hábitos', back: '#/' });
  const all = await db.habits();
  const active = all.filter((h) => !h.archived);
  const archived = all.filter((h) => h.archived);

  view.innerHTML = html`
    ${active.length
    ? raw(html`<ul class="list card">${raw(active.map((h, i) => row(h, i, active.length)).join(''))}</ul>`)
    : raw(html`<p class="muted empty">Nenhum hábito ativo.</p>`)}
    <a class="btn btn--ghost btn--block" href="#/habito/novo">+ Novo hábito</a>
    ${archived.length ? raw(html`
      <section class="sec">
        <h2 class="section-title">Arquivados</h2>
        <ul class="list card">${raw(archived.map((h, i) => row(h, i, archived.length)).join(''))}</ul>
      </section>`) : ''}
  `;

  view.onclick = async (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const index = active.findIndex((h) => h.id === Number(btn.dataset.id));
    const other = active[index + Number(btn.dataset.move)];
    if (!other) return;
    await db.swapOrder(active[index], other);
    render(view);
  };
}
