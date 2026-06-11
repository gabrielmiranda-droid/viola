begin;

create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$
begin
  create type public.user_role as enum ('admin', 'caixa');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.user_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum ('pix', 'dinheiro', 'cartao');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.sale_status as enum ('completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.cash_register_status as enum ('open', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.stock_movement_type as enum ('entrada', 'saida', 'ajuste', 'cancelamento');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.cash_movement_type as enum ('entrada', 'saida');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role public.user_role not null default 'caixa',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  quantity numeric(12, 3) not null default 0 check (quantity >= 0),
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12, 2) not null default 0 check (sale_price >= 0),
  min_stock numeric(12, 3) not null default 0 check (min_stock >= 0),
  max_stock numeric(12, 3) not null default 0 check (max_stock >= 0),
  track_stock boolean not null default true,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists max_stock numeric(12, 3) not null default 0 check (max_stock >= 0);

alter table public.products
  add column if not exists track_stock boolean not null default true;

update public.products
set track_stock = false,
    quantity = 0,
    min_stock = 0,
    max_stock = 0
where lower(unaccent(category)) like any (array[
  '%lanche%',
  '%batata%',
  '%comida%',
  '%porcao%',
  '%prato%',
  '%marmita%',
  '%hamburg%',
  '%burger%',
  '%cachorro%',
  '%hot dog%',
  '%pastel%',
  '%pizza%',
  '%salgado%',
  '%combo%'
]);

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(12, 2) not null default 0 check (opening_amount >= 0),
  closing_amount numeric(12, 2) check (closing_amount >= 0),
  expected_amount numeric(12, 2) not null default 0 check (expected_amount >= 0),
  cash_difference numeric(12, 2) not null default 0,
  sales_amount numeric(12, 2) not null default 0 check (sales_amount >= 0),
  status public.cash_register_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  gross_profit numeric(12, 2) not null default 0,
  payment_method public.payment_method not null,
  status public.sale_status not null default 'completed',
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  product_category_snapshot text not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  movement_type public.stock_movement_type not null,
  quantity numeric(12, 3) not null,
  quantity_before numeric(12, 3) not null,
  quantity_after numeric(12, 3) not null check (quantity_after >= 0),
  unit_cost numeric(12, 2),
  sale_id uuid references public.sales(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  movement_type public.cash_movement_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_low_stock on public.products(active, track_stock, quantity, min_stock, max_stock);
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sales_user_id on public.sales(user_id);
create index if not exists idx_sales_cash_register_id on public.sales(cash_register_id);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_stock_movements_product_created on public.stock_movements(product_id, created_at desc);
create index if not exists idx_cash_movements_register_created on public.cash_movements(cash_register_id, created_at desc);
create index if not exists idx_cash_movements_created_at on public.cash_movements(created_at desc);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create unique index if not exists idx_one_open_cash_register_per_user
  on public.cash_registers(user_id)
  where status = 'open';

create or replace function public.prevent_duplicate_product()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_key text :=
    lower(unaccent(regexp_replace(trim(new.category), '\s+', ' ', 'g')))
    || '::'
    || lower(unaccent(regexp_replace(trim(new.name), '\s+', ' ', 'g')));
begin
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  if exists (
    select 1
    from public.products product
    where product.id <> new.id
      and lower(unaccent(regexp_replace(trim(product.name), '\s+', ' ', 'g')))
        = lower(unaccent(regexp_replace(trim(new.name), '\s+', ' ', 'g')))
      and lower(unaccent(regexp_replace(trim(product.category), '\s+', ' ', 'g')))
        = lower(unaccent(regexp_replace(trim(new.category), '\s+', ' ', 'g')))
  ) then
    raise exception 'Ja existe um produto com este nome nesta categoria.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_product on public.products;
create trigger prevent_duplicate_product
before insert or update of name, category on public.products
for each row execute function public.prevent_duplicate_product();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_cash_registers_updated_at on public.cash_registers;
create trigger set_cash_registers_updated_at
before update on public.cash_registers
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role := 'caixa';
begin
  if new.raw_user_meta_data->>'role' in ('admin', 'caixa') then
    v_role := (new.raw_user_meta_data->>'role')::public.user_role;
  end if;

  insert into public.users (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role
  )
  on conflict (id) do update
  set email = excluded.email,
      name = coalesce(nullif(public.users.name, ''), excluded.name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.users
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'::public.user_role;
$$;

create or replace function public.audit_product_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cost_price is distinct from new.cost_price
    or old.sale_price is distinct from new.sale_price then
    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (
      coalesce(new.updated_by, auth.uid()),
      'product.price_change',
      'products',
      new.id,
      jsonb_build_object(
        'old_cost_price', old.cost_price,
        'new_cost_price', new.cost_price,
        'old_sale_price', old.sale_price,
        'new_sale_price', new.sale_price
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_product_price_change on public.products;
create trigger audit_product_price_change
after update of cost_price, sale_price on public.products
for each row execute function public.audit_product_price_change();

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.cash_registers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_movements enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

drop policy if exists "users_select_own_or_admin" on public.users;
create policy "users_select_own_or_admin"
on public.users for select
to authenticated
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "users_admin_manage" on public.users;
create policy "users_admin_manage"
on public.users for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
on public.products for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert"
on public.products for insert
to authenticated
with check (public.is_admin());

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update"
on public.products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete"
on public.products for delete
to authenticated
using (public.is_admin());

drop policy if exists "cash_registers_select_own_or_admin" on public.cash_registers;
create policy "cash_registers_select_own_or_admin"
on public.cash_registers for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "cash_registers_insert_own" on public.cash_registers;
create policy "cash_registers_insert_own"
on public.cash_registers for insert
to authenticated
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "cash_registers_update_own_or_admin" on public.cash_registers;
create policy "cash_registers_update_own_or_admin"
on public.cash_registers for update
to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "sales_select_own_or_admin" on public.sales;
create policy "sales_select_own_or_admin"
on public.sales for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "sales_insert_own" on public.sales;
create policy "sales_insert_own"
on public.sales for insert
to authenticated
with check (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "sales_admin_update" on public.sales;
create policy "sales_admin_update"
on public.sales for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "sale_items_select_own_or_admin" on public.sale_items;
create policy "sale_items_select_own_or_admin"
on public.sale_items for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.sales s
    where s.id = sale_id
      and s.user_id = (select auth.uid())
  )
);

drop policy if exists "sale_items_admin_insert" on public.sale_items;
create policy "sale_items_admin_insert"
on public.sale_items for insert
to authenticated
with check (public.is_admin());

drop policy if exists "stock_movements_select_own_or_admin" on public.stock_movements;
create policy "stock_movements_select_own_or_admin"
on public.stock_movements for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "stock_movements_admin_insert" on public.stock_movements;
create policy "stock_movements_admin_insert"
on public.stock_movements for insert
to authenticated
with check (public.is_admin());

drop policy if exists "cash_movements_select_own_or_admin" on public.cash_movements;
create policy "cash_movements_select_own_or_admin"
on public.cash_movements for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "cash_movements_insert_own_register" on public.cash_movements;
create policy "cash_movements_insert_own_register"
on public.cash_movements for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.cash_registers cr
    where cr.id = cash_register_id
      and cr.user_id = (select auth.uid())
      and cr.status = 'open'
  )
);

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs for select
to authenticated
using (public.is_admin());

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs for insert
to authenticated
with check (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.open_cash_register(
  p_opening_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_register_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role not in ('admin', 'caixa') then
    raise exception 'Usuario sem permissao para abrir caixa.';
  end if;

  if p_opening_amount < 0 then
    raise exception 'Valor inicial invalido.';
  end if;

  if exists (
    select 1 from public.cash_registers
    where user_id = v_user_id and status = 'open'
  ) then
    raise exception 'Ja existe um caixa aberto para este usuario.';
  end if;

  insert into public.cash_registers (
    user_id,
    opening_amount,
    expected_amount,
    notes
  )
  values (
    v_user_id,
    round(p_opening_amount, 2),
    round(p_opening_amount, 2),
    p_notes
  )
  returning id into v_register_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'cash_register.open',
    'cash_registers',
    v_register_id,
    jsonb_build_object('opening_amount', p_opening_amount, 'notes', p_notes)
  );

  return v_register_id;
end;
$$;

create or replace function public.close_cash_register(
  p_cash_register_id uuid,
  p_closing_amount numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_register public.cash_registers%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  select * into v_register
  from public.cash_registers
  where id = p_cash_register_id
  for update;

  if not found then
    raise exception 'Caixa nao encontrado.';
  end if;

  if v_register.user_id <> v_user_id and v_role <> 'admin' then
    raise exception 'Sem permissao para fechar este caixa.';
  end if;

  if v_register.status <> 'open' then
    raise exception 'Este caixa ja esta fechado.';
  end if;

  if p_closing_amount < 0 then
    raise exception 'Valor de fechamento invalido.';
  end if;

  update public.cash_registers
  set status = 'closed',
      closed_at = now(),
      closing_amount = round(p_closing_amount, 2),
      cash_difference = round(p_closing_amount - v_register.expected_amount, 2),
      notes = concat_ws(E'\n', notes, p_notes)
  where id = p_cash_register_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'cash_register.close',
    'cash_registers',
    p_cash_register_id,
    jsonb_build_object(
      'closing_amount', p_closing_amount,
      'expected_amount', v_register.expected_amount,
      'difference', round(p_closing_amount - v_register.expected_amount, 2),
      'notes', p_notes
    )
  );
end;
$$;

create or replace function public.register_cash_movement(
  p_cash_register_id uuid,
  p_movement_type public.cash_movement_type,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_register public.cash_registers%rowtype;
  v_delta numeric(12, 2);
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role not in ('admin', 'caixa') then
    raise exception 'Usuario sem permissao para movimentar caixa.';
  end if;

  if p_amount <= 0 then
    raise exception 'Valor deve ser maior que zero.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo da movimentacao.';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_cash_register_id
  for update;

  if not found then
    raise exception 'Caixa nao encontrado.';
  end if;

  if v_register.status <> 'open' then
    raise exception 'Caixa fechado.';
  end if;

  if v_register.user_id <> v_user_id and v_role <> 'admin' then
    raise exception 'Sem permissao para movimentar este caixa.';
  end if;

  v_delta := case
    when p_movement_type = 'entrada' then round(p_amount, 2)
    else -round(p_amount, 2)
  end;

  if v_register.expected_amount + v_delta < 0 then
    raise exception 'Saida maior que o dinheiro esperado no caixa.';
  end if;

  insert into public.cash_movements (
    cash_register_id,
    user_id,
    movement_type,
    amount,
    reason
  )
  values (
    p_cash_register_id,
    v_user_id,
    p_movement_type,
    round(p_amount, 2),
    trim(p_reason)
  )
  returning id into v_movement_id;

  update public.cash_registers
  set expected_amount = expected_amount + v_delta
  where id = p_cash_register_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'cash_movement.' || p_movement_type::text,
    'cash_movements',
    v_movement_id,
    jsonb_build_object(
      'cash_register_id', p_cash_register_id,
      'amount', round(p_amount, 2),
      'delta', v_delta,
      'reason', trim(p_reason),
      'expected_before', v_register.expected_amount,
      'expected_after', v_register.expected_amount + v_delta
    )
  );

  return v_movement_id;
end;
$$;

create or replace function public.finalize_sale(
  p_cash_register_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_register public.cash_registers%rowtype;
  v_sale_id uuid;
  v_item record;
  v_product public.products%rowtype;
  v_before numeric(12, 3);
  v_after numeric(12, 3);
  v_line_total numeric(12, 2);
  v_line_cost numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_total_cost numeric(12, 2) := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role not in ('admin', 'caixa') then
    raise exception 'Usuario sem permissao para vender.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Venda sem itens.';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_cash_register_id
  for update;

  if not found then
    raise exception 'Caixa nao encontrado.';
  end if;

  if v_register.status <> 'open' then
    raise exception 'Caixa fechado.';
  end if;

  if v_register.user_id <> v_user_id then
    raise exception 'Venda deve ser registrada no caixa do proprio usuario.';
  end if;

  insert into public.sales (
    cash_register_id,
    user_id,
    payment_method
  )
  values (
    p_cash_register_id,
    v_user_id,
    p_payment_method
  )
  returning id into v_sale_id;

  for v_item in
    select product_id, sum(quantity) as quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by product_id
  loop
    if v_item.quantity <= 0 then
      raise exception 'Quantidade invalida.';
    end if;

    select * into v_product
    from public.products
    where id = v_item.product_id and active = true
    for update;

    if not found then
      raise exception 'Produto indisponivel.';
    end if;

    if v_product.track_stock and v_product.quantity < v_item.quantity then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;

    v_before := v_product.quantity;
    v_after := case
      when v_product.track_stock then v_before - v_item.quantity
      else v_before
    end;
    v_line_total := round(v_product.sale_price * v_item.quantity, 2);
    v_line_cost := round(v_product.cost_price * v_item.quantity, 2);
    v_total := v_total + v_line_total;
    v_total_cost := v_total_cost + v_line_cost;

    insert into public.sale_items (
      sale_id,
      product_id,
      product_name_snapshot,
      product_category_snapshot,
      quantity,
      unit_price,
      unit_cost,
      total_price,
      total_cost
    )
    values (
      v_sale_id,
      v_product.id,
      v_product.name,
      v_product.category,
      v_item.quantity,
      v_product.sale_price,
      v_product.cost_price,
      v_line_total,
      v_line_cost
    );

    if v_product.track_stock then
      update public.products
      set quantity = v_after,
          updated_by = v_user_id
      where id = v_product.id;

      insert into public.stock_movements (
        product_id,
        user_id,
        movement_type,
        quantity,
        quantity_before,
        quantity_after,
        unit_cost,
        sale_id,
        reason
      )
      values (
        v_product.id,
        v_user_id,
        'saida',
        -v_item.quantity,
        v_before,
        v_after,
        v_product.cost_price,
        v_sale_id,
        'Venda'
      );
    end if;
  end loop;

  update public.sales
  set total_amount = v_total,
      total_cost = v_total_cost,
      gross_profit = v_total - v_total_cost
  where id = v_sale_id;

  update public.cash_registers
  set sales_amount = sales_amount + v_total,
      expected_amount = case
        when p_payment_method = 'dinheiro' then expected_amount + v_total
        else expected_amount
      end
  where id = p_cash_register_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'sale.create',
    'sales',
    v_sale_id,
    jsonb_build_object(
      'total_amount', v_total,
      'total_cost', v_total_cost,
      'gross_profit', v_total - v_total_cost,
      'payment_method', p_payment_method
    )
  );

  return v_sale_id;
end;
$$;

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_sale public.sales%rowtype;
  v_register public.cash_registers%rowtype;
  v_item public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_before numeric(12, 3);
  v_after numeric(12, 3);
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role <> 'admin' then
    raise exception 'Somente admin pode cancelar venda.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada.';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Venda ja cancelada.';
  end if;

  select * into v_register
  from public.cash_registers
  where id = v_sale.cash_register_id
  for update;

  if v_register.status = 'closed' then
    raise exception 'Reabra ou estorne contabilmente o caixa antes de cancelar esta venda.';
  end if;

  for v_item in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if v_product.track_stock then
      v_before := v_product.quantity;
      v_after := v_before + v_item.quantity;

      update public.products
      set quantity = v_after,
          updated_by = v_user_id
      where id = v_product.id;

      insert into public.stock_movements (
        product_id,
        user_id,
        movement_type,
        quantity,
        quantity_before,
        quantity_after,
        unit_cost,
        sale_id,
        reason
      )
      values (
        v_product.id,
        v_user_id,
        'cancelamento',
        v_item.quantity,
        v_before,
        v_after,
        v_item.unit_cost,
        p_sale_id,
        p_reason
      );
    end if;
  end loop;

  update public.sales
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancellation_reason = p_reason
  where id = p_sale_id;

  update public.cash_registers
  set sales_amount = greatest(0, sales_amount - v_sale.total_amount),
      expected_amount = case
        when v_sale.payment_method = 'dinheiro' then greatest(0, expected_amount - v_sale.total_amount)
        else expected_amount
      end
  where id = v_sale.cash_register_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'sale.cancel',
    'sales',
    p_sale_id,
    jsonb_build_object(
      'reason', p_reason,
      'total_amount', v_sale.total_amount,
      'original_user_id', v_sale.user_id
    )
  );
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity_delta numeric,
  p_movement_type public.stock_movement_type,
  p_reason text,
  p_unit_cost numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_product public.products%rowtype;
  v_delta numeric(12, 3);
  v_before numeric(12, 3);
  v_after numeric(12, 3);
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role <> 'admin' then
    raise exception 'Somente admin pode movimentar estoque manualmente.';
  end if;

  if p_movement_type = 'cancelamento' then
    raise exception 'Cancelamento de estoque deve vir do cancelamento da venda.';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'Quantidade nao pode ser zero.';
  end if;

  v_delta := p_quantity_delta;

  if p_movement_type = 'saida' and v_delta > 0 then
    v_delta := -v_delta;
  end if;

  if p_movement_type = 'entrada' and v_delta < 0 then
    raise exception 'Entrada deve ter quantidade positiva.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto nao encontrado.';
  end if;

  if not v_product.track_stock then
    raise exception 'Produto preparado nao usa movimentacao de estoque.';
  end if;

  v_before := v_product.quantity;
  v_after := v_before + v_delta;

  if v_after < 0 then
    raise exception 'Movimento deixaria estoque negativo.';
  end if;

  update public.products
  set quantity = v_after,
      cost_price = coalesce(p_unit_cost, cost_price),
      updated_by = v_user_id
  where id = p_product_id;

  insert into public.stock_movements (
    product_id,
    user_id,
    movement_type,
    quantity,
    quantity_before,
    quantity_after,
    unit_cost,
    reason
  )
  values (
    p_product_id,
    v_user_id,
    p_movement_type,
    v_delta,
    v_before,
    v_after,
    p_unit_cost,
    p_reason
  );

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'stock.adjust',
    'products',
    p_product_id,
    jsonb_build_object(
      'movement_type', p_movement_type,
      'quantity_delta', v_delta,
      'quantity_before', v_before,
      'quantity_after', v_after,
      'reason', p_reason,
      'unit_cost', p_unit_cost
    )
  );
end;
$$;

grant execute on function public.open_cash_register(numeric, text) to authenticated;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;
grant execute on function public.register_cash_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;
grant execute on function public.finalize_sale(uuid, public.payment_method, jsonb) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, public.stock_movement_type, text, numeric) to authenticated;

commit;
