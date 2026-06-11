# Viola PDV

Sistema profissional para trailer/lanchonete com caixa, estoque, vendas, auditoria e relatorios.

## Stack

- Next.js App Router
- TypeScript
- TailwindCSS
- Supabase Auth
- Supabase/PostgreSQL com RLS
- Deploy na Vercel

## Estrutura

```txt
src/app/login                 Login com Supabase Auth
src/app/(app)/caixa           PDV, abertura e fechamento de caixa
src/app/(app)/admin           Dashboard administrativo
src/app/(app)/estoque         Produtos e movimentacoes de estoque
src/app/(app)/relatorios      Relatorios, auditoria e cancelamentos
src/lib/supabase              Clientes SSR/browser e proxy de sessao
src/lib/auth.ts               Protecao de rotas e permissao por cargo
src/components                Componentes reutilizaveis de interface
supabase/schema.sql           Schema completo PostgreSQL/Supabase
```

## Configuracao local

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

Projetos antigos tambem podem usar `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Primeiro admin

Crie o usuario no painel Supabase Auth. Depois rode no SQL Editor:

```sql
update public.users
set role = 'admin', name = 'Administrador'
where email = 'email-do-admin@exemplo.com';
```

Os demais usuarios podem ficar como `caixa` ou ser alterados pelo banco enquanto uma tela de gestao de funcionarios nao for adicionada.

## Atualizacao de caixa

Para projetos que ja estavam rodando antes da refinada de conferencia de dinheiro, execute no SQL Editor:

```txt
supabase/cash-refinement-migration.sql
```

Essa migracao cria `cash_movements`, adiciona `cash_difference` em `cash_registers` e ativa a funcao `register_cash_movement` para registrar entrada e saida manual de dinheiro no caixa.

## Atualizacao de estoque

Para habilitar estoque maximo e o modo "preparado sem estoque" nos produtos ja existentes, execute o `supabase/schema.sql` atualizado no SQL Editor.

Categorias como lanches, batatas, comidas, porcoes, pratos, marmitas, pizzas, pasteis e combos passam a ser tratadas como produtos preparados:

- nao pedem quantidade inicial;
- nao entram em estoque minimo/maximo;
- nao bloqueiam venda por quantidade zerada;
- continuam registrando venda, custo e lucro.

## Atualizacao operacional do PDV

Para habilitar fechamento detalhado, maquininhas, credito/debito e status de preparo, execute no SQL Editor:

```txt
supabase/pdv-erp-refactor-migration.sql
```

Essa migracao adiciona:

- status de preparo: aguardando, preparando, pronto e entregue;
- credito/debito e maquininha nas vendas de cartao;
- fechamento com dinheiro, credito, debito, PIX e observacoes;
- tabela de fechamento individual por maquininha;
- funcoes transacionais para venda, conferencia e atualizacao do preparo.

## Integridade e seguranca

Depois das migrations anteriores, execute no SQL Editor:

```txt
supabase/integrity-hardening-migration.sql
```

Ela impede novos produtos duplicados por nome e categoria e bloqueia cancelamentos
que alterariam caixas ja fechados.

## Rodar

```bash
npm install
npm run dev
```

Validacoes locais:

```bash
npm test
npm run lint
npm run build
```

Abra `http://localhost:3000`.

## Deploy na Vercel

1. Suba o repositorio para o GitHub.
2. Importe na Vercel como projeto Next.js.
3. Configure as mesmas variaveis do `.env.local`.
4. Faça o deploy.

## Seguranca implementada

- `proxy.ts` renova sessao Supabase e redireciona rotas protegidas sem login.
- Server Components e Server Actions revalidam usuario e cargo no backend.
- Rotas admin usam `requireAdmin()`.
- RLS ativo em todas as tabelas expostas.
- Funcoes SQL transacionais registram venda, baixa de estoque, caixa e auditoria juntas.
- Cancelamento somente admin, com devolucao automatica ao estoque.
- Logs registram login, logout, vendas, cancelamentos, estoque e alteracoes de preco.
