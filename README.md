# Xingu

Controle de estoque para pequenos negócios. Produtos, entradas, vendas, margens e relatórios mensais, com uma equipe trabalhando sobre o mesmo estoque e permissões definidas pela administração.

## Funcionalidades

- Cadastro de produtos com código (SKU), categoria, custo, preço de venda e estoque mínimo.
- Estoque inicial separado das compras do mês.
- Entradas com custo médio ponderado; vendas preservam o custo do momento da saída.
- Bloqueio de vendas acima do saldo disponível.
- Margem sobre a venda e ganho sobre o custo.
- Relatório mensal, exportação CSV e impressão/PDF.
- Estornos com motivo e responsável, sem apagar o registro original.
- Arquivamento de produtos com saldo zero.
- Equipe: cada pessoa entra com o próprio e-mail; a administração autoriza, define permissões e bloqueia acessos.
- Histórico de alterações e backup em JSON para a administração.
- Interface responsiva para computador e celular.

## Tecnologias

| Parte | Ferramenta |
|---|---|
| Interface | React, TypeScript, Vite |
| Servidor e hospedagem | Cloudflare Workers (com arquivos estáticos) |
| Login | Supabase Auth (e-mail e senha, confirmação, recuperação) |
| Banco de dados | Supabase PostgreSQL |
| Testes | Node.js + PGlite (PostgreSQL local em memória) |

## Estrutura

```
src/          interface (App.tsx, login em main.tsx, cálculos em metrics.ts)
worker/       API: autenticação, permissões, validações e movimentações
migrations/   scripts SQL do banco, em ordem
tests/        testes automatizados com SQL real
public/       arquivos estáticos (ícone)
docs/         instalação, permissões e regras de estoque
```

## Rodando localmente

Requer Node.js 22 ou mais recente.

```bash
npm ci
npm test          # testes com PostgreSQL local, sem acessar o banco real
npm run check     # verificação de tipos
npm run build     # exige o arquivo .env (veja .env.example)
npm run preview   # servidor local com a API; exige .dev.vars
```

## Configuração

| Arquivo / local | Conteúdo | Público? |
|---|---|---|
| `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Sim, vão para o navegador |
| `.dev.vars` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (teste local) | Não |
| Segredos do Worker no Cloudflare | Os mesmos três valores, para produção | Não |

A chave `service_role` nunca deve ter o prefixo `VITE_` nem ser enviada ao repositório.

Passo a passo completo em [docs/instalacao.md](docs/instalacao.md).
Permissões e regras de estoque em [docs/permissoes-e-regras.md](docs/permissoes-e-regras.md).

## Segurança

- O Worker valida o token de login e exige e-mail confirmado.
- Permissões são conferidas no servidor e novamente dentro da transação no banco.
- Sem permissão de custos, o servidor remove custos e margens das respostas.
- As tabelas e funções do banco não são acessíveis pelas chaves públicas.
- Versionamento impede que uma alteração sobrescreva outra feita ao mesmo tempo.

## Limitações conhecidas

- Uma loja por conta e uma administração por loja.
- Sem tela de ajuste manual de saldo nem de desarquivamento.
- Estorno apenas da última movimentação válida de cada produto.
- Estoque e histórico ficam em um documento versionado por loja, adequado a pequeno volume. Históricos grandes vão exigir tabelas separadas e paginação.
- Atualização da tela a cada 30 segundos e ao voltar para a aba (sem tempo real).
