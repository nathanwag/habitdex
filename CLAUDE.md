# CLAUDE.md

## O que é

**Hábitos** (nome provisório): tracker de hábitos sim/não no iPhone, com
lembrete por push dos que ainda faltam. Segue o stack e as regras do
`../glub`, que por sua vez veio do `../gym_tracker`. Tem duas metades num repo
só.

- **`www/`** é uma PWA em JavaScript puro, sem build. Usa hash routing,
  IndexedDB isolado em `db.js`, `ui.js` com o tagged template `html` e um
  service worker de cache versionado.
- **`worker/`** é um Cloudflare Worker que serve `www/` como static assets,
  expõe a API em `/api/*` e roda um cron a cada 5 min que decide e envia os
  lembretes por Web Push (VAPID). O estado vive no KV `STATE`, numa chave só
  (`device`, usuário único).

Tudo sai num único deploy (`.github/workflows/deploy.yml`, push na `main`).

## Comandos

```bash
npm test                         # node --test: www/js/*.test.js e worker/src/*.test.js
node --test worker/src/cron.test.js
npm run dev                      # UI com live reload (browser-sync, sem API)
npm run dev:worker               # wrangler dev: app + API + cron (precisa de worker/.dev.vars)
```

## Modelo

- **`habits`**: `{ id, name, schedule, remindAt, createdDay, archived, order }`.
  `schedule` é `{ kind: 'daily' }`, `{ kind: 'days', days: [1, 3, 5] }`
  (numeração de `Date#getDay`) ou `{ kind: 'weekly', times: 3 }`.
- **`checks`**: `{ habitId, day, at }` com chave `[habitId, day]`, então há no
  máximo um por hábito e dia. Marcar é `put`, desmarcar é `delete`.
- A **semana começa na segunda** (`weekOf`).
- O "semanal" vale todo dia e só é **obrigatório** (`mustDoToday`) quando o que
  falta na semana já ocupa todos os dias restantes. Só isso conta como
  pendência no progresso do dia e nos lembretes.

## Regras que quebram em silêncio

- **`www/js/reminder.js` é compartilhado.** O Worker o importa por caminho
  relativo (`../../www/js/reminder.js`) e o wrangler embute no bundle. Ele
  precisa continuar **puro e sem imports**, e nunca usar getters locais de
  `Date`, porque o Worker roda em UTC. Tudo passa por `localParts(date, tz)`.
  Dia sem hora (`AAAA-MM-DD`) usa as contas em UTC (`addDays`, `weekdayOf`).
- **Toda alteração em `www/` exige bumpar `VERSION` em `www/sw.js`**
  (`habitos-vN`). O cache é cache-first. Sem o bump, o app instalado continua
  servindo os arquivos antigos. Arquivo novo em `www/js` também entra no
  `ASSETS`.
- **O SW só fica transparente em `localhost`.** Em `127.0.0.1` ele serve do
  cache e você testa código velho.
- **Todo push precisa mostrar uma notificação.** O iOS revoga a assinatura de
  quem recebe push silencioso. O payload usa o formato do Declarative Web
  Push (`web_push: 8030`), e o `sw.js` exibe o mesmo formato nas versões
  anteriores ao iOS 18.4.
- **Uma notificação por hábito.** O `tag` e o `topic` do push são
  `habito-<id>`. Com um topic só, o push service trocaria o aviso de um
  hábito pelo de outro.
- **Falha de cache não pode impedir o SW de instalar.** Sem SW não há push.
  Por isso o precache fica em try/catch e todo acesso a `caches` passa por
  `quiet()`.
- **`Notification.requestPermission()` tem que ser o primeiro `await`** de
  `push.enable()`. O iOS só mostra o pedido dentro do mesmo toque do usuário.
- **`PUT /api/sync` mescla, não substitui.** `lastSent` (por hábito) pertence
  ao cron, que relê o KV antes de gravar. `subscription` só muda quando vem no
  corpo: objeto liga, `null` desliga, ausente mantém. O app sincroniza a cada
  marcar/desmarcar, ao salvar um hábito e ao voltar a ficar visível.
- **O app não sabe o que o cron já enviou.** Por isso `nextReminder` só mostra
  horários que ainda não passaram, e `dueReminders` (o do Worker) envia o
  vencido e não enviado.
- **Tocar na notificação marca o hábito.** O `navigate` é
  `#/feito?habito=<id>&lembrete=<envio ISO>`, e o id guardado em
  `lastReminder` impede o mesmo toque de contar duas vezes. `snoozed`
  (`{ habitId, at }`) vale até o próximo envio daquele hábito, e só no mesmo
  dia. A notificação de teste só abre o app.
- **O dia vira em `dayStart`, não à meia-noite.** Todo "que dia é" passa por
  `dayOf(date, tz, dayStart)` (`db.dayOf()` no app). Os horários de lembrete
  são comparados em minutos desde a virada, então com virada às 05:00 um
  lembrete à 01:00 é do fim do dia. O check guarda o dia, não um horário, e
  por isso mudar a virada não mexe em checks já salvos.
- **`DB_NAME = 'habitos'` não muda.** Trocar o nome abre um banco vazio.
- **O `html` do `ui.js` apaga `false`.** `aria-pressed="${done}"` com `done`
  falso vira `aria-pressed=""`. Atributo booleano passa por `String(valor)`.
- **Telas que redesenham o `#view` penduram handlers nele, não nos filhos**
  (inclusive `onsubmit`). O `app.js` zera `onclick`, `oninput`, `onchange` e
  `onsubmit` a cada rota.
- **Arquivos `*.test.js` não são publicados** (`www/.assetsignore`).

## Telas

- `#/` **Hoje** (`views/today.js`): progresso do dia, hábitos que valem hoje
  (o círculo marca, o nome abre), a linha do próximo lembrete e a faixa de
  desfazer/adiar depois do toque na notificação.
- `#/habito?id=` (`views/habit.js`): sequência, taxa e a grade de semanas a
  partir da criação (máx. 12). Tocar num dia passado marca ou desmarca.
- `#/habito/novo` e `#/habito/editar?id=` (`views/habit-form.js`): nome,
  frequência, lembrete e arquivar.
- `#/habitos` (`views/habits.js`): todos os hábitos, ordem do Hoje e os
  arquivados.
- `#/ajustes` (`views/settings.js`): liga/desliga dos lembretes, teste,
  `/ajustes/virada` e `/ajustes/servidor` (token).
- `#/feito?habito=&lembrete=`: o toque na notificação (marca e cai no Hoje).

## Testes

Só os módulos puros e o Worker são testados. Os seams são:
- `reminder.js`: `dayOf`, `weekOf`, `isScheduled`, `mustDoToday`,
  `dueReminders`, `nextReminder` e `configError`
- `habits.js`: `todayList`, `dayProgress`, `streak`, `habitHistory` e
  `syncState`
- `worker/src/api.js` (`handleApi`) e `cron.js` (`handleCron`), com KV e
  `send` falsos

Para um teste de ponta a ponta do cron sem iPhone, rode `wrangler dev`, faça o
sync com uma assinatura P-256 válida e dispare o cron pela URL
`/__scheduled`. A biblioteca de push recusa endpoint `http:`, mas o log mostra
se o cron tentou enviar.

## Visual

Paleta neutra provisória (verde de "feito"), com tokens em `:root` e tema
escuro pelo sistema. A identidade (nome, mascote que reage ao
`dayProgress`, ícones) ainda não existe. Inputs usam 16px (abaixo disso o
Safari dá zoom). Caminhos são sempre relativos, e nada é carregado de fora.
