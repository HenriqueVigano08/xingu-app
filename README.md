# Xingu

Controle de estoque para pequenos negócios.

O Xingu nasceu para tirar o estoque da planilha. Ele registra produtos, compras e vendas, calcula custo médio, margem e lucro, e fecha o mês com um relatório pronto para exportar. A equipe inteira trabalha sobre o mesmo estoque, cada pessoa com o próprio login, e quem administra a loja decide o que cada um pode ver e fazer.

Funciona no navegador do computador e do celular, sem instalar nada.

---

## Sumário

- [O que o Xingu faz](#o-que-o-xingu-faz)
- [Como funciona por dentro](#como-funciona-por-dentro)
- [Equipe e permissões](#equipe-e-permissões)
- [Cálculos](#cálculos)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rodando o projeto](#rodando-o-projeto)
- [Configuração](#configuração)
- [Publicação](#publicação)
- [Banco de dados e migrações](#banco-de-dados-e-migrações)
- [Testes](#testes)
- [Segurança](#segurança)
- [Custos](#custos)
- [Limitações conhecidas](#limitações-conhecidas)
- [Próximos passos](#próximos-passos)
- [Documentação complementar](#documentação-complementar)

---

## O que o Xingu faz

### Produtos
- Cadastro com nome, código (SKU), categoria, custo, preço de venda e estoque mínimo.
- Códigos não se repetem: o sistema recusa um segundo produto com o mesmo SKU.
- Busca por nome, código ou categoria, e filtro de produtos com estoque baixo.
- Produtos com saldo zero podem ser arquivados. Eles saem da lista, mas o histórico fica.

### Movimentações
- **Estoque inicial:** a quantidade que já existe no dia do cadastro. Não conta como compra do mês.
- **Entrada:** toda mercadoria comprada depois do cadastro. Atualiza o custo médio do produto.
- **Venda:** baixa do estoque pelo preço praticado. Guarda o custo daquele momento, então o lucro de vendas antigas não muda quando o custo muda depois.
- Não é possível vender mais do que o saldo disponível.
- **Estorno:** desfaz a última movimentação de um produto, com motivo obrigatório. O registro original continua no histórico, marcado como estornado.
- Cada movimentação guarda quem fez, quando e a observação informada.

### Relatórios
- Painel com valor do estoque, vendas do mês, lucro bruto e produtos em atenção.
- Gráfico de vendas por semana.
- Fechamento mensal com todas as movimentações do período.
- Exportação em CSV (abre no Excel) e impressão ou PDF pelo navegador.

### Administração
- Tela **Equipe** para autorizar, ajustar e bloquear acessos.
- Histórico de alterações: quem cadastrou, editou, arquivou ou estornou o quê.
- Backup dos dados em JSON, a qualquer momento, em Configurações.

---

## Como funciona por dentro

```
 Navegador (React)
     │  login e sessão ─────────────► Supabase Auth
     │
     │  /api/inventory, /api/team  (com o token de login)
     ▼
 Cloudflare Worker  ── confere token, e-mail confirmado e permissões
     │
     │  chave de serviço (só no servidor)
     ▼
 Supabase PostgreSQL ── confere as permissões de novo, dentro da transação
```

- A interface é um app React servido como arquivos estáticos pelo próprio Worker.
- O login (cadastro, confirmação de e-mail e recuperação de senha) é feito direto com o Supabase Auth.
- Todo acesso aos dados passa pelo Worker. O navegador nunca fala com as tabelas.
- O Worker valida o token, exige e-mail confirmado, aplica as permissões e remove dos dados o que a pessoa não pode ver.
- No banco, funções restritas ao servidor gravam as alterações e conferem as permissões mais uma vez, dentro da mesma transação. Assim, alguém que foi bloqueado no meio de uma operação não consegue concluí-la.
- O estoque de cada loja fica num documento JSON versionado. Se duas pessoas salvam ao mesmo tempo, a segunda recebe um aviso para atualizar a tela, e nada é sobrescrito.
- A tela se atualiza a cada 30 segundos e quando você volta para a aba. Abas em segundo plano não consultam o servidor.

---

## Equipe e permissões

Cada loja tem uma administração e quantos colaboradores precisar.

**Para incluir alguém:**
1. Em **Equipe**, informe o e-mail da pessoa, marque as permissões e clique em **Autorizar acesso**.
2. Envie o link do app para ela. O sistema não manda convite por e-mail.
3. Ela clica em **Cadastre-se**, usa o e-mail autorizado, cria a própria senha e confirma o e-mail.

Um cadastro feito com um e-mail que não foi autorizado não dá acesso a nada.

**Para bloquear:** em **Equipe → Editar acesso**, desmarque **Acesso ativo** e salve. A próxima operação da pessoa é recusada, mesmo que ela esteja com a tela aberta.

| Permissão | O que libera |
|---|---|
| *(todo membro ativo)* | Ver produtos, quantidades, preços de venda e histórico |
| Ver custos, margens e lucros | Valores de custo e cálculos financeiros |
| Cadastrar, editar e arquivar produtos | Dados do produto e arquivamento |
| Alterar preços e conceder descontos | Mudar preço e vender por outro valor |
| Registrar compras / entradas | Entrada de mercadoria |
| Registrar vendas | Saída por venda |
| Consultar relatórios | Painel e fechamento mensal |
| Exportar relatórios | CSV e PDF |
| Estornar movimentações | Desfazer a última movimentação de um produto |

Algumas permissões dependem de outras. Cadastro, entradas e estornos exigem ver custos; exportar exige consultar relatórios; criar produto exige também alterar preços. A tela marca as dependências sozinha e o servidor recusa combinações inválidas.

Quem não pode ver custos não recebe esses valores: o servidor tira os campos da resposta antes de enviar. Não é só uma questão de esconder na tela.

Detalhes em [docs/permissoes-e-regras.md](docs/permissoes-e-regras.md).

---

## Cálculos

| Indicador | Fórmula |
|---|---|
| Custo médio após uma compra | (saldo × custo atual + quantidade comprada × custo da compra) ÷ novo saldo |
| Margem | (preço de venda − custo) ÷ preço de venda |
| Ganho sobre o custo | (preço de venda − custo) ÷ custo |
| Lucro bruto do mês | vendas − custo das unidades vendidas |
| Valor em estoque | soma de saldo × custo médio |

- Valores são guardados em centavos, para evitar erros de arredondamento.
- O lucro bruto não desconta impostos, taxas de cartão, frete ou despesas fixas.
- Um estorno entra no relatório do mês em que foi feito. A venda original continua no mês dela.
- Datas seguem o horário de Brasília.

---

## Estrutura do projeto

```
.
├── src/
│   ├── main.tsx          telas de login, cadastro e recuperação de senha
│   ├── App.tsx           interface principal (painel, produtos, movimentações, relatórios, equipe)
│   ├── auth.ts           cliente do Supabase e chamadas autenticadas à API
│   ├── metrics.ts        cálculos do relatório mensal
│   └── style.css         visual e responsividade
├── worker/
│   ├── index.ts          API: autenticação, validações, permissões e movimentações
│   └── storage.ts        chamadas ao banco feitas pelo servidor
├── migrations/
│   ├── 001_inicial.sql   tabela do estoque
│   └── 002_equipe.sql    equipe, permissões e funções do servidor
├── tests/
│   └── inventory.mjs     testes automatizados com PostgreSQL real em memória
├── public/
│   └── favicon.svg
├── docs/
│   ├── instalacao.md
│   └── permissoes-e-regras.md
├── index.html
├── vite.config.ts
├── wrangler.jsonc        configuração do Worker no Cloudflare
└── package.json
```

---

## Rodando o projeto

Precisa de **Node.js 22 ou mais recente**.

```bash
npm ci            # instala as dependências nas versões travadas
npm test          # testes automatizados
npm run check     # verificação de tipos do TypeScript
npm run build     # gera a versão de produção em dist/
npm run preview   # sobe o Worker localmente, com a API
```

- `npm test` não acessa o banco real. Ele cria um PostgreSQL temporário em memória, roda as migrações e testa todas as regras.
- `npm run build` exige o arquivo `.env`. Sem ele, o build para de propósito, para que nunca seja publicado um site sem login.
- `npm run preview` exige o `.dev.vars` e usa o banco configurado nele. Se for o banco de produção, os testes manuais mexem em dados reais.
- `npm run dev` sobe só a interface, sem a API. Serve para ajustes visuais.

Também dá para trabalhar sem instalar nada, pelo **GitHub Codespaces**: no repositório, **Code → Codespaces → Create codespace on main**. O ambiente já vem com Node.

---

## Configuração

Três lugares guardam configurações, e cada um tem um papel:

| Onde | Variáveis | Pode ser público? |
|---|---|---|
| `.env` (local) e variáveis de build do Cloudflare | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Sim. Vão para o navegador |
| `.dev.vars` (só local) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Não |
| Segredos do Worker no Cloudflare | os mesmos três acima | Não |

Modelo do `.env`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

A chave `service_role` dá acesso total ao banco. Ela nunca pode ter o prefixo `VITE_`, nunca vai para o navegador e nunca entra no repositório. O `.gitignore` já exclui `.env` e `.dev.vars`.

---

## Publicação

A publicação é automática. O Worker está conectado a este repositório pelo **Workers Builds** do Cloudflare:

1. Uma alteração chega ao ramo `main`, seja por commit, upload ou edição no próprio GitHub.
2. O Cloudflare baixa o código e roda `npm test && npm run check && npm run build`.
3. Se tudo passar, roda `npx wrangler deploy` e a versão nova entra no ar em cerca de um minuto.
4. Se qualquer etapa falhar, nada é publicado e a versão anterior continua no ar.

As variáveis `VITE_...` ficam em **Settings → Build → Variables** do Worker. Os segredos do servidor ficam em **Settings → Variables and Secrets** e não mudam a cada publicação.

**Para voltar a uma versão anterior:** em **Deployments**, no menu **⋯** da versão desejada, escolha a opção de rollback. Pelo terminal, o equivalente é `npx wrangler rollback <id-da-versão>`.

A publicação manual continua possível com `npm run deploy`, desde que o terminal esteja autenticado no Cloudflare (`npx wrangler login` ou um token em `CLOUDFLARE_API_TOKEN`).

---

## Banco de dados e migrações

As migrações ficam em `migrations/` e rodam no **SQL Editor** do Supabase, em ordem:

| Arquivo | O que faz |
|---|---|
| `001_inicial.sql` | Cria a tabela `inventories`, com RLS ativo e sem acesso pelo navegador |
| `002_equipe.sql` | Cria `xingu_members`, as funções `xingu_context`, `xingu_commit` e `xingu_team` e uma cópia de segurança dos dados anteriores |

Antes de rodar a `002`, troque `admin@exemplo.com` pelo e-mail da conta que vai administrar a loja. Essa conta precisa já existir e ter o e-mail confirmado. A migração roda dentro de uma transação: se algo der errado, nada é aplicado. Ela também pode ser executada de novo sem perder dados.

Só o servidor pode chamar as funções do banco. As chaves públicas não têm acesso às tabelas nem às funções.

---

## Testes

O arquivo `tests/inventory.mjs` sobe um PostgreSQL de verdade em memória (PGlite), aplica as duas migrações e exercita o Worker de ponta a ponta. Entre outras coisas, ele confere:

- login inválido, e-mail não confirmado e conta não autorizada;
- bloqueio de pedidos vindos de outro site;
- custo médio, estoque inicial, vendas e lucro;
- venda acima do saldo e quantidades negativas;
- códigos duplicados;
- estornos em ordem e tentativa de estornar duas vezes;
- permissões de cada função e remoção dos custos para quem não pode vê-los;
- bloqueio de um colaborador no meio de uma gravação;
- duas vendas simultâneas do mesmo item;
- arquivamento;
- isolamento entre lojas diferentes;
- relatório mensal com estorno em outro mês.

Quando tudo passa, aparece uma linha começando com `PASS`.

---

## Segurança

- O servidor valida o token de login em toda chamada e exige e-mail confirmado.
- As permissões são aplicadas no servidor e conferidas de novo no banco, na mesma transação da gravação.
- Custos e margens são removidos das respostas para quem não tem permissão.
- Pedidos de alteração vindos de outro domínio são recusados.
- As tabelas têm RLS ativo e não têm nenhuma permissão para as chaves públicas.
- O versionamento impede que uma alteração apague outra feita ao mesmo tempo.
- O backup automático dos dados é feito por um repositório privado separado.

Encontrou um problema de segurança? Abra uma issue sem detalhes sensíveis, pedindo um contato.

---

## Custos

O projeto foi montado para rodar nos planos gratuitos:

| Serviço | Uso | Plano gratuito |
|---|---|---|
| Cloudflare Workers | site, API e builds | 100 mil requisições por dia |
| Supabase | login e banco | 500 MB de banco. O projeto pausa após 7 dias sem uso |
| Gmail (SMTP) | e-mails de confirmação e recuperação | cerca de 500 e-mails por dia |
| GitHub | código, Codespaces e backup | suficiente para este uso |

Os limites são dos próprios provedores e podem mudar. Vale conferir de tempos em tempos.

---

## Limitações conhecidas

- Uma loja por conta e uma administração por loja.
- Transferir a administração para outra pessoa exige um procedimento manual no banco.
- Ainda não há tela de ajuste manual de saldo nem de desarquivamento.
- O estorno vale só para a última movimentação válida de cada produto.
- Movimentações antigas, da primeira versão, não podem ser estornadas automaticamente.
- Estoque e histórico ficam num único documento por loja. Funciona bem para uma loja pequena; com um histórico muito grande, vai ser preciso separar em tabelas e paginar.
- A exportação pode ser restrita, mas quem vê os dados na tela consegue copiá-los.
- O backup em JSON da tela de Configurações não restaura contas nem permissões.

---

## Próximos passos

- Migrar para as chaves novas do Supabase (*publishable*) antes da desativação das chaves legadas, prevista para o início de 2027.
- Tela de ajuste de inventário, para contagens físicas.
- Desarquivar produtos.
- Separar movimentações em tabela própria, com paginação.

---

## Documentação complementar

- [docs/instalacao.md](docs/instalacao.md): instalação do zero, configuração de e-mail e teste de aceitação.
- [docs/permissoes-e-regras.md](docs/permissoes-e-regras.md): permissões em detalhe, regras de estorno e arquivamento.

---

© 2026 Henrique Viganó. Todos os direitos reservados.
