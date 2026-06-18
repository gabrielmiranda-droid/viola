# Viola PDV

Sistema profissional para trailer/lanchonete com PDV, caixa, estoque, impressao, auditoria e relatorios.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- TailwindCSS 4
- Supabase Auth + PostgreSQL com RLS
- Framer Motion, Lucide React, Zod
- Deploy na Vercel

## Funcionalidades

**PDV (Caixa)**
- Catalogo de produtos com busca por categoria e subcategoria
- Carrinho com modificadores e observacoes por item
- Formas de pagamento: PIX, dinheiro, credito, debito, alimentacao, refeicao
- Tipos de atendimento: retirada, local e entrega (com motoboy e taxa)
- Dados do cliente: nome, telefone, endereco, bairro e referencia
- Status de preparo: aguardando, preparando, pronto, entregue
- Controle de estoque em tempo real

**Caixa**
- Abertura com valor inicial em dinheiro
- Movimentacoes manuais (entradas e saidas com motivo)
- Fechamento detalhado: dinheiro, credito, debito, PIX
- Conferencia por maquininha (Cielo, Stone, Mercado Pago etc.)
- Historico de fechamentos e reconciliacao

**Admin**
- Resumo diario: receita, custo, lucro e margem
- Vendas por funcionario e produtos mais vendidos
- Alertas de estoque baixo
- Cancelamento de vendas com devolucao automatica ao estoque
- Teste de impressao e monitoramento de print jobs
- Reset de dados historicos

**Estoque**
- Produtos com preco de custo, preco de venda e estoque min/max
- Movimentacoes: entrada, saida, ajuste
- Produtos preparados (lanches, batatas, pizzas etc.) nao consomem estoque
- Importacao em massa

**Impressao**
- Fila de impressao via tabela `print_jobs` no Supabase
- Servico Python autonomo que processa a fila
- Suporte a impressora Elgin i9 (USB) e modo mock (arquivos `.txt`)
- Tipos de cupom: cozinha, caixa, entrega

**Relatorios e Auditoria**
- Relatorio por dia e por funcionario
- Historico de cancelamentos
- Logs de todas as acoes (vendas, estoque, precos, login)

## Estrutura

```
src/app/login                 Login com Supabase Auth
src/app/(app)/caixa           PDV, abertura e fechamento de caixa
src/app/(app)/admin           Dashboard administrativo e impressao
src/app/(app)/estoque         Produtos e movimentacoes de estoque
src/app/(app)/relatorios      Relatorios, auditoria e cancelamentos
src/lib/supabase              Clientes SSR/browser e proxy de sessao
src/lib/auth.ts               Protecao de rotas e permissao por cargo
src/lib/cash.ts               Calculos de fluxo de caixa
src/lib/types.ts              Tipos TypeScript do sistema
src/components                Componentes reutilizaveis de interface
supabase/schema.sql           Schema completo PostgreSQL/Supabase
printer-service               Servico Python de impressao por fila
```

## Configuracao local

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute os arquivos na ordem abaixo (secao Migrations).
3. Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

Projetos antigos tambem podem usar `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

4. Instale e rode:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Primeiro admin

Crie o usuario no painel Supabase Auth. Depois rode no SQL Editor:

```sql
update public.users
set role = 'admin', name = 'Administrador'
where email = 'email-do-admin@exemplo.com';
```

Os demais usuarios podem ser cadastrados como `caixa` diretamente no banco enquanto uma tela de gestao de funcionarios nao for adicionada.

## Migrations

Execute no SQL Editor do Supabase nessa ordem para um banco novo ou para atualizar um existente. Todos os arquivos sao idempontentes (podem ser re-executados sem problema).

### 1. Schema base

```txt
supabase/schema.sql
```

Cria todas as tabelas, enums, RLS e funcoes base do sistema.

### 2. Refinamento de caixa

```txt
supabase/cash-refinement-migration.sql
```

Cria `cash_movements`, adiciona `cash_difference` em `cash_registers` e habilita `register_cash_movement` para entradas e saidas manuais de dinheiro.

### 3. Estoque maximo

```txt
supabase/stock-max-migration.sql
```

Habilita estoque maximo e o modo "preparado sem estoque" nos produtos. Categorias como lanches, batatas, pizzas e combos passam a nao bloquear venda por quantidade zerada.

### 4. Refatoracao do PDV

```txt
supabase/pdv-erp-refactor-migration.sql
```

Adiciona:
- Status de preparo (aguardando, preparando, pronto, entregue)
- Credito/debito e maquininha nas vendas de cartao
- Fechamento detalhado com dinheiro, credito, debito e PIX
- Tabela `cash_terminal_closings` para reconciliacao por maquininha
- Funcoes transacionais: `finalize_sale`, `close_cash_register_detailed`, `update_sale_preparation_status`

### 5. Integridade e seguranca

```txt
supabase/integrity-hardening-migration.sql
```

Impede produtos duplicados (mesmo nome e categoria) via trigger com lock advisory. Bloqueia cancelamentos em caixas ja fechados.

### 6. Fila de impressao

```txt
supabase/print-jobs-migration.sql
```

Cria a tabela `print_jobs` com RLS para a fila de impressao de pedidos.

### 7. Detalhes do pedido e entrega

```txt
supabase/order-details-printing-migration.sql
```

Adiciona:
- Formas de pagamento: `cartao_alimentacao` e `cartao_refeicao`
- Colunas em `sales`: cliente, telefone, endereco, bairro, referencia, observacoes, tipo de atendimento, taxa de entrega, motoboy
- Colunas em `sale_items`: `modifiers` (jsonb) e `item_notes`
- Nova versao de `finalize_sale` com todos os parametros de pedido/entrega

## Servico de impressao (printer-service)

Processo Python autonomo que monitora a fila `print_jobs` e envia para a impressora.

### Configuracao

```bash
cd printer-service
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env
```

Preencha o `.env`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
PRINTER_MODE=mock           # mock (desenvolvimento) ou usb (producao)
PRINTER_VENDOR_ID=0x...     # apenas para PRINTER_MODE=usb
PRINTER_PRODUCT_ID=0x...    # apenas para PRINTER_MODE=usb
```

### Executar

```bash
python main.py
```

**Modo mock**: gera arquivos `.txt` em `printer-service/printed_mock/` — ideal para desenvolvimento.

**Modo usb**: envia diretamente para a impressora Elgin i9 via USB.

O executavel Windows compilado fica em `printer-service/dist/`.

Fluxo:

```
Next.js cria print_jobs -> printer-service busca pendentes -> MockPrinter ou ElginPrinter
```

## Scripts

```bash
npm run dev     # Desenvolvimento local
npm run build   # Build de producao
npm start       # Rodar build de producao
npm run lint    # Verificar qualidade do codigo
npm test        # Testes (Vitest)
```

## Deploy na Vercel

1. Suba o repositorio para o GitHub.
2. Importe na Vercel como projeto Next.js.
3. Configure as mesmas variaveis do `.env.local`.
4. Faca o deploy.

## Seguranca

- Sessao Supabase renovada automaticamente pelo `proxy.ts` com redirecionamento de rotas protegidas.
- Server Components e Server Actions revalidam usuario e cargo no backend.
- Rotas admin usam `requireAdmin()`.
- RLS ativo em todas as tabelas expostas.
- Funcoes SQL transacionais: venda, baixa de estoque, caixa e auditoria em uma unica transacao.
- Cancelamento somente admin, com devolucao automatica ao estoque e log de auditoria.
- Trigger impede cadastro de produtos duplicados.
- Headers de seguranca configurados no `next.config.ts`.
- Logs de auditoria para login, logout, vendas, cancelamentos, ajustes de estoque e alteracoes de preco.
