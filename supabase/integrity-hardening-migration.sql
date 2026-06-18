begin;

create extension if not exists unaccent;

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

-- unaccent() is STABLE, so PostgreSQL does not allow it in an index
-- expression. The trigger above enforces the same accent-insensitive
-- uniqueness rule and uses an advisory lock to protect concurrent writes.
drop index if exists public.idx_products_unique_normalized_name_category;

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
        trim(p_reason)
      );
    end if;
  end loop;

  update public.sales
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancellation_reason = trim(p_reason)
  where id = p_sale_id;

  update public.cash_registers
  set sales_amount = greatest(0, sales_amount - v_sale.total_amount),
      expected_amount = case
        when v_sale.payment_method = 'dinheiro'
          then greatest(0, expected_amount - v_sale.total_amount)
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
      'reason', trim(p_reason),
      'total_amount', v_sale.total_amount,
      'original_user_id', v_sale.user_id
    )
  );
end;
$$;

grant execute on function public.cancel_sale(uuid, text) to authenticated;

commit;
