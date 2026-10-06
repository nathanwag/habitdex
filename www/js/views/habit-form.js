/* Novo hábito e editar hábito: ícone, nome, frequência e horário do lembrete. */

import * as db from '../db.js';
import * as push from '../push.js';
import { habitIcon, iconOf } from '../habits.js';
import { html, raw, setTop, toast } from '../ui.js';

// Segunda primeiro, como a semana dos habitos (weekOf).
const DAYS = [[1, 'S'], [2, 'T'], [3, 'Q'], [4, 'Q'], [5, 'S'], [6, 'S'], [0, 'D']];
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const KINDS = [['daily', 'Todo dia'], ['days', 'Dias fixos'], ['weekly', 'Por semana']];

const MAX_TIMES = 6;

/** Rascunho do formulario: o redesenho a cada toque nao pode perder o que
 *  foi digitado. */
let draft = null;

function blank() {
  return { name: '', icon: null, schedule: { kind: 'daily' }, remindAt: null };
}

function scheduleFields(schedule) {
  if (schedule.kind === 'days') {
    const days = schedule.days ?? [];
    return html`
      <div class="days">${raw(DAYS.map(([d, letter]) => html`
        <button type="button" class="day" data-day="${d}" aria-pressed="${String(days.includes(d))}"
          aria-label="${DAY_NAMES[d]}">${letter}</button>`).join(''))}</div>`;
  }
  if (schedule.kind === 'weekly') {
    const times = schedule.times ?? 3;
    return html`
      <div class="set-row">
        <span>Vezes por semana</span>
        <span class="stepper">
          <button class="icon-btn" type="button" data-times="-1" aria-label="Menos" ${times <= 1 ? 'disabled' : ''}>−</button>
          <span class="data stepper__v">${times}</span>
          <button class="icon-btn" type="button" data-times="1" aria-label="Mais" ${times >= MAX_TIMES ? 'disabled' : ''}>+</button>
        </span>
      </div>
      <p class="hint">Em qualquer dia da semana. O lembrete só vem quando não der mais pra deixar pra depois.</p>`;
  }
  return '';
}

function paint(view) {
  const { name, icon, schedule, remindAt } = draft;
  const editing = draft.id != null;
  view.innerHTML = html`
    <form class="stack">
      <section class="sec">
        <h2 class="section-title">Hábito</h2>
        <div class="card card__pad">
          <div class="row">
            <label class="field"><span class="field__k">Ícone</span>
              <input class="icon-input" name="icon" type="text" autocomplete="off" aria-label="Ícone (um emoji)"
                placeholder="${habitIcon({ name })}" value="${icon ?? ''}"></label>
            <label class="field grow"><span class="field__k">Nome</span>
              <input class="input" name="name" type="text" maxlength="60" autocomplete="off"
                placeholder="ex.: Meditar 10 min" value="${name}"></label>
          </div>
        </div>
      </section>

      <section class="sec">
        <h2 class="section-title">Frequência</h2>
        <div class="card card__pad stack">
          <div class="seg" role="radiogroup" aria-label="Frequência">${raw(KINDS.map(([kind, label]) => html`
            <button type="button" class="seg__opt" role="radio" data-kind="${kind}"
              aria-checked="${String(schedule.kind === kind)}">${label}</button>`).join(''))}</div>
          ${raw(scheduleFields(schedule))}
        </div>
      </section>

      <section class="sec">
        <h2 class="section-title">Lembrete</h2>
        <div class="card card__pad stack">
          <label class="set-row">
            <span>Lembrar</span>
            <input class="switch" type="checkbox" name="remind" ${remindAt ? 'checked' : ''}>
          </label>
          ${remindAt ? raw(html`
            <label class="set-row">
              <span>Às</span>
              <input class="input input--time" type="time" name="remindAt" value="${remindAt}">
            </label>
            <p class="hint">Só avisa se o hábito ainda não foi feito.</p>`) : ''}
        </div>
      </section>

      <button class="btn btn--primary btn--lg btn--block" type="submit">${editing ? 'Salvar' : 'Criar hábito'}</button>
      ${editing ? raw(html`
        <button class="btn btn--ghost btn--block" type="button" data-archive>
          ${draft.archived ? 'Desarquivar' : 'Arquivar'}</button>`) : ''}
    </form>`;
}

function formError({ name, schedule }) {
  if (!name.trim()) return 'Dê um nome ao hábito.';
  if (schedule.kind === 'days' && !schedule.days?.length) return 'Escolha pelo menos um dia.';
  return null;
}

/** Só os campos de cada tipo de frequencia: trocar de tipo nao deixa lixo. */
function cleanSchedule({ kind, days, times }) {
  if (kind === 'days') return { kind, days: [...days].sort() };
  if (kind === 'weekly') return { kind, times: times ?? 3 };
  return { kind };
}

async function submit(view) {
  draft.name = view.querySelector('[name=name]').value;
  const error = formError(draft);
  if (error) { toast(error); return; }
  const saved = await db.saveHabit({ ...draft, name: draft.name.trim(), schedule: cleanSchedule(draft.schedule) });
  draft = null;
  // O horario do lembrete mora no habito: o Worker precisa saber ja.
  push.sync().catch((err) => toast(err.message));
  location.hash = `#/habito?id=${saved.id}`;
}

async function open(view, params) {
  const id = params.has('id') ? Number(params.get('id')) : null;
  if (!draft || draft.id !== (id ?? undefined)) {
    draft = id == null ? blank() : await db.habit(id);
    if (!draft) { location.hash = '#/'; return; }
  }
  setTop({ title: id == null ? 'Novo hábito' : 'Editar hábito', back: id == null ? '#/' : `#/habito?id=${id}` });
  paint(view);

  // Sem redesenhar: o campo em foco perderia o teclado.
  view.oninput = (e) => {
    if (e.target.name === 'name') {
      draft.name = e.target.value;
      // Sem icone, o quadradinho mostra a inicial do nome.
      view.querySelector('[name=icon]').placeholder = habitIcon({ name: draft.name });
    }
    if (e.target.name === 'icon') {
      draft.icon = iconOf(e.target.value);
      e.target.value = draft.icon ?? '';
    }
  };
  view.onchange = (e) => {
    if (e.target.name === 'remind') {
      draft.remindAt = e.target.checked ? '08:00' : null;
      paint(view);
    }
    if (e.target.name === 'remindAt' && e.target.value) draft.remindAt = e.target.value;
  };
  view.onclick = async (e) => {
    const kindBtn = e.target.closest('[data-kind]');
    if (kindBtn) {
      draft.schedule = { ...draft.schedule, kind: kindBtn.dataset.kind };
      paint(view);
      return;
    }
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      const d = Number(dayBtn.dataset.day);
      const days = new Set(draft.schedule.days ?? []);
      if (!days.delete(d)) days.add(d);
      draft.schedule = { ...draft.schedule, days: [...days] };
      paint(view);
      return;
    }
    const timesBtn = e.target.closest('[data-times]');
    if (timesBtn) {
      const times = (draft.schedule.times ?? 3) + Number(timesBtn.dataset.times);
      draft.schedule = { ...draft.schedule, times: Math.min(Math.max(times, 1), MAX_TIMES) };
      paint(view);
      return;
    }
    if (e.target.closest('[data-archive]')) {
      const archived = !draft.archived;
      await db.saveHabit({ ...draft, archived });
      draft = null;
      push.sync().catch(() => {});
      toast(archived ? 'Hábito arquivado' : 'Hábito de volta');
      location.hash = archived ? '#/habitos' : `#/habito?id=${id}`;
    }
  };
  // No #view e nao no form: paint() troca o form a cada toque.
  view.onsubmit = (e) => {
    e.preventDefault();
    submit(view);
  };
}

export const renderNew = open;
export const renderEdit = open;
