/* Hoje — "o que falta fazer hoje?" */

import * as db from '../db.js';
import * as push from '../push.js';
import {
  dayProgress, habitIcon, streak, todayList,
} from '../habits.js';
import {
  game, sprite, toNextLevel, startersOf, ball, emptyBall,
} from '../pokemon.js';
import { addDays, SNOOZE_MIN } from '../reminder.js';
import {
  html, raw, setTop, toast, buzz, refresh, isIOS, isStandalone, openSheet, closeSheet, node, APP_NAME,
} from '../ui.js';

const LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';
export const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "3 dias seguidos", "2/3 nesta semana" etc., a linha embaixo do nome. */
function subline(item, checks, today) {
  const { habit } = item;
  const n = streak(habit, checks, today);
  if (habit.schedule.kind === 'weekly') {
    const week = `${item.doneThisWeek}/${habit.schedule.times} nesta semana`;
    return n ? `${week} · ${plural(n, 'semana seguida', 'semanas seguidas')}` : week;
  }
  return n ? plural(n, 'dia seguido', 'dias seguidos') : 'Comece hoje';
}

// Marcar um habito e um golpe no selvagem: a proxima pintura anima.
let attackPending = false;

async function toggle(habitId, done) {
  buzz();
  attackPending = done;
  await db.setCheck(habitId, db.dayOf(), done);
  refresh();
  // Segura (ou devolve) o lembrete no Worker. Offline nao impede marcar.
  push.sync().catch(() => {});
}

// Habito marcado pelo toque na notificacao. A faixa de desfazer/adiar fica
// enquanto ele continuar marcado e o toque for recente.
let fromReminder = null;
const NOTICE_MS = 30 * 60 * 1000;

/** Rota #/feito?habito=<id>&lembrete=<id>, aberta pelo toque na notificacao:
 *  o iOS nao mostra botoes em web push, entao o toque ja e o "fiz". */
export async function doneFromReminder(view, params) {
  const id = params.get('lembrete');
  const habitId = Number(params.get('habito'));
  // O mesmo link pode rodar de novo (hashchange e visibilitychange juntos,
  // recarregar). saveSettings atualiza o cache antes do primeiro await, entao
  // a segunda passada ja ve o id.
  if (id && db.settings().lastReminder !== id) {
    const saved = db.saveSettings({ lastReminder: id });
    const habit = await db.habit(habitId);
    if (habit) {
      buzz();
      await db.setCheck(habitId, db.dayOf(), true);
      fromReminder = { habitId, name: habit.name, day: db.dayOf(), at: Date.now() };
    }
    await saved;
    push.sync().catch(() => {});
  }
  window.history.replaceState(null, '', '#/');
  await render(view);
}

async function undoReminder(snooze) {
  const { habitId, day } = fromReminder;
  fromReminder = null;
  await db.setCheck(habitId, day, false);
  if (snooze) await db.saveSettings({ snoozed: { habitId, at: new Date().toISOString() } });
  refresh();
  push.sync().then(
    () => toast(snooze ? `Lembro de novo em ${SNOOZE_MIN} min` : 'Desmarcado'),
    () => toast(snooze ? 'Sem conexão: não deu pra adiar.' : 'Desmarcado'),
  );
}

function reminderNotice(list) {
  const shown = fromReminder && Date.now() - fromReminder.at < NOTICE_MS
    && list.some((i) => i.habit.id === fromReminder.habitId && i.done);
  if (!shown) return '';
  return html`
    <section class="notice card card__pad">
      <p><strong>${fromReminder.name}</strong> marcado pelo lembrete.</p>
      <div class="notice__actions">
        <button class="btn btn--primary" type="button" data-snooze>Não fiz · adiar ${SNOOZE_MIN} min</button>
        <button class="btn btn--ghost" type="button" data-undo>Desfazer</button>
      </div>
    </section>`;
}

async function reminderLine() {
  if (isIOS() && !isStandalone()) {
    return html`<a href="#/ajustes">Para receber lembretes, adicione o ${APP_NAME} à Tela de Início</a>`;
  }
  if (!(await push.currentSubscription().catch(() => null))) {
    return html`<a href="#/ajustes">Lembretes desligados · <strong>ativar</strong></a>`;
  }
  const next = await push.upcoming();
  return next
    ? html`<span>Próximo lembrete às <strong>${next.at}</strong>: ${next.names.join(', ')}</span>`
    : html`<span>Sem mais lembretes hoje</span>`;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Cada habito ganha um tom fixo (pela id), para a lista nao ficar monotona.
const TINTS = [
  ['#fde3ee', '#b02a63'], ['#fde4e1', '#b0342a'], ['#e3ecfc', '#2f5fb8'], ['#ece7f7', '#5c468c'],
  ['#e3f4dc', '#2f6d27'], ['#fff1cc', '#8a5a00'], ['#dff3f5', '#0e6470'], ['#efeee2', '#66663f'],
];
export const tint = (id) => TINTS[(id - 1) % TINTS.length];

export function habitRow(item, sub) {
  const { habit, done } = item;
  const [bg, ink] = tint(habit.id);
  return html`
    <li class="hab${done ? ' is-done' : ''}">
      <span class="hab__tile${habit.icon ? ' is-emoji' : ''}" style="background: ${bg}; color: ${ink}" aria-hidden="true">${habitIcon(habit)}</span>
      <a class="hab__body" href="#/habito?id=${habit.id}">
        <span class="hab__name">${habit.name}</span>
        <span class="hab__sub">${sub}</span>
      </a>
      <button class="hab__check" type="button" data-toggle="${habit.id}" aria-pressed="${String(done)}"
        aria-label="${done ? 'Desmarcar' : 'Marcar'} ${habit.name}">${raw(done ? ball(38) : emptyBall(38))}</button>
    </li>`;
}

// So no comeco do jogo: nas regioes seguintes o time vem da caixa, e os
// iniciais de cada geracao aparecem como selvagens.
function starterPicker(dex) {
  const options = startersOf(1);
  return html`
    <section class="sec">
      <h2 class="section-title">Escolha seu inicial</h2>
      <p class="hint">Ele começa no nível 1, como todo pokémon que você capturar. Cada dia na meta o time sobe 1 nível; dia abaixo da meta, perde 1.</p>
    </section>
    <div class="starters">
      ${raw(options.map((id) => html`
        <button class="starter" type="button" data-starter="${id}">
          <span class="starter__pic"><img class="sprite" src="${sprite(id)}" alt=""></span>
          ${dex.byId.get(id).name}
        </button>`).join(''))}
    </div>`;
}

// O "ontem" so aparece quando custou algo: dia abaixo da meta derruba o time.
function yesterdayLine(state, today) {
  const last = state.lastDay;
  if (!last || last.met || last.day !== addDays(today, -1)) return '';
  return html`<p class="banner banner--bad">Ontem ficou em ${pct(last.progress)}, abaixo da meta: o time perdeu 1 nível.</p>`;
}

function goalCard(dex, state, list, progress, attack) {
  // Sem time (o vencedor da liga foi para o Hall e a caixa estava vazia), o
  // card fala do selvagem, que vai formar o time novo.
  const me = state.party[0];
  const name = me && dex.byId.get(me.species).name;
  const goal = db.settings().goal;
  const done = list.filter((i) => i.done).length;
  const counted = list.filter((i) => i.done || i.mustDo).length;
  const met = progress !== null && progress >= goal;
  const missing = Math.max(0, Math.ceil(goal * counted - 1e-9) - done);
  let title;
  let sub;
  if (!list.length) {
    title = 'Nada pra hoje';
    sub = 'Sem hábitos agendados hoje.';
  } else if (met) {
    title = 'Meta batida!';
    sub = `${me ? `${name} subiu pro Nv ${me.level}` : 'Sem time: capture o selvagem'} · +1 doce${state.metStreak % 7 === 0 ? ' · +1 Pedra da Evolução' : ''}`;
  } else {
    title = html`${done} de ${list.length} · falta <b>${missing}</b>`;
    sub = me ? `Na meta: ${name} Nv ${me.level + 1}, +1 doce e um selvagem aparece` : 'Sem time: na meta aparece um selvagem para começar o novo';
  }
  return html`
    <section class="goal${attack ? ' is-attack' : ''}${met ? ' is-met' : ''}" aria-label="Meta de hoje">
      ${raw(me ? html`<a class="goal__pic" href="#/pokemon?uid=${me.uid}" aria-label="${name}, Nv ${me.level}"><img class="sprite" src="${sprite(me.species)}" alt=""></a>` : '')}
      <span class="grow">
        <span class="goal__title">${raw(String(title))}</span>
        <span class="goal__bar"><span style="width: ${pct(toNextLevel(progress, goal))}"></span></span>
        <span class="goal__sub">${sub}</span>
      </span>
    </section>`;
}

// O selvagem do dia so aparece depois da meta batida, para jogar a Poke Bola.
// Sem selvagem (todos da regiao ja pegos), nada.
function wildCard(dex, state, progress) {
  const { wild, balls } = state;
  const goal = db.settings().goal;
  if (!wild) return '';
  if (!wild.caught && (progress === null || progress < goal)) return '';
  const name = dex.byId.get(wild.species).name;
  let action;
  if (wild.caught) action = html`<span class="wild__hint">Entrou no time no nível 1.</span>`;
  else if (wild.canThrow) {
    action = html`
      <button class="btn btn--primary btn--block" type="button" data-throw>Jogar Poké Bola · ${pct(wild.chance)}</button>
      <span class="wild__hint">${plural(balls, 'Poké Bola', 'Poké Bolas')}</span>`;
  } else action = html`<span class="wild__hint">Sem Poké Bolas: cada dia na meta dá uma.</span>`;
  return html`
    <section class="card wild${wild.caught ? ' is-caught' : ''}" aria-label="Encontro do dia">
      <div class="wild__grass">
        <img class="sprite" src="${sprite(wild.species)}" alt="${name} selvagem">
        ${raw(ball(30))}
      </div>
      <div class="wild__body">
        <span class="wild__kicker">${wild.caught ? 'CAPTURADO' : 'APARECEU'}</span>
        <span class="wild__name">${name} selvagem${wild.caught ? '' : '!'}</span>
        ${raw(action)}
      </div>
    </section>`;
}

function chooseStarter(dex, id, today) {
  const p = dex.byId.get(id);
  const body = openSheet(`Começar com ${p.name}?`, node(html`
    <div class="stack">
      <div class="starter-pick"><img class="sprite" src="${sprite(id)}" alt=""></div>
      <button class="btn btn--primary btn--block btn--lg" type="button" data-confirm>Escolher ${p.name}</button>
    </div>`));
  body.querySelector('[data-confirm]').onclick = async () => {
    await db.addEvent({ type: 'start', day: today, species: id });
    closeSheet();
    toast(`${p.name} entrou no time!`);
    refresh();
  };
}

async function throwBall(view, dex, state, today) {
  const { wild } = state;
  const caught = Math.random() < wild.chance;
  // O resultado e gravado antes da animacao: sair no meio nao da outra chance.
  await db.addEvent({ type: 'catch', day: today, species: wild.species, level: wild.level, caught });
  buzz(30);
  view.querySelector('.wild').classList.add('is-throwing', caught ? 'will-catch' : 'will-escape');
  await sleep(2200);
  const name = dex.byId.get(wild.species).name;
  toast(caught ? `Pegou! ${name} entrou no nível 1.` : `${name} escapou da Poké Bola!`, 3200);
  refresh();
}

export async function render(view) {
  setTop({
    title: 'Hoje',
    actions: html`<a class="icon-btn" href="#/habitos" aria-label="Todos os hábitos">${raw(LIST)}</a>`,
  });

  const today = db.dayOf();
  // Sem os dados do jogo (primeira abertura offline), o Hoje ainda funciona.
  const g = await game().catch((err) => { console.error(err); return null; });
  const [habits, checks] = g ? [g.habits, g.checks] : await Promise.all([db.habits(), db.allChecks()]);
  const list = todayList(habits, checks, today);
  const progress = dayProgress(list);
  const attack = attackPending;
  attackPending = false;

  if (g && !g.state.started) {
    view.innerHTML = starterPicker(g.dex);
    view.onclick = (e) => {
      const btn = e.target.closest('[data-starter]');
      if (btn) chooseStarter(g.dex, Number(btn.dataset.starter), today);
    };
    return;
  }

  const top = g ? html`
    ${raw(yesterdayLine(g.state, today))}
    ${raw(goalCard(g.dex, g.state, list, progress, attack))}
    ${raw(wildCard(g.dex, g.state, progress))}` : '';

  if (!habits.some((h) => !h.archived)) {
    view.innerHTML = html`
      ${raw(top)}
      <a class="btn btn--primary btn--lg btn--block" href="#/habito/novo">Criar meu primeiro hábito</a>`;
    return;
  }

  view.innerHTML = html`
    ${raw(reminderNotice(list))}
    ${raw(top)}
    ${list.length ? raw(html`<ul class="habs" aria-label="Hábitos de hoje">${raw(list.map((i) => habitRow(i, subline(i, checks, today))).join(''))}</ul>`) : ''}
    <p class="today-foot">${raw(await reminderLine())}<a class="today-foot__new" href="#/habito/novo">+ Novo hábito</a></p>
  `;

  view.onclick = (e) => {
    const btn = e.target.closest('[data-toggle]');
    if (btn) { toggle(Number(btn.dataset.toggle), btn.getAttribute('aria-pressed') !== 'true'); return; }
    const throwBtn = e.target.closest('[data-throw]');
    if (throwBtn) {
      throwBtn.disabled = true;
      throwBall(view, g.dex, g.state, today);
      return;
    }
    if (e.target.closest('[data-snooze]')) { undoReminder(true); return; }
    if (e.target.closest('[data-undo]')) undoReminder(false);
  };
}
