begin;

do $$
begin
  create type public.cash_movement_type as enum ('entrada', 'saida');
exception
  when duplicate_object then null;
end $$;

alter table public.cash_registers
add column if not exists cash_difference numeric(12, 2) not null default 0;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  movement_type public.cash_movement_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_movements_register_created
  on public.cash_movements(cash_register_id, created_at desc);

create index if not exists idx_cash_movements_created_at
  on public.cash_movements(created_at desc);

alter table public.cash_movements enable row level security;

grant select, insert, update, delete on public.cash_movements to authenticated;

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

grant execute on function public.register_cash_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;

commit;
