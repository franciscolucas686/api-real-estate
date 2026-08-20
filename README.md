<div align="center">

# 🏗️ API — Minha Imobiliária

**Esse back-end tirou uma imobiliária inteira da galeria do celular.**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)

[![CI](https://img.shields.io/github/actions/workflow/status/franciscolucas686/api-real-estate/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/franciscolucas686/api-real-estate/actions)
![Testes](https://img.shields.io/badge/testes-176%20unit%C3%A1rios%20%2B%205%20e2e-success?style=flat-square)
![Docker](https://img.shields.io/badge/setup-docker%20compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey?style=flat-square)

**[🔗 Ver aplicação](https://francinegestoraimobiliaria.com)** · **[💻 Repositório do front-end](https://github.com/franciscolucas686/real-estate-app)** · **[📚 Swagger](https://api.francinegestoraimobiliaria.com/docs)**

</div>

---

## 📖 O que é isto

Esta é a API que tem o catálogo de imóveis de uma imobiliária real. Antes dela, as fotos
dos imóveis viviam espalhadas entre a galeria do celular do corretor e pastas soltas no Drive —
achar "aquele apartamento de 2 quartos até R$ 400 mil" era rolar conversa de WhatsApp.

Ela atende **dois públicos com necessidades opostas**, e quase toda decisão de arquitetura aqui
sai desse contexto:

| Quem chama | O que precisa | O que a API garante |
|---|---|---|
| **Visitante do site** (sem login) | Ver rápido o que está publicado | Só imóveis `ACTIVE`, respostas cacheadas, rate limit generoso |
| **Corretor** (autenticado) | Cadastrar, subir fotos, publicar | Sessão em cookie HttpOnly, upload processado, limites apertados no login |
| **Crawler do WhatsApp** | Montar o preview do link compartilhado | HTML com Open Graph e uma imagem de capa gerada na hora |

O front-end que consome a API é um PWA em React e vive [está nesse outro repositório](https://github.com/franciscolucas686/real-estate-app).

---

## 🛠️ Stack

| Camada | Tecnologia | Por que |
|---|---|---|
| **Framework** | NestJS 11 | Módulos, injeção de dependência e guards — a estrutura que mantém 15 modelos organizados |
| **Banco** | PostgreSQL 15 + Prisma 7 | Migrations versionadas e tipagem do schema até o controller |
| **Validação de entrada** | class-validator + DTOs | Regras condicionais por tipo de imóvel, checadas antes de chegar ao serviço |
| **Validação de ambiente** | Zod | O app se recusa a subir com env inválida — e exige mais coisas em produção |
| **Autenticação** | JWT em cookie HttpOnly + Passport | O token nunca fica acessível a JavaScript no navegador |
| **Fotos** | Cloudflare R2 (S3) + Sharp | Reencodadas no servidor; em dev o R2 é substituído por MinIO local |
| **Proteção** | Helmet + @nestjs/throttler | Rate limit por usuário autenticado, ou por IP real, rota a rota |
| **Documentação** | Swagger | Todo endpoint anotado, disponível em `/docs` |
| **Testes** | Jest + Supertest | 176 unitários (sem banco) e 5 suítes e2e (com banco) |
| **Deploy** | Docker + Fly.io | Build multi-stage; migration roda antes de a versão nova receber tráfego |

---

## 🚀 Rodando localmente

Você vai precisar de **Node.js 22+** (há um `.nvmrc` — `nvm use` resolve) e **Docker**. São
seis comandos, e nenhum passo manual escondido.

> Se a intenção é ver o produto, **suba esta API primeiro**: o
> [front-end](https://github.com/franciscolucas686/real-estate-app) aponta para
> `http://localhost:3000` por padrão, e sem a API no ar ele carrega com a listagem vazia.

```bash
# 1. Clonar e instalar
git clone https://github.com/franciscolucas686/api-real-estate.git
cd api-real-estate
npm install

# 2. Variáveis de ambiente — o arquivo já vem com os valores que funcionam com o Docker abaixo
cp .env.example .env.development

# 3. Subir Postgres + MinIO (o "S3 de mentira" local). Também cria o bucket e o banco de teste.
docker compose up -d

# 4. Criar as tabelas
npm run db:migrate:dev

# 5. Popular com dados de exemplo (10 imóveis, 40 cômodos, 120 fotos)
npm run db:seed:dev

# 6. Subir a API
npm run start:dev
```

Pronto:

- API em **http://localhost:3000**
- Documentação interativa em **http://localhost:3000/docs**
- Console do MinIO em **http://localhost:9001** (`minioadmin` / `minioadmin`)

**Login criado pelo seed:** `admin@imobiliaria.com` / `Admin@123`

> ⚠️ **Sobre o nome do arquivo `.env.development`.** Este projeto não lê `.env`. Todos os scripts
> carregam o arquivo explicitamente (`dotenv -e .env.development -- nest start`), e o `dotenv-cli`
> **ignora arquivo ausente em silêncio**. Se você criar `.env` por engano, não aparece erro de
> arquivo — o app morre depois, na validação, dizendo `JWT_SECRET deve ter no mínimo 32 caracteres`.
> A mensagem aponta para a variável e nunca para a causa. É por isso que o `.env.example` insiste
> nesse ponto.

> ⚠️ **O passo 5 leva cerca de um minuto, e isso é esperado.** Ele baixa 120 fotos de exemplo do
> `picsum.photos` (5 por cômodo, 5 em paralelo) e resolve cada bairro no Nominatim, que exige uma
> pausa de 1s entre chamadas. A saída são pontos, um por foto: `.` é sucesso, `!` é falha.
> **Falha de foto não derruba o seed** — o imóvel entra sem aquela imagem. Se a internet estiver
> fora, você termina com os 10 imóveis e nenhuma foto: o app funciona, os cards ficam com
> "Sem fotos".

> ⚠️ **O seed apaga tudo antes de recriar** — banco *e* bucket. Por isso ele exige
> `RUN_SEED="true"` e se recusa a rodar com `NODE_ENV=production`.

---

## 🧪 Testes

```bash
npm test          # 176 testes unitários — não precisa de banco, nem de .env
npm run test:cov  # com relatório de cobertura
npm run test:e2e  # 5 suítes ponta a ponta — precisam de banco
```

Os unitários rodam num clone limpo, logo depois do `npm install`. É proposital: quem está só
avaliando o projeto consegue ver a suíte verde sem subir infraestrutura nenhuma. O que sustenta
isso é o `postinstall` do `package.json`, que roda `prisma generate` — o Prisma 7 não gera mais
o client sozinho na instalação, e sem essa linha `npm test`, `npm run build` e `npm run
typecheck` quebram num clone recém-feito, todos com um erro que aponta para `@prisma/client` e
nunca para a causa.

Os e2e sobem a aplicação de verdade e batem nela com Supertest, contra o banco `app_test`
(separado do de desenvolvimento, para não apagar seus dados). O `docker compose up -d` já cria
esse banco. Falta só o arquivo de ambiente:

```bash
cp .env.test.example .env.test
npm run db:migrate:test
npm run db:seed:test
npm run test:e2e
```

O `R2Service` fica deliberadamente desconfigurado nos testes, e quem toca armazenamento precisa
mocká-lo — nenhum teste escreve num bucket de verdade.

---

## 🔍 Qualidade

```bash
npm run lint          # ESLint (src + test), sem corrigir — é este que o CI roda
npm run lint:fix      # o mesmo, corrigindo
npm run format:check  # Prettier em modo verificação
npm run typecheck     # tsc --noEmit
```

O **CI roda em todo PR** para `main` e `develop`: lint, formatação, build, migration, seed,
unitários e e2e, contra um Postgres efêmero. O **CD roda em push para `main`** e só chama o deploy
no Fly.io depois que esse mesmo portão passa — a dependência é declarada (`needs: verify`), não
uma corrida entre dois workflows.

---

## 🗺️ Endpoints

Todos anotados no Swagger em `/docs`, que é a fonte completa. Resumo:

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| `POST` | `/auth/register` | header `x-admin-secret` | Cria usuário (não é auto-cadastro aberto) |
| `POST` | `/auth/login` | público | Devolve os cookies de sessão |
| `POST` | `/auth/refresh` | cookie de refresh | Renova o token de acesso |
| `GET` | `/auth/me` | opcional | Perfil, ou anônimo — não erra sem login |
| `POST` | `/auth/logout` · `/auth/logout-all` | autenticado | Encerra uma sessão, ou todas |
| `GET` | `/properties` | opcional | Lista com filtros; anônimo vê só `ACTIVE` |
| `GET` | `/properties/:id` | opcional | Detalhe; anônimo recebe 404 se não publicado |
| `GET` | `/properties/status-counts` | opcional | Contagem por status, para o dashboard |
| `POST` `PATCH` `DELETE` | `/properties/:id` | autenticado | CRUD, com *soft delete* |
| `GET` | `/properties/trash` · `PATCH /:id/restore` | autenticado | Lixeira e restauração |
| `PATCH` | `/properties/:id/status` | autenticado | Publica ou desativa manualmente |
| `POST` `DELETE` | `/properties/:id/images` | autenticado | Upload e remoção de fotos |
| `POST` `PATCH` `DELETE` | `/properties/:id/rooms` | autenticado | Cômodos da galeria |
| `PATCH` | `/properties/:id/images/reorder` | autenticado | Ordem das fotos |
| `GET` `PATCH` | `/site-settings` | público / autenticado | Contato público da imobiliária |
| `GET` `POST` `PATCH` `DELETE` | `/whatsapp-numbers` | autenticado | Pool de números distribuído entre imóveis |
| `POST` | `/geocode/forward` · `/reverse` | autenticado | Endereço ↔ coordenadas, via Nominatim |
| `GET` | `/share/properties/:id` | público | HTML com Open Graph + redirect para a SPA |
| `GET` | `/` | público | Health check (usado pelo Fly) |

---

## 🗄️ Modelo de dados

15 modelos, 23 migrations. O núcleo:

```
Property ─┬─ PropertyRoom ── PropertyImage      "Sala", "Cozinha", cada uma com suas fotos
          ├─ PropertySaleType                    financiamento, permuta, à vista…
          ├─ Neighborhood ── LocationCache       bairro normalizado + coordenadas em cache
          └─ um de: House · Apartment · Land · SmallFarm · CountryHouse
```

A tabela dos subtipos é o ponto interessante: **um terreno não tem quartos e um apartamento não
tem topografia.** Em vez de uma tabela larga cheia de coluna nula, cada tipo tem a sua, e o
`Property` carrega só o que é comum a todos. Fora do núcleo ficam `User`, `Session`,
`SiteSettings` e `WhatsappNumber`.

---

## 🏛️ Decisões de arquitetura

Cada bloco abaixo é um problema que apareceu de verdade. Nenhum é teoria.

<details>
<summary><b>🔐 Por que a sessão vive num cookie HttpOnly, e não no localStorage</b></summary>

<br>

O token de acesso dura 15 minutos e o de refresh 7 dias; ambos viajam em cookies `HttpOnly`,
`Secure` e `SameSite=lax`. JavaScript no navegador não consegue ler nenhum dos dois — o que tira
o roubo de token da lista do que um XSS conseguiria fazer.

Cada refresh tem uma linha na tabela `Session`, então `logout-all` realmente encerra as outras
sessões, em vez de só apagar o cookie de quem clicou. O custo disso é uma tabela que só cresce:
uma sessão expirada nunca mais é lida (a strategy a rejeita pelo `expiresAt`) e nada a removia.
Existe um cron às 04:00 para isso, protegido por *advisory lock* do Postgres — com mais de uma
instância no ar, todas acordam no mesmo horário e só uma deve varrer.

`COOKIE_DOMAIN` fica vazio de propósito, **inclusive em produção**, com o site no apex e a API em
`api.`. Quem emite o cookie é a API, então o padrão *host-only* já o prende ao host certo, e
`lax` não bloqueia nada porque subdomínios do mesmo domínio são o mesmo *site*. Preencher só faria
o cookie de sessão acompanhar o apex, o www e todo subdomínio futuro — nenhum deles precisa dele.

</details>

<details>
<summary><b>🚦 O rate limit e a linha `trust proxy` que faz ele existir</b></summary>

<br>

Os limites são por rota: `POST /auth/login` aceita 5 tentativas por 5 minutos, enquanto
`GET /properties/:id` aceita 120 por minuto. Autenticado, o balde é chaveado pelo id do usuário;
anônimo, pelo IP.

Aí está a pegadinha. Em produção existe um proxy na frente (o Fly termina o TLS e encaminha), e
sem `app.set('trust proxy', 1)` o Express reporta em `req.ip` o *peer* TCP imediato — o proxy —
**igual para todo mundo**. O limite por IP vira um teto global: dois ou três visitantes anônimos
esgotavam o balde de `POST /auth/refresh` e derrubavam a sessão do corretor junto.

O número `1` também é o que impede a falsificação. `req.ips` não é o `X-Forwarded-For` inteiro: é
a cadeia já truncada pelo nível de confiança. Com 1 hop, sobra apenas a entrada que o Fly de fato
observou; um cliente que mande o próprio cabeçalho empurra IPs para fora da janela confiável e
eles são descartados. Verificado com `XFF: 1.2.3.4, 5.5.5.5, 9.9.9.9` → tracker `9.9.9.9`.

O acoplamento a vigiar é esse número: ele tem que ser igual à quantidade real de proxies na
frente. Pôr a Cloudflare proxiada em `api.` acrescenta um hop.

</details>

<details>
<summary><b>📸 O status do imóvel se move sozinho — pela contagem de fotos</b></summary>

<br>

Um imóvel nasce `PENDING` e não aparece para visitante nenhum. Publicar não é uma etapa
esquecível do formulário: **assim que a primeira foto entra, ele vira `ACTIVE`**; quando a última
sai, volta para `PENDING`. Um imóvel `INACTIVE` (desativado à mão) nunca muda sozinho.

Isso existe porque a alternativa é pior. Um anúncio sem foto no ar é um anúncio que ninguém clica,
e um anúncio com foto parado em rascunho é trabalho jogado fora — os dois estados aconteciam.

São dois métodos distintos e a diferença é deliberada: o upload acabou de inserir imagens, então a
contagem é `> 0` por construção e ele só olha para um lado. A remoção precisa consultar de fato.

</details>

<details>
<summary><b>🧱 O app se recusa a subir com ambiente inválido</b></summary>

<br>

Um schema Zod valida `process.env` no `bootstrap()`, **antes** de o Nest instanciar qualquer coisa.
Em produção ele exige mais: `DATABASE_URL`, as credenciais do R2, `ADMIN_SECRET` e `CORS_ORIGIN`.

O caso do `CORS_ORIGIN` é o que motivou a regra. Faltando, o `enableCors` cai no default `*` do
pacote `cors`, que o navegador recusa quando `credentials: true` está ligado. Resultado: o app
sobe saudável, o site carrega, e **nenhum imóvel aparece** — com o erro visível só no console de
quem está visitando. Falhar no boot, com o nome da variável na mensagem, é o diagnóstico que essa
falha não tem sozinha.

`CORS_ORIGIN="*"` também é rejeitado explicitamente em produção, pelo mesmo motivo.

</details>

<details>
<summary><b>💬 Por que existe uma rota que devolve HTML numa API JSON</b></summary>

<br>

Quando alguém manda um link de imóvel no WhatsApp, quem busca a página não é um navegador — é um
crawler que não roda JavaScript. Apontado direto para a SPA, ele recebe o `index.html` vazio e o
preview sai sem foto, sem preço, sem nada.

Por isso `GET /share/properties/:id` devolve um HTML mínimo, só com as tags Open Graph do imóvel,
e redireciona pessoas de verdade para a SPA. A imagem de capa é gerada sob demanda em
`/share/properties/:id/image.jpg`, no formato que os previews esperam.

</details>

<details>
<summary><b>🖼️ Toda foto é reencodada antes de chegar ao bucket</b></summary>

<br>

O upload não confia na extensão nem no `Content-Type` — quem garante que aquilo é uma imagem é o
Sharp, que decodifica e reencoda tudo. Um `.jpg` que na verdade é outra coisa não sobrevive à
decodificação, e o que vai para o bucket é sempre um arquivo gerado aqui.

O Sharp roda com `cache(false)` e `concurrency(1)`: numa máquina de 1 GB, o cache interno não
traz benefício e só consome memória, e o paralelismo padrão dele disputa CPU com o resto do app.

</details>

---

## 📦 Deploy

Produção roda no **Fly.io**, a partir do `Dockerfile` multi-stage deste repositório.

O `cd.yml` dispara em push para `main`, roda o portão completo (lint, build, migration, seed,
unitários, e2e) e só então chama `flyctl deploy`. As migrations de produção não saem daqui: quem
as roda é o `release_command` do `fly.toml`, **depois** do build e **antes** de a versão nova
receber tráfego — trazer isso para o workflow exigiria a `DATABASE_URL` de produção como secret do
GitHub, sem nenhum ganho.

O deploy tem `concurrency: deploy-group`: dois pushes seguidos na `main` não podem disputar a
mesma máquina, porque duas execuções simultâneas de `prisma migrate deploy` no mesmo banco é o
pior caso possível.

---

## 📜 Todos os comandos

| Comando | O que faz |
|---|---|
| `npm run start:dev` | API com hot reload |
| `npm run start:debug` | O mesmo, com o inspector aberto |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda o build compilado |
| `npm run lint` · `lint:fix` | ESLint, sem e com correção |
| `npm run format` · `format:check` | Prettier, escrevendo ou só verificando |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` · `test:watch` · `test:cov` | Testes unitários |
| `npm run test:e2e` | Testes ponta a ponta |
| `npm run db:migrate:dev` | Cria/aplica migration em desenvolvimento |
| `npm run db:seed:dev` | Popula o banco de desenvolvimento |
| `npm run db:reset:dev` | Derruba, recria e repopula |
| `npm run db:migrate:test` · `db:seed:test` | O mesmo, no banco de teste |
| `npm run prisma:studio` | Cliente visual do banco |
| `npm run prisma:generate` | Regenera o client do Prisma |

---

## 👨‍💻 Autor

**Francisco Lucas**

Desenvolvedor em transição de carreira, construindo software para resolver problemas reais de
negócios reais. Este projeto nasceu de uma imobiliária que precisava sair da galeria do celular.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-conectar-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/francisco-lucas-dev/)
[![GitHub](https://img.shields.io/badge/GitHub-seguir-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/franciscolucas686)
[![Email](https://img.shields.io/badge/Email-falar-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:franciscolucas686@gmail.com)

## 📄 Licença

MIT — veja [LICENSE](LICENSE).

<div align="center">

⭐ **Se este projeto te interessou, deixe uma estrela!**

</div>
