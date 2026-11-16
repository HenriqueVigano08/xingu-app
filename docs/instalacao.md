# Instalação

Guia para publicar o Xingu do zero em Supabase (login e banco) e Cloudflare Workers (site e API). Os dois serviços têm planos gratuitos com limites; confira as condições atuais antes de começar.

## 1. Banco de dados (Supabase)

1. Crie um projeto em https://supabase.com/dashboard.
2. Em **Authentication**, habilite login por e-mail e senha, mantenha a **confirmação de e-mail ativada** e defina senha mínima de 12 caracteres.
3. Cadastre a conta que será a administração da loja e confirme o e-mail.
4. Abra o **SQL Editor** e execute, nesta ordem:
   - `migrations/001_inicial.sql`: cria a tabela de estoque, sem acesso direto pelo navegador.
   - `migrations/002_equipe.sql`: **antes de executar**, troque `admin@exemplo.com` pelo e-mail da administração. Cria equipe, permissões e funções do servidor.

A migração 002 roda em transação e pode ser repetida sem perder dados. Não desative RLS nem crie políticas públicas para contornar erros.

## 2. Configuração local

Copie `.env.example` para `.env` e preencha com a **Project URL** e a chave **anon** do projeto:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

Para testar a API localmente, crie também `.dev.vars` com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum desses arquivos vai para o repositório.

```bash
npm ci
npm test
npm run check
npm run build
```

## 3. Publicação (Cloudflare Workers)

```bash
npx wrangler login
npx wrangler whoami
npm run deploy
```

Depois cadastre os segredos do servidor, um por vez (o valor é pedido no terminal):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Os segredos ficam guardados no Cloudflare e continuam valendo nas próximas publicações.

## 4. Endereços de retorno

No Supabase, em **Authentication → URL Configuration**:

- **Site URL**: o endereço publicado, por exemplo `https://seu-app.sua-conta.workers.dev/`.
- **Redirect URLs**: o mesmo endereço e também `.../?recovery=1`.

## 5. Envio de e-mails (SMTP)

O envio padrão do Supabase só entrega para membros da equipe do projeto Supabase e tem limite baixo. Para que colaboradores recebam confirmação e recuperação de senha, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.

Opção gratuita para pouco volume: Gmail com **senha de app** (exige verificação em duas etapas na conta Google).

| Campo | Valor |
|---|---|
| Host | `smtp.gmail.com` |
| Porta | `465` |
| Usuário | o endereço Gmail |
| Senha | a senha de app de 16 caracteres (não a senha normal) |
| Remetente | o mesmo endereço Gmail |

Não adicione colaboradores como membros do projeto Supabase para contornar essa limitação.

## 6. Teste de aceitação

Antes de cadastrar produtos reais, use um produto chamado `TESTE — não usar` (custo R$ 10, venda R$ 25, quantidade 2):

1. Autorize um segundo e-mail em **Equipe**, só com **Registrar vendas**. A pessoa se cadastra pelo link do app usando esse e-mail.
2. Com essa conta: o produto aparece, mas sem custos, lucros, Equipe, entradas ou cadastro; o preço de venda fica fixo.
3. Venda 1 unidade com ela. Como administração, o saldo deve ser 1 e o histórico mostra o e-mail dela.
4. Tente vender 2 unidades: deve ser bloqueado.
5. Bloqueie a conta em **Equipe**: a próxima operação dela deve falhar.
6. Como administração, estorne a venda e depois o estoque inicial. O saldo volta a 0.
7. Arquive o produto e confira que o relatório do mês ficou zerado.
8. Teste a recuperação de senha da segunda conta.

## Problemas comuns

| Sintoma | Verifique |
|---|---|
| "Configuração de acesso pendente" | `.env` preenchido e nova publicação |
| "Serviço ainda não configurado" | Os três segredos do Worker |
| E-mail de confirmação não chega | SMTP próprio configurado |
| Link de e-mail volta para localhost | Site URL e Redirect URLs |
| Link de recuperação inválido | Pedir link novo e abrir no mesmo navegador |
| "Outra pessoa atualizou os dados" | Atualizar a página e repetir a operação |
