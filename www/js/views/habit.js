/* Hábito — sequência, taxa e a grade das últimas semanas. Tocar num dia
 * passado marca ou desmarca: é aqui que se completa um dia esquecido. */

import * as db from '../db.js';
import { habitHistory, streak } from '../habits.js';
import {
  html, raw, setTop, buzz, refresh, fmtDay,
} from '../ui.js';

const WEEKS = 12;
const HEAD = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>';

const STATE_LABEL = {
  done: 'feito', missed: 'não feito', off: 'fora da agenda', open: 'em aberto', before: 'antes de existir', future: '',
};

export function scheduleText({ kind, days, times }) {
  if (kind === 'weekly') return `${times}x por semana`;
  if (kind === 'days') {
    const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => names[d]).join(', ');
  }
  return 'Todo dia';
}

const pct = (rate) => (rate == null ? '–' : `${Math.round(rate * 100)}%`);

// Dia passado ou hoje, com o habito ja existindo, pode ser marcado.
const tappable = (state) => state !== 'before' && state !== 'future';

function grid(weeks, label) {
  return html`
    <div class="grid" role="grid" aria-label="${label}">
      <div class="grid__row grid__head" aria-hidden="true">${raw(HEAD.map((d) => html`<span>${d}</span>`).join(''))}</div>
      ${raw(weeks.map((w) => html`
        <div class="grid__row${w.met ? ' is-met' : ''}" role="row">${raw(w.days.map((d) => (tappable(d.state)
    ? html`<button type="button" class="cell cell--${d.state}" data-day="${d.day}" role="gridcell"
          aria-pressed="${String(d.state === 'done')}"
          aria-label="${fmtDay(d.day, { day: 'numeric', month: 'long' })}: ${STATE_LABEL[d.state]}"></button>`
    : html`<span class="cell cell--${d.state}" role="gridcell" aria-hidden="true"></span>`)).join(''))}
        </div>`).join(''))}
    </div>`;
}

export async function render(view, params) {
  const id = Number(params.get('id'));
  const habit = await db.habit(id);
  if (!habit) { location.hash = '#/'; return; }

  setTop({
    title: habit.name,
    back: habit.archived ? '#/habitos' : '#/',
    actions: html`<a class="icon-btn" href="#/habito/editar?id=${id}" aria-label="Editar">${raw(PENCIL)}</a>`,
  });

  const today = db.dayOf();
  const checks = await db.checksOf(id);
  const { weeks: all, rate } = habitHistory(habit, checks, today, WEEKS);
  // Semana inteira de antes do habito existir e so espaco vazio.
  const weeks = all.filter((w) => w.days.some((d) => d.state !== 'before'));
  const span = weeks.length < WEEKS ? 'Desde o começo' : `Últimas ${WEEKS} semanas`;
  const weekly = habit.schedule.kind === 'weekly';
  const n = streak(habit, checks, today);

  view.innerHTML = html`
    ${habit.archived ? raw(html`<p class="status">Hábito arquivado: não aparece no Hoje nem lembra.</p>`) : ''}
    <p class="muted">${scheduleText(habit.schedule)}${habit.remindAt ? ` · lembrete às ${habit.remindAt}` : ''}</p>

    <div class="stats">
      <div class="card stat"><span class="data stat__v">${n}</span>
        <span class="stat__k">${weekly ? (n === 1 ? 'semana seguida' : 'semanas seguidas') : (n === 1 ? 'dia seguido' : 'dias seguidos')}</span></div>
      <div class="card stat"><span class="data stat__v">${pct(rate)}</span>
        <span class="stat__k">${weekly ? 'das semanas na meta' : 'dos dias cumpridos'}</span></div>
      <div class="card stat"><span class="data stat__v">${checks.length}</span>
        <span class="stat__k">vezes no total</span></div>
    </div>

    <section class="sec">
      <h2 class="section-title">${span}</h2>
      <div class="card card__pad">${raw(grid(weeks, span))}</div>
      <p class="hint">Toque num dia pra marcar ou desmarcar.</p>
    </section>
  `;

  view.onclick = async (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell) return;
    buzz();
    await db.setCheck(id, cell.dataset.day, cell.getAttribute('aria-pressed') !== 'true');
    refresh();
  };
}
