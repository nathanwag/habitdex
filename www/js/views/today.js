/* Hoje — "o que falta fazer hoje?" */

import * as db from '../db.js';
import * as push from '../push.js';
import { dayProgress, streak, todayList } from '../habits.js';
import {
  game, sprite, toNextLevel, startersOf,
} from '../pokemon.js';
import { addDays, SNOOZE_MIN } from '../reminder.js';
import {
  html, raw, setTop, toast, buzz, refresh, isIOS, isStandalone, openSheet, closeSheet, node, APP_NAME,
} from '../ui.js';

export const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.7 7.7 0 0 0-2.6-1.5L14.2 2.6h-4l-.3 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 0 0 2.6 1.5l.3 2.5h4l.3-2.5a7.7 7.7 0 0 0 2.6-1.5l2.3 1 2-3.4z"/></svg>';
const LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';
export const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
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
    return html`<a class="status" href="#/ajustes">Para receber lembretes, adicione o ${APP_NAME} à Tela de Início.</a>`;
  }
  if (!(await push.currentSubscription().catch(() => null))) {
    return html`<a class="status" href="#/ajustes">Lembretes desligados · <strong>ativar</strong></a>`;
  }
  const next = await push.upcoming();
  return next
    ? html`<p class="status">Próximo lembrete às <strong>${next.at}</strong>: ${next.names.join(', ')}</p>`
    : html`<p class="status">Sem mais lembretes hoje.</p>`;
}

function heroLine(list) {
  const pending = list.filter((i) => i.mustDo).length;
  if (pending === 0) return 'Tudo feito por hoje';
  return `Falta${pending === 1 ? '' : 'm'} ${plural(pending, 'hábito', 'hábitos')} hoje`;
}

export function habitRow(item, sub) {
  const { habit, done } = item;
  return html`
    <li class="habit${done ? ' is-done' : ''}">
      <button class="habit__check" type="button" data-toggle="${habit.id}" aria-pressed="${String(done)}"
        aria-label="${done ? 'Desmarcar' : 'Marcar'} ${habit.name}">${raw(CHECK)}</button>
      <a class="habit__body" href="#/habito?id=${habit.id}">
        <span class="habit__name">${habit.name}</span>
        <span class="habit__sub">${sub}</span>
      </a>
      <a class="habit__chev" href="#/habito?id=${habit.id}" aria-hidden="true" tabindex="-1">${raw(CHEVRON)}</a>
    </li>`;
}

const BALL = '<svg class="ball" viewBox="0 0 40 40" aria-hidden="true"><path d="M3 20a17 17 0 0 1 34 0z" fill="#e5603f"/><path d="M3 20a17 17 0 0 0 34 0z" fill="#fff"/><circle cx="20" cy="20" r="17" fill="none" stroke="#1b2230" stroke-width="3"/><path d="M3 20h34" stroke="#1b2230" stroke-width="3"/><circle cx="20" cy="20" r="5.5" fill="#fff" stroke="#1b2230" stroke-width="3"/></svg>';
const pct = (x) => `${Math.round(x * 100)}%`;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function starterPicker(dex, state) {
  // Cada jornada comeca com um dos 3 iniciais da geracao da regiao.
  const next = state.needsStarter;
  const region = next && dex.regions.find((r) => r.id === next.region);
  const options = startersOf(next ? next.gen : 1);
  return html`
    <section class="sec">
      ${raw(next ? html`<p class="banner banner--good">Liga vencida! Seu time foi para o Hall da Fama. A jornada continua em ${region.name}.</p>` : '')}
      <h2 class="section-title">${next ? `Inicial de ${region.name}` : 'Escolha seu inicial'}</h2>
      <p class="hint">Ele começa no nível 1, como todo pokémon que você capturar. Cada dia na meta o time sobe 1 nível; dia abaixo da meta, perde 1.</p>
      <div class="starters">
        ${raw(options.map((id) => html`
          <button class="starter" type="button" data-starter="${id}">
            <img class="sprite" src="${sprite(id)}" alt="" loading="lazy">
            <span>${dex.byId.get(id).name}</span>
          </button>`).join(''))}
      </div>
    </section>`;
}

function arena(dex, state, attack, progress) {
  const { wild } = state;
  const me = state.party[0];
  const foe = dex.byId.get(wild.species);
  const mine = dex.byId.get(me.species);
  return html`
    <section class="arena${attack ? ' is-attack' : ''}${wild.caught ? ' is-caught' : ''}" aria-label="Selvagem de hoje">
      <div class="hud hud--foe">
        <div class="hud__row"><strong>${foe.name}</strong></div>
        <div class="hp"><div class="hp__fill${wild.hp < 0.25 ? ' is-low' : ''}" style="width: ${wild.hp * 100}%"></div></div>
        <span class="hud__sub">${wild.caught ? 'Capturado hoje' : 'Selvagem'}</span>
      </div>
      <div class="arena__foe">
        <img class="sprite" src="${sprite(wild.species)}" alt="${foe.name} selvagem">
        ${raw(BALL)}
      </div>
      <div class="arena__me">
        <img class="sprite sprite--back" src="${sprite(me.species, 'back')}" alt="Seu ${mine.name}">
      </div>
      <div class="hud hud--me">
        <div class="hud__row"><strong>${mine.name}</strong><span class="data">Nv ${me.level}</span></div>
        <div class="xp" title="Meta de hoje"><div class="xp__fill" style="width: ${toNextLevel(progress, db.settings().goal) * 100}%"></div></div>
      </div>
    </section>`;
}

function capturePanel(dex, state, progress) {
  const { wild, balls } = state;
  const goal = db.settings().goal;
  const name = dex.byId.get(wild.species).name;
  if (wild.caught) return html`<p class="status">Você capturou <strong>${name}</strong> hoje. Ele entrou no nível 1.</p>`;
  if (wild.canThrow) {
    return html`
      <button class="btn btn--primary btn--block" type="button" data-throw>
        Jogar Pokébola · ${pct(wild.chance)} de chance
      </button>
      <p class="hint">Restam ${balls} Pokébola${balls === 1 ? '' : 's'}.</p>`;
  }
  if (balls === 0) return html`<p class="status">Sem Pokébolas: cada dia na meta dá uma.</p>`;
  return html`<p class="status">Bata a meta de <strong>${pct(goal)}</strong> para jogar Pokébola em ${name}
    (chance agora ${pct(wild.chance)}, ${balls} Pokébola${balls === 1 ? '' : 's'}). Hoje: ${pct(progress ?? 0)}.</p>`;
}

function yesterdayLine(state, today) {
  const last = state.lastDay;
  if (!last || last.day !== addDays(today, -1)) return '';
  return last.met
    ? html`<p class="banner banner--good">Ontem você bateu a meta (${pct(last.progress)}): +1 Pokébola.</p>`
    : html`<p class="banner banner--bad">Ontem ficou em ${pct(last.progress)}, abaixo da meta: o time perdeu 1 nível.</p>`;
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
  view.querySelector('.arena').classList.add('is-throwing', caught ? 'will-catch' : 'will-escape');
  await sleep(2200);
  const name = dex.byId.get(wild.species).name;
  toast(caught ? `Pegou! ${name} entrou no nível 1.` : `${name} escapou da Pokébola!`, 3200);
  refresh();
}

export async function render(view) {
  setTop({
    title: APP_NAME,
    actions: html`
      <a class="icon-btn" href="#/habitos" aria-label="Todos os hábitos">${raw(LIST)}</a>
      <a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${raw(GEAR)}</a>`,
  });

  const today = db.dayOf();
  // Sem os dados do jogo (primeira abertura offline), o Hoje ainda funciona.
  const g = await game().catch((err) => { console.error(err); return null; });
  const [habits, checks] = g ? [g.habits, g.checks] : await Promise.all([db.habits(), db.allChecks()]);
  const list = todayList(habits, checks, today);
  const progress = dayProgress(list);
  const attack = attackPending;
  attackPending = false;

  if (g && (!g.state.started || g.state.needsStarter)) {
    view.innerHTML = starterPicker(g.dex, g.state);
    view.onclick = (e) => {
      const btn = e.target.closest('[data-starter]');
      if (btn) chooseStarter(g.dex, Number(btn.dataset.starter), today);
    };
    return;
  }

  const play = g ? html`
    ${raw(yesterdayLine(g.state, today))}
    ${raw(arena(g.dex, g.state, attack, progress))}
    ${raw(capturePanel(g.dex, g.state, progress))}` : '';

  if (!habits.some((h) => !h.archived)) {
    view.innerHTML = html`
      ${raw(play)}
      <section class="hero">
        <p class="hero__left">Nenhum hábito ainda.</p>
      </section>
      <a class="btn btn--primary btn--lg btn--block" href="#/habito/novo">Criar meu primeiro hábito</a>`;
    return;
  }

  view.innerHTML = html`
    ${raw(reminderNotice(list))}
    ${raw(play)}
    <section class="hero hero--compact">
      <div class="hero__num">
        <span class="data hero__total">${list.filter((i) => i.done).length}</span>
        <span class="hero__goal">/ ${list.length}</span>
      </div>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round((progress ?? 0) * 100)}" aria-label="Progresso de hoje">
        <div class="meter__fill" style="width: ${(progress ?? 0) * 100}%"></div>
        <div class="meter__goal" style="left: ${db.settings().goal * 100}%"></div>
      </div>
      <p class="hero__left">${list.length ? heroLine(list) : 'Nenhum hábito pra hoje'}</p>
    </section>

    ${list.length ? raw(html`<ul class="card habits">${raw(list.map((i) => habitRow(i, subline(i, checks, today))).join(''))}</ul>`) : ''}

    ${raw(await reminderLine())}

    <a class="btn btn--ghost btn--block" href="#/habito/novo">+ Novo hábito</a>
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
