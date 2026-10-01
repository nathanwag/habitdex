# Hábitos

Tracker de hábitos no iPhone. É um app web instalado na Tela de Início que
lembra, por notificação push, dos hábitos que ainda faltam no dia. Você marca
cada hábito com um toque, e os horários dos lembretes ficam em cada hábito.

- **Três frequências:** todo dia, dias fixos (ex.: seg, qua, sex) ou X vezes
  por semana, em qualquer dia.
- **Lembrete por hábito, só se ainda falta.** Cada hábito tem um horário
  opcional. O de "X vezes por semana" só lembra quando não dá mais pra deixar
  pra depois (ex.: 3x por semana, nada feito, e já é sexta).
- **Tela Hoje:** o que vale pro dia, com a sequência de cada hábito e o
  progresso do dia. Tocar no círculo marca, e tocar no nome abre o hábito.
- **Tela do hábito:** sequência (dias agendados seguidos, ou semanas seguidas
  no semanal), taxa de cumprimento e a grade das últimas 12 semanas. Tocar num
  dia passado marca ou desmarca.
- **Virada do dia configurável** (ex.: 05:00, pra madrugada contar no dia
  anterior).
- **Custo zero:** um Cloudflare Worker no plano grátis. O repositório pode ser
  privado.

## Como funciona

```
iPhone (app instalado)              Cloudflare Worker
  marca hábitos (IndexedDB) ──PUT /api/sync──▶ KV: assinatura, hábitos, feitos hoje/na semana
  sw.js exibe a notificação         cron a cada 5 min: venceu? → Web Push (VAPID)
        ▲                                     │
        └────────── push da Apple ◀───────────┘
```

O iOS não deixa um app web agendar notificações sozinho. Quem decide a hora é o
Worker, e a regra fica em `www/js/reminder.js`. O app importa esse arquivo pra
mostrar o "próximo lembrete", e o Worker importa o mesmo arquivo pra decidir o
envio.

## Setup (uma vez)

1. **Cloudflare.** Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com).
   - Em *My Profile › API Tokens*, crie um token com o template
     **Edit Cloudflare Workers**.
   - Anote também o **Account ID**, que aparece na barra lateral de
     *Workers & Pages*.
2. **Chaves de push (VAPID).** Rode `npx web-push generate-vapid-keys`.
3. **Secrets do GitHub.** Em *Settings › Secrets and variables › Actions*,
   cadastre:

   | Secret | Valor |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | o token do passo 1 |
   | `CLOUDFLARE_ACCOUNT_ID` | o Account ID |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | as chaves do passo 2 |
   | `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |
   | `APP_TOKEN` | uma senha qualquer, que o app vai pedir |

4. **Deploy.** Faça um push na `main` ou rode o workflow **Deploy** na aba
   Actions. No fim do log aparece a URL:
   `https://habitos.<seu-subdominio>.workers.dev`. O KV `STATE` é criado
   automaticamente no primeiro deploy.
5. **iPhone:**
   1. Abra a URL no **Safari** e toque em **Compartilhar › Adicionar à Tela de
      Início**.
   2. Abra o app **pelo ícone**. Push só funciona no app instalado.
   3. Vá em **Ajustes › Servidor** e cole o `APP_TOKEN`.
   4. Volte pra **Ajustes** e ligue a chave **Lembretes**, no topo. Aceite a
      permissão de notificação.
   5. Toque em **Mandar notificação de teste**. Ela deve chegar em segundos.

Tocar no lembrete de um hábito já marca ele como feito: o iOS não mostra botões
em web push. O app abre com a opção **Não fiz · adiar 10 min** (desmarca e
lembra de novo em 10 a 15 min) e **Desfazer**. A notificação de teste só abre
o app.

Requer iOS 16.4 ou mais novo.

## Desenvolvimento

```bash
npm test             # testes (node --test): agenda e lembretes, contas dos hábitos, cron, API
npm run dev          # só a interface, com live reload (/phone = moldura de celular)
npm run dev:worker   # app + API + cron em http://localhost:8787 (wrangler dev)
```

O `dev:worker` precisa de um `worker/.dev.vars` (fica fora do git) com
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `APP_TOKEN`. Para
disparar o cron na mão:
`curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

No Chrome do desktop, o push funciona em `localhost`, então dá pra testar o
fluxo inteiro sem o iPhone. Os logs de produção aparecem em
`npx wrangler tail` (rode dentro de `worker/`).
