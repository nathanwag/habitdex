/* Ajustes — liga/desliga dos lembretes, virada do dia, o servidor e o backup
 * dos dados. Os horários ficam em cada hábito. */

import * as db from '../db.js';
import * as push from '../push.js';
import { makeBackup, parseBackup } from '../backup.js';
import {
  html, raw, setTop, toast, isIOS, isStandalone, refresh, APP_NAME,
} from '../ui.js';

const ICON = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  link: '<path d="M15 7h3a5 5 0 0 1 0 10h-3"/><path d="M9 17H6A5 5 0 0 1 6 7h3"/><path d="M8 12h8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>',
};
const icon = (name) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`);
const CHEVRON = raw('<svg class="set-item__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>');

function item({ href, ico, title, sub }) {
  return html`
    <a class="set-item" href="${href}">
      <span class="set-item__ico">${icon(ico)}</span>
      <span class="set-item__text"><span class="set-item__title">${title}</span>
        ${raw(sub ? html`<span class="set-item__sub">${sub}</span>` : '')}</span>
      ${CHEVRON}
    </a>`;
}

async function reminderStatus() {
  const next = await push.upcoming();
  return next ? `Ligados · próximo às ${next.at}` : 'Ligados · sem mais lembretes hoje';
}

async function masterCard(subscribed) {
  if (isIOS() && !isStandalone()) {
    return html`
      <p class="hint">No iPhone, lembretes só funcionam com o app instalado:
      no Safari, toque em <strong>Compartilhar</strong> › <strong>Adicionar à Tela de Início</strong>
      e abra o ${APP_NAME} pelo ícone.</p>`;
  }
  if (!push.pushSupported()) {
    return html`<p class="hint">Este navegador não recebe notificações push.</p>`;
  }
  return html`
    <label class="set-master">
      <span class="set-item__ico">${icon('bell')}</span>
      <span class="set-item__text">
        <span class="set-master__title">Lembretes</span>
        <span class="set-item__sub">${subscribed ? await reminderStatus() : 'Desligados neste aparelho'}</span>
      </span>
      <input class="switch" type="checkbox" name="reminders" aria-label="Lembretes neste aparelho"
        ${subscribed ? 'checked' : ''}>
    </label>`;
}

export async function render(view) {
  setTop({ title: 'Ajustes' });

  const s = db.settings();
  const subscribed = Boolean(await push.currentSubscription().catch(() => null));

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad">${raw(await masterCard(subscribed))}</div>
      <p class="hint">O horário de cada lembrete fica no próprio hábito.</p>
    </section>

    <section class="sec">
      <h2 class="section-title">Seu dia</h2>
      <nav class="card">
        ${raw(item({ href: '#/ajustes/virada', ico: 'moon', title: 'Virada do dia', sub: s.dayStart === '00:00' ? 'À meia-noite' : `${s.dayStart} · a madrugada conta no dia anterior` }))}
      </nav>
    </section>

    <section class="sec">
      <h2 class="section-title">Jogo</h2>
      <nav class="card">
        ${raw(item({ href: '#/ajustes/meta', ico: 'target', title: 'Meta do dia', sub: `${Math.round(s.goal * 100)}% dos hábitos · na meta o time sobe 1 nível, abaixo perde 1` }))}
        <button class="set-item" type="button" data-action="reset-game">
          <span class="set-item__ico">${icon('reset')}</span>
          <span class="set-item__text"><span class="set-item__title">Recomeçar o jogo</span>
            <span class="set-item__sub">Apaga inicial, capturas e batalhas; hábitos ficam</span></span>
        </button>
      </nav>
    </section>

    <section class="sec">
      <h2 class="section-title">Este aparelho</h2>
      <div class="card">
        ${raw(subscribed ? html`
          <button class="set-item" type="button" data-action="test">
            <span class="set-item__ico">${icon('send')}</span>
            <span class="set-item__text"><span class="set-item__title set-item__title--accent">Mandar notificação de teste</span></span>
          </button>` : '')}
        ${raw(item({ href: '#/ajustes/servidor', ico: 'link', title: 'Servidor', sub: s.token ? 'Token salvo' : 'Falta colar o token' }))}
      </div>
    </section>

    <section class="sec">
      <h2 class="section-title">Dados</h2>
      <div class="card">
        <button class="set-item" type="button" data-action="export">
          <span class="set-item__ico">${icon('download')}</span>
          <span class="set-item__text"><span class="set-item__title">Exportar dados</span>
            <span class="set-item__sub">Hábitos, marcações e o jogo num arquivo</span></span>
        </button>
        <label class="set-item">
          <span class="set-item__ico">${icon('upload')}</span>
          <span class="set-item__text"><span class="set-item__title">Importar dados</span>
            <span class="set-item__sub">Troca tudo deste aparelho pelo do arquivo</span></span>
          <input class="visually-hidden" type="file" name="backup" accept="application/json,.json">
        </label>
      </div>
    </section>
  `;

  view.onchange = (e) => {
    if (e.target.name === 'backup' && e.target.files[0]) importBackup(e.target.files[0], e.target);
  };

  view.onclick = (e) => {
    if (e.target.name === 'reminders') {
      runAction(e.target.checked ? 'enable' : 'disable', e.target);
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action?.dataset.action === 'reset-game') { resetGame(); return; }
    if (action?.dataset.action === 'export') { exportBackup(); return; }
    if (action) runAction(action.dataset.action, action);
  };
}

// No iPhone a folha de compartilhar salva em Arquivos; sem ela, baixa.
async function exportBackup() {
  const text = makeBackup(await db.exportData(), new Date());
  const file = new File([text], `habitdex-${db.dayOf()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Não deu para compartilhar o arquivo.');
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(file, input) {
  try {
    const data = parseBackup(await file.text());
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Trocar tudo deste aparelho pelo backup? São ${data.habits.length} hábitos e ${data.checks.length} marcações.`)) return;
    await db.importData(data);
    push.sync().catch(() => {});
    toast('Dados importados');
    location.hash = '#/';
  } catch (err) {
    toast(err.message);
  } finally {
    input.value = '';
  }
}

async function resetGame() {
  // eslint-disable-next-line no-alert
  if (!window.confirm('Recomeçar o jogo do zero? O inicial, as capturas e as batalhas somem; os hábitos ficam.')) return;
  await db.clearEvents();
  toast('Jogo recomeçado');
  location.hash = '#/';
}

const GOALS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

export async function renderGoal(view) {
  setTop({ title: 'Meta do dia', back: '#/ajustes' });
  const goal = db.settings().goal;
  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <div class="seg" role="radiogroup" aria-label="Meta do dia">
          ${raw(GOALS.map((g) => html`<button class="seg__opt" type="button" role="radio" data-goal="${g}"
            aria-checked="${String(g === goal)}">${Math.round(g * 100)}%</button>`).join(''))}
        </div>
        <p class="hint">Bater a meta sobe o time 1 nível na hora e, na virada, dá 1 Pokébola. Se o dia fechar abaixo da meta, o time perde 1 nível. Só batendo a meta dá para jogar Pokébola no selvagem do dia.</p>
      </div>
    </section>
  `;
  view.onclick = async (e) => {
    const btn = e.target.closest('[data-goal]');
    if (!btn) return;
    await db.saveSettings({ goal: Number(btn.dataset.goal) });
    toast('Meta salva');
    refresh();
  };
}

async function runAction(action, control) {
  if (!db.settings().token) {
    toast('Cole o token do servidor primeiro.');
    location.hash = '#/ajustes/servidor';
    return;
  }
  control.disabled = true;
  try {
    if (action === 'enable') {
      // Sem await antes daqui: o iOS so mostra o pedido de permissao dentro
      // do mesmo toque.
      await push.enable();
      toast('Lembretes ativados');
    } else if (action === 'disable') {
      await push.disable();
      toast('Lembretes desligados');
    } else if (action === 'test') {
      await push.sendTest();
      toast('Enviado — deve chegar em segundos');
    }
  } catch (err) {
    toast(err.message, 4000);
  } finally {
    // Redesenha mesmo na falha: o switch tem que voltar ao estado real.
    refresh();
  }
}

export async function renderDayStart(view) {
  setTop({ title: 'Virada do dia', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <label class="set-row">
          <span>O dia vira às</span>
          <input class="input input--time" type="time" name="dayStart" value="${s.dayStart}">
        </label>
        <p class="hint">O que você marcar antes desse horário conta no dia anterior. Quem dorme depois da meia-noite pode pôr a virada de madrugada, tipo 05:00.</p>
      </div>
    </section>
  `;

  view.onchange = async (e) => {
    if (e.target.name !== 'dayStart' || !e.target.value) return;
    await db.saveSettings({ dayStart: e.target.value });
    push.sync().catch((err) => toast(err.message));
    toast('Virada do dia salva');
  };
}

export async function renderServer(view) {
  setTop({ title: 'Servidor', back: '#/ajustes' });
  const s = db.settings();

  view.innerHTML = html`
    <section class="sec">
      <div class="card card__pad stack">
        <label class="field">
          <span class="field__k">Token do servidor</span>
          <input class="input" type="password" name="token" autocomplete="off"
            value="${s.token}" placeholder="o APP_TOKEN do deploy">
        </label>
        <p class="hint">É o segredo que o Worker exige pra aceitar os lembretes deste aparelho. Fica salvo só aqui.</p>
      </div>
    </section>
  `;

  view.onchange = async (e) => {
    if (e.target.name !== 'token') return;
    await db.saveSettings({ token: e.target.value.trim() });
    toast('Token salvo');
  };
}
