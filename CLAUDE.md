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
npm test                         # node --test: www/js, worker/src e scripts/*
node --test worker/src/cron.test.js
npm run dev                      # UI com live reload (browser-sync, sem API)
npm run dev:worker               # wrangler dev: app + API + cron (precisa de worker/.dev.vars)
npm run data                     # regera www/data/pokedex.json (CSVs da PokeAPI)
npm run sprites                  # regera www/sprites/ e www/data/sprites.json; roda depois do data
npm run gyms                     # regera www/data/gyms.json (times dos jogos, nuzlocke.data)
```

## Tema Pokémon (em construção)

O app está virando um jogo de Pokémon (uso pessoal; arte e nomes são da
Nintendo/Game Freak, não publicar). Dados e sprites são gerados por script e
versionados no repo (sprites ~140 MB); não edite à mão.

**As regras do jogo são provisórias.** O usuário vai usar o mock jogável e só
então decidir como o jogo funciona (ritmo de XP, escala de nível entre
regiões, punição). Mudar regra = mudar `game.js` com teste, não as telas.

- **Escolhas do jogo ficam no store `events`** (DB versão 2): `start`,
  `catch` e `battle`, com o resultado já sorteado. A meta do dia é o ajuste
  `goal` (0 a 1). "Recomeçar o jogo" em Ajustes apaga os eventos; hábitos e
  checks ficam.
- **`www/js/pokemon.js`** carrega `www/data/*.json` uma vez (estão no
  `ASSETS`) e monta o estado com `game()`. As telas do jogo partem dele.

- **`www/data/pokedex.json`**: `types`, `efficacy` (`efficacy.fire.grass === 2`,
  ausente = 1), `growth` (XP acumulado por nível, índice = nível − 1), `moves`
  (por id, todos, porque os chefes usam golpes de TM e de jogos antigos) e
  `pokemon` (1025 espécies, forma padrão). `moves` de cada pokémon é
  `[nível, idGolpe]` do jogo principal mais recente; nível 0 = ao evoluir.
  Nomes em inglês: a PokeAPI não tem pt-BR.
- **Evoluções** valem só partindo da forma padrão. Dez espécies (Obstagoon,
  Perrserker, Cursola, Sirfetch'd, Mr. Rime, Runerigus, Basculegion, Sneasler,
  Overqwil, Clodsire) só evoluem de forma regional e ficam sem caminho.
- **`www/sprites/<id>/{front,back}.gif`** são os animados 3D do Pokémon
  Showdown (espelho no repo de sprites da PokeAPI): um loop parado, sem golpe
  nem dano (isso é CSS). `www/data/sprites.json` (`ids`) lista quem tem os
  dois; 14 da Gen 9 não têm (990–995, 1006, 1008, 1010, 1017, 1022–1025).
- **`www/data/gyms.json`**: `regions` na ordem dos jogos (Kanto → Paldea), cada
  uma com `gyms`, `elite` e `champion`; o chefe é `{ name, type, team }` e o
  time é `{ species, level, moves, starter? }`. `starter` (`fire`/`water`/
  `grass`) marca a variante do time que depende do inicial do jogador. Versões
  Black e Sword; Alola usa as 10 provas e Galar os finalistas da Champion Cup.
  Níveis são os originais de cada jogo (cada região recomeça baixo).
- **`www/js/game.js` (`play`) recalcula o jogo inteiro a cada chamada**, dia a
  dia desde o evento `start`, a partir de `habits`, `checks` e `events` (as
  escolhas do jogador). Por isso marcar um dia passado já corrige níveis e
  Pokébolas. Não guarde nível nem XP: guarde o evento.
- **Regras do motor:** o nível sobe pela meta, não por XP: dia na meta
  (`goal`, 0 a 1) sobe o time (até 6) 1 nível na hora; na virada ainda dá 1
  Pokébola, e dia abaixo da meta tira 1 nível do time (mínimo 1, sem
  desevoluir). A caixa fica congelada. Quem foi pego no dia não sobe nele.
  Evolução só por nível puro. Todo pokémon novo (inicial ou capturado) entra
  no nível 1; começa com 5 Pokébolas.
- **Doce Raro e time:** cada dia na meta dá 1 doce (já no dia). O doce (`candy`
  com `uid`) sobe 1 nível de quem está abaixo do mais alto do time, até empatar;
  sem doce ou no mais alto, o evento é ignorado. `party` (`uids`, até 6, o
  primeiro é o principal) escolhe o time; o resto vai para a caixa.
- **Uma jornada por região:** vencer o campeão manda time e caixa para o
  Hall da Fama (`hall`) e esvazia o time; `needsStarter` pede um novo
  `start`. Cada jornada, inclusive a primeira, oferece só os 3 iniciais da
  geração da região. Assim os níveis
  originais de cada liga continuam valendo.
- **O selvagem do dia sai de um sorteio pela data** (`seeded`): o mesmo em
  qualquer recálculo. Forma básica da geração da região (por ora só Gen 1),
  sem lendário/mítico e com sprite. A chance é a fórmula da Gen 3/4.
- **Arremesso é sorteado pela tela e gravado com o resultado** (`catch` com
  `caught`): o motor nunca sorteia captura de novo ao recalcular.
- **Liga em sequência** (`play` → `challenge`): ginásios, Elite Four e campeão,
  região por região. A tela roda a batalha e grava `battle` com `won`; perder
  trava aquele chefe até o dia seguinte. Vencer o campeão muda a região e a
  geração dos selvagens (índice da região + 1). O time com variante de inicial
  usa o tipo do primeiro do seu time (fogo se não for fogo, água nem grama).
  `challenge.steps` traz todos os chefes da região atual já nessa variante, e
  `challenge.current` é o índice do próximo; a tela não lê o `gyms.json` cru
  para times.
- **`www/js/battle.js`** (`createBattle`, `turn(estado, rng)`): batalha
  automática, as duas IAs escolhem o golpe de maior dano esperado. Stats com IV
  31/EV 0/neutra, dano da Gen 5, golpes do seu pokémon = 4 últimos aprendidos.
  Golpe sem poder (status, dano fixo) não faz nada; sem golpe de dano, Struggle.
  `turn` não muda o estado recebido e devolve os `events` para a animação.
- **Sprites ficam no cache `SPRITES` do `sw.js`**, fora do `VERSION`, para não
  serem baixados de novo a cada deploy. Não entram no `ASSETS`.

## Modelo

- **`habits`**: `{ id, name, schedule, remindAt, createdDay, archived, order }`.
  `schedule` é `{ kind: 'daily' }`, `{ kind: 'days', days: [1, 3, 5] }`
  (numeração de `Date#getDay`) ou `{ kind: 'weekly', times: 3 }`.
- **`versions`** do hábito: `[{ from, schedule, archived }]`. Mudar a
  frequência ou arquivar registra uma versão a partir do dia (`reviseHabit`, no
  `db.saveHabit`), e `todayList` usa a versão de cada dia: o jogo recalcula o
  passado, então criar, arquivar ou mudar um hábito não pode reescrever dias
  antigos. Hábito sem `versions` (anterior a isso) vale desde `createdDay`.
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
- O **Hoje** também tem a arena (selvagem do dia contra o primeiro do time;
  marcar hábito anima o golpe), a Pokébola quando bate a meta, o resumo de
  ontem e, antes do inicial, a escolha entre os 3 da região.
- `#/pokemon?uid=` (`renderMon` em `views/team.js`): a ficha de quem está no
  time ou na caixa (status no nível, golpes, próximos golpes, evolução, tipos
  contra ele e as ações). Os números saem de `summary` do `battle.js`, os mesmos
  da luta. As partes visuais das fichas ficam em `views/mon-parts.js`.
- `#/pokedex/pokemon?id=` (`renderSpecies` em `views/pokedex.js`): a ficha da
  espécie para quem já foi visto (status base, evoluções com a condição, golpes
  por nível, tipos e os seus daquela espécie).
- `#/time` (`views/team.js`: o time numa grade 3×2, o primeiro é o principal, e a caixa; tocar abre a ficha), `#/pokedex` (`views/pokedex.js`, sprite só de
  quem foi visto; gerações em grupos que fecham, lembrados no localStorage) e `#/ginasios` (`views/gyms.js`): as abas do jogo, na barra
  de baixo (`#tabs`, só nas telas principais).
- `#/ginasios?regiao=` (Liga): as 9 regiões em abas no topo (abre na atual);
  cada uma com o estojo de insígnias e a Elite Four, só com o Ás de cada chefe.
  Na região atual vem antes o próximo desafio (só o Ás, sem o time).
- `#/batalha` (`views/gyms.js`): a luta é sorteada inteira e gravada antes de
  animar; sair no meio não dá outra chance.
- `#/ajustes/meta`: meta do dia; Ajustes também tem "Recomeçar o jogo".

## Testes

Só os módulos puros e o Worker são testados. Os seams são:
- `reminder.js`: `dayOf`, `weekOf`, `isScheduled`, `mustDoToday`,
  `dueReminders`, `nextReminder` e `configError`
- `habits.js`: `todayList`, `dayProgress`, `streak`, `habitHistory` e
  `syncState`
- `game.js`: `play` (com uma Pokédex falsa pequena) e `battle.js`:
  `createBattle`, `turn` (sorteio por parâmetro) e `summary` (a ficha)
- `worker/src/api.js` (`handleApi`) e `cron.js` (`handleCron`), com KV e
  `send` falsos
- `scripts/pokedex/build.js` (`parseCsv`, `buildPokedex`) e
  `scripts/gyms/build.js` (`buildLeague`); download e
  gravação (inclusive `scripts/sprites/`) não têm teste

Para um teste de ponta a ponta do cron sem iPhone, rode `wrangler dev`, faça o
sync com uma assinatura P-256 válida e dispare o cron pela URL
`/__scheduled`. A biblioteca de push recusa endpoint `http:`, mas o log mostra
se o cron tentou enviar.

## Visual

Visual "HOME" (estilo Pokémon HOME/GO, opção C do canvas do mock): fundo
claro, cards arredondados com sombra chapada (`--shadow`), vermelho da Poké
Bola como cor de ação, Fredoka nos títulos e números e Nunito no texto. As
fontes ficam em `www/fonts` (nada é carregado de fora) e entram no `ASSETS`.
Tema escuro pelo sistema. Inputs usam 16px (abaixo disso o Safari dá zoom).
Caminhos são sempre relativos.

- **Ícones do jogo** (`ball`, `emptyBall`, `candy` em `pokemon.js`) têm
  `stroke="none"` nas partes preenchidas: o CSS global põe stroke em todo svg.
- **Ícone do app:** `www/icons/icon.svg` (anel da meta com Poké Bola) é a
  fonte; os PNGs 180/192/512 saem dele (sharp). Trocar o SVG = regerar os PNGs.
- **A barra de baixo** (`#tabs`) tem a Poké Bola no centro (Hoje) e aparece só
  nas telas principais, Ajustes inclusive.
