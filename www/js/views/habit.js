/* Hábito — ícone e nome, marcar hoje, sequência e recorde, e o calendário
 * do mês (com setas para os anteriores). Tocar num dia passado marca ou
 * desmarca: é aqui que se completa um dia esquecido. */

import * as db from '../db.js';
import * as push from '../push.js';
import {
  bestStreak, habitHistory, habitIcon, monthDays, streak,
} from '../habits.js';
import { isScheduled } from '../reminder.js';
import { ball, emptyBall } from '../pokemon.js';
import { tint } from './today.js';
import {
  html, raw, setTop, buzz, refresh, fmtDay, APP_NAME,
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

// Mes AAAA-MM vizinho.
const shiftMonth = (month, by) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function calendar(days) {
  // Segunda primeiro: as casas vazias antes do dia 1.
  const lead = (new Date(`${days[0].day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return html`
    <div class="month" role="grid">
      ${raw(HEAD.map((d) => html`<span class="month__head" aria-hidden="true">${d}</span>`).join(''))}
      ${raw('<span></span>'.repeat(lead))}
      ${raw(days.map((d) => {
    const num = Number(d.day.slice(8));
    return tappable(d.state)
      ? html`<button type="button" class="cell cell--${d.state}" data-day="${d.day}" role="gridcell"
            aria-pressed="${String(d.state === 'done')}"
            aria-label="${fmtDay(d.day, { day: 'numeric', month: 'long' })}: ${STATE_LABEL[d.state]}">${num}</button>`
      : html`<span class="cell cell--${d.state}" role="gridcell" aria-hidden="true">${num}</span>`;
  }).join(''))}
    </div>`;
}

export async function render(view, params) {
  const id = Number(params.get('id'));
  const habit = await db.habit(id);
  if (!habit) { location.hash = '#/'; return; }

  setTop({
    title: '',
    back: habit.archived ? '#/habitos' : '#/',
    actions: html`<a class="icon-btn" href="#/habito/editar?id=${id}" aria-label="Editar">${raw(PENCIL)}</a>`,
  });
  // O nome vai no card de cima; a barra fica so com voltar e editar.
  document.title = `${habit.name} · ${APP_NAME}`;

  const today = db.dayOf();
  const checks = await db.checksOf(id);
  const { rate } = habitHistory(habit, checks, today, WEEKS);
  const weekly = habit.schedule.kind === 'weekly';
  const n = streak(habit, checks, today);
  const doneToday = checks.some((c) => c.day === today);
  const canToday = !habit.archived && (weekly || isScheduled(habit, today));
  const [bg, ink] = tint(habit.id);

  // O mes vem do endereco (#/habito?id=&mes=AAAA-MM), entre o da criacao e o atual.
  const thisMonth = today.slice(0, 7);
  const firstMonth = habit.createdDay.slice(0, 7);
  const asked = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes') : thisMonth;
  const month = asked > thisMonth ? thisMonth : asked < firstMonth ? firstMonth : asked;
  const { days, done, due } = monthDays(habit, checks, today, month);
  const go = (m) => `#/habito?id=${id}&mes=${m}`;
  const summary = weekly ? `${done} ${done === 1 ? 'vez' : 'vezes'}` : `${done} de ${due} dias`;

  view.innerHTML = html`
    <section class="hab-head">
      <span class="hab-head__icon${habit.icon ? ' is-emoji' : ''}" style="background: ${bg}; color: ${ink}" aria-hidden="true">${habitIcon(habit)}</span>
      <span class="grow">
        <span class="hab-head__name">${habit.name}</span>
        <span class="hab-head__sub">${scheduleText(habit.schedule)}${habit.remindAt ? ` · lembrete às ${habit.remindAt}` : ''}${habit.archived ? ' · arquivado' : ''}</span>
      </span>
      ${raw(canToday ? html`
        <button class="hab__check" type="button" data-day="${today}" aria-pressed="${String(doneToday)}"
          aria-label="${doneToday ? 'Desmarcar' : 'Marcar'} hoje">${raw(doneToday ? ball(42) : emptyBall(42))}</button>` : '')}
    </section>

    <section class="hab-nums">
      <span><b>🔥 ${n}</b>${weekly ? 'semanas' : 'seguidos'}</span>
      <span><b>${bestStreak(habit, checks, today)}</b>recorde</span>
      <span><b>${pct(rate)}</b>${weekly ? 'das semanas' : 'dos dias'}</span>
      <span><b>${checks.length}</b>no total</span>
    </section>

    <section class="card card__pad">
      <div class="month-head">
        <span class="grow">
          <span class="month-head__name">${fmtDay(`${month}-01`, { month: 'long' })} ${month.slice(0, 4)}</span>
          <span class="month-head__sub">${summary}</span>
        </span>
        <a class="month-nav${month <= firstMonth ? ' is-off' : ''}" href="${go(shiftMonth(month, -1))}" aria-label="Mês anterior">‹</a>
        <a class="month-nav${month >= thisMonth ? ' is-off' : ''}" href="${go(shiftMonth(month, 1))}" aria-label="Próximo mês">›</a>
      </div>
      ${raw(calendar(days))}
    </section>
  `;

  view.onclick = async (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell) return;
    buzz();
    await db.setCheck(id, cell.dataset.day, cell.getAttribute('aria-pressed') !== 'true');
    refresh();
    push.sync().catch(() => {});
  };
}
