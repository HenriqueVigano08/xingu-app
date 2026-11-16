# Permissões e regras de estoque

## Equipe

A administração autoriza um e-mail em **Equipe** e escolhe as permissões. O botão não envia convite: a pessoa recebe o link do app, faz o cadastro com o e-mail autorizado e confirma o e-mail. Cadastro sem autorização não dá acesso ao estoque.

Para bloquear: **Equipe → Editar acesso → desmarcar Acesso ativo → Salvar permissões**. O servidor recusa as próximas requisições, mesmo com a tela aberta. A administração não pode ser bloqueada nem rebaixada por essa tela.

## Permissões

| Permissão | O que libera |
|---|---|
| Consulta básica (todo membro ativo) | Produtos, quantidades, preços de venda e histórico de movimentações. |
| Ver custos, margens e lucros | Custos e cálculos financeiros. Sem ela, o servidor remove esses valores das respostas. |
| Cadastrar, editar e arquivar produtos | Nome, código, categoria e mínimo; arquivar itens zerados. Exige ver custos. Novo produto exige também alterar preços. |
| Alterar preços e conceder descontos | Mudar o preço do produto e vender por outro valor. Sem ela, a venda usa o preço cadastrado. |
| Registrar compras / entradas | Entrada de mercadoria. Exige ver custos. |
| Registrar vendas | Saída por venda, limitada ao saldo. |
| Consultar relatórios | Resumo e histórico mensal. |
| Exportar relatórios | Botões CSV e PDF. Exige consultar relatórios. |
| Estornar movimentações | Desfazer a última movimentação válida de um produto. Exige ver custos. |
| Administração | Tudo acima, equipe, histórico de alterações e backup. |

As permissões são conferidas no servidor; alterar a tela pelo navegador não concede acesso. A exportação pode ser restringida, mas quem vê os dados pode copiá-los.

## Cálculos

- **Custo médio ponderado:** `(saldo × custo atual + quantidade comprada × custo da compra) ÷ novo saldo`.
- **Margem:** `(preço de venda − custo) ÷ preço de venda`.
- **Ganho sobre custo:** `(preço de venda − custo) ÷ custo`.
- **Lucro bruto:** vendas menos o custo das unidades vendidas. Não desconta impostos, taxas, frete ou despesas fixas.
- **Estoque inicial** é o saldo existente no cadastro e não conta como compra do mês.

## Estornos

- Só a última movimentação ainda válida de cada produto pode ser estornada. Para desfazer uma anterior, estorne primeiro as posteriores.
- O estorno exige motivo, registra o responsável e restaura saldo e custo anteriores.
- O registro original é preservado. No relatório, a venda continua no mês original e o estorno é descontado no mês em que foi feito.
- Movimentações da versão 1, sem fotografia do saldo anterior, não podem ser estornadas automaticamente.

## Arquivamento e backup

- Só produtos com saldo zero podem ser arquivados; o histórico permanece.
- O backup JSON (Configurações) contém produtos, movimentações e histórico. Ele não restaura contas nem permissões automaticamente.
