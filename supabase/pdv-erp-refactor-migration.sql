begin;

do $$
begin
  create type public.preparation_status as enum ('aguardando', 'preparando', 'pronto', 'entregue');
exception
  when duplicate_object then null;
end $$;

alter table public.sales
  add column if not exists card_type text check (card_type is null or card_type in ('credito', 'debito')),
  add column if not exists card_machine text,
  add column if not exists preparation_status public.preparation_status not null default 'aguardando';

alter table public.cash_registers
  add column if not exists closing_cash_amount numeric(12, 2) not null default 0 check (closing_cash_amount >= 0),
  add column if not exists closing_credit_amount numeric(12, 2) not null default 0 check (closing_credit_amount >= 0),
  add column if not exists closing_debit_amount numeric(12, 2) not null default 0 check (closing_debit_amount >= 0),
  add column if not exists closing_pix_amount numeric(12, 2) not null default 0 check (closing_pix_amount >= 0),
  add column if not exists closing_total_amount numeric(12, 2) not null default 0 check (closing_total_amount >= 0),
  add column if not exists closing_card_difference numeric(12, 2) not null default 0,
  add column if not exists closing_pix_difference numeric(12, 2) not null default 0,
  add column if not exists closing_total_difference numeric(12, 2) not null default 0;

create table if not exists public.cash_terminal_closings (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  terminal_name text not null,
  credit_amount numeric(12, 2) not null default 0 check (credit_amount >= 0),
  debit_amount numeric(12, 2) not null default 0 check (debit_amount >= 0),
  pix_amount numeric(12, 2) not null default 0 check (pix_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_register_payment
  on public.sales(cash_register_id, status, payment_method, card_type);

create index if not exists idx_sales_preparation_status
  on public.sales(preparation_status, created_at desc);

create index if not exists idx_cash_terminal_closings_register
  on public.cash_terminal_closings(cash_register_id, created_at desc);

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'products',
      'cash_registers',
      'sales',
      'sale_items',
      'cash_movements',
      'cash_terminal_closings'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;

alter table public.cash_terminal_closings enable row level security;

grant select, insert, update, delete on public.cash_terminal_closings to authenticated;

drop policy if exists "cash_terminal_closings_select_own_or_admin" on public.cash_terminal_closings;
create policy "cash_terminal_closings_select_own_or_admin"
on public.cash_terminal_closings for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.cash_registers cr
    where cr.id = cash_register_id
      and cr.user_id = (select auth.uid())
  )
);

drop policy if exists "cash_terminal_closings_insert_own_or_admin" on public.cash_terminal_closings;
create policy "cash_terminal_closings_insert_own_or_admin"
on public.cash_terminal_closings for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.cash_registers cr
    where cr.id = cash_register_id
      and (cr.user_id = (select auth.uid()) or public.is_admin())
  )
);

create or replace function public.finalize_sale(
  p_cash_register_id uuid,
  p_payment_method public.payment_method,
  p_card_type text default null,
  p_card_machine text default null,
  p_items jsonb default '[]'::jsonb
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
  v_card_type text := nullif(trim(coalesce(p_card_type, '')), '');
  v_card_machine text := nullif(trim(coalesce(p_card_machine, '')), '');
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

  if p_payment_method = 'cartao' and v_card_type not in ('credito', 'debito') then
    raise exception 'Informe credito ou debito para cartao.';
  end if;

  if p_payment_method <> 'cartao' then
    v_card_type := null;
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
    payment_method,
    card_type,
    card_machine,
    preparation_status
  )
  values (
    p_cash_register_id,
    v_user_id,
    p_payment_method,
    v_card_type,
    v_card_machine,
    'aguardando'
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
      'payment_method', p_payment_method,
      'card_type', v_card_type,
      'card_machine', v_card_machine
    )
  );

  return v_sale_id;
end;
$$;

create or replace function public.close_cash_register_detailed(
  p_cash_register_id uuid,
  p_closing_cash_amount numeric,
  p_closing_credit_amount numeric default 0,
  p_closing_debit_amount numeric default 0,
  p_closing_pix_amount numeric default 0,
  p_terminal_rows jsonb default '[]'::jsonb,
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
  v_expected_credit numeric(12, 2) := 0;
  v_expected_debit numeric(12, 2) := 0;
  v_expected_pix numeric(12, 2) := 0;
  v_terminal record;
  v_total_counted numeric(12, 2);
  v_total_expected numeric(12, 2);
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

  if least(
    p_closing_cash_amount,
    p_closing_credit_amount,
    p_closing_debit_amount,
    p_closing_pix_amount
  ) < 0 then
    raise exception 'Valores de fechamento invalidos.';
  end if;

  select
    coalesce(sum(total_amount) filter (
      where status = 'completed'
        and payment_method = 'cartao'
        and card_type = 'credito'
    ), 0),
    coalesce(sum(total_amount) filter (
      where status = 'completed'
        and payment_method = 'cartao'
        and (card_type = 'debito' or card_type is null)
    ), 0),
    coalesce(sum(total_amount) filter (
      where status = 'completed'
        and payment_method = 'pix'
    ), 0)
  into v_expected_credit, v_expected_debit, v_expected_pix
  from public.sales
  where cash_register_id = p_cash_register_id;

  v_total_counted :=
    round(p_closing_cash_amount, 2)
    + round(p_closing_credit_amount, 2)
    + round(p_closing_debit_amount, 2)
    + round(p_closing_pix_amount, 2);
  v_total_expected :=
    v_register.expected_amount
    + v_expected_credit
    + v_expected_debit
    + v_expected_pix;

  update public.cash_registers
  set status = 'closed',
      closed_at = now(),
      closing_amount = round(p_closing_cash_amount, 2),
      closing_cash_amount = round(p_closing_cash_amount, 2),
      closing_credit_amount = round(p_closing_credit_amount, 2),
      closing_debit_amount = round(p_closing_debit_amount, 2),
      closing_pix_amount = round(p_closing_pix_amount, 2),
      closing_total_amount = v_total_counted,
      cash_difference = round(p_closing_cash_amount - v_register.expected_amount, 2),
      closing_card_difference = round(
        p_closing_credit_amount + p_closing_debit_amount - v_expected_credit - v_expected_debit,
        2
      ),
      closing_pix_difference = round(p_closing_pix_amount - v_expected_pix, 2),
      closing_total_difference = round(v_total_counted - v_total_expected, 2),
      notes = concat_ws(E'\n', notes, p_notes)
  where id = p_cash_register_id;

  delete from public.cash_terminal_closings
  where cash_register_id = p_cash_register_id;

  for v_terminal in
    select *
    from jsonb_to_recordset(coalesce(p_terminal_rows, '[]'::jsonb)) as x(
      terminal_name text,
      credit_amount numeric,
      debit_amount numeric,
      pix_amount numeric
    )
  loop
    if coalesce(trim(v_terminal.terminal_name), '') <> ''
      or coalesce(v_terminal.credit_amount, 0) > 0
      or coalesce(v_terminal.debit_amount, 0) > 0
      or coalesce(v_terminal.pix_amount, 0) > 0 then
      insert into public.cash_terminal_closings (
        cash_register_id,
        user_id,
        terminal_name,
        credit_amount,
        debit_amount,
        pix_amount
      )
      values (
        p_cash_register_id,
        v_user_id,
        coalesce(nullif(trim(v_terminal.terminal_name), ''), 'Maquininha'),
        round(greatest(coalesce(v_terminal.credit_amount, 0), 0), 2),
        round(greatest(coalesce(v_terminal.debit_amount, 0), 0), 2),
        round(greatest(coalesce(v_terminal.pix_amount, 0), 0), 2)
      );
    end if;
  end loop;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'cash_register.close_detailed',
    'cash_registers',
    p_cash_register_id,
    jsonb_build_object(
      'closing_cash_amount', p_closing_cash_amount,
      'closing_credit_amount', p_closing_credit_amount,
      'closing_debit_amount', p_closing_debit_amount,
      'closing_pix_amount', p_closing_pix_amount,
      'expected_cash_amount', v_register.expected_amount,
      'expected_credit_amount', v_expected_credit,
      'expected_debit_amount', v_expected_debit,
      'expected_pix_amount', v_expected_pix,
      'total_difference', round(v_total_counted - v_total_expected, 2),
      'terminal_rows', p_terminal_rows,
      'notes', p_notes
    )
  );
end;
$$;

create or replace function public.update_sale_preparation_status(
  p_sale_id uuid,
  p_status public.preparation_status
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
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select role into v_role
  from public.users
  where id = v_user_id and status = 'active';

  if v_role not in ('admin', 'caixa') then
    raise exception 'Usuario sem permissao para atualizar preparo.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada.';
  end if;

  if v_sale.user_id <> v_user_id and v_role <> 'admin' then
    raise exception 'Sem permissao para atualizar este pedido.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Venda cancelada nao entra no preparo.';
  end if;

  update public.sales
  set preparation_status = p_status
  where id = p_sale_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (
    v_user_id,
    'sale.preparation_status',
    'sales',
    p_sale_id,
    jsonb_build_object('from', v_sale.preparation_status, 'to', p_status)
  );
end;
$$;

grant execute on function public.finalize_sale(uuid, public.payment_method, text, text, jsonb) to authenticated;
grant execute on function public.close_cash_register_detailed(uuid, numeric, numeric, numeric, numeric, jsonb, text) to authenticated;
grant execute on function public.update_sale_preparation_status(uuid, public.preparation_status) to authenticated;

commit;
