alter type public.payment_method add value if not exists 'cartao_alimentacao';
alter type public.payment_method add value if not exists 'cartao_refeicao';

alter table public.sales
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_neighborhood text,
  add column if not exists delivery_reference text,
  add column if not exists order_notes text,
  add column if not exists order_type text not null default 'retirada',
  add column if not exists delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  add column if not exists delivery_driver text;

alter table public.sale_items
  add column if not exists modifiers jsonb not null default '[]'::jsonb,
  add column if not exists item_notes text;

create or replace function public.finalize_sale(
  p_cash_register_id uuid,
  p_payment_method public.payment_method,
  p_card_type text default null,
  p_card_machine text default null,
  p_items jsonb default '[]'::jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_delivery_neighborhood text default null,
  p_delivery_reference text default null,
  p_order_notes text default null,
  p_order_type text default 'retirada',
  p_delivery_fee numeric default 0,
  p_delivery_driver text default null
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
  v_order_type text := nullif(trim(coalesce(p_order_type, '')), '');
  v_delivery_fee numeric(12, 2) := greatest(0, round(coalesce(p_delivery_fee, 0), 2));
  v_delivery_driver text := nullif(trim(coalesce(p_delivery_driver, '')), '');
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

  if v_order_type not in ('retirada', 'local', 'entrega') then
    raise exception 'Tipo de atendimento invalido.';
  end if;

  if v_order_type <> 'entrega' then
    v_delivery_fee := 0;
    v_delivery_driver := null;
    p_delivery_address := null;
    p_delivery_neighborhood := null;
    p_delivery_reference := null;
  end if;

  if v_order_type = 'entrega' and v_delivery_driver is null then
    raise exception 'Informe o motoboy da entrega.';
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
    preparation_status,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_neighborhood,
    delivery_reference,
    order_notes,
    order_type,
    delivery_fee,
    delivery_driver
  )
  values (
    p_cash_register_id,
    v_user_id,
    p_payment_method,
    v_card_type,
    v_card_machine,
    'aguardando',
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    nullif(trim(coalesce(p_delivery_neighborhood, '')), ''),
    nullif(trim(coalesce(p_delivery_reference, '')), ''),
    nullif(trim(coalesce(p_order_notes, '')), ''),
    v_order_type,
    v_delivery_fee,
    v_delivery_driver
  )
  returning id into v_sale_id;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(
      product_id uuid,
      quantity numeric,
      modifiers jsonb,
      item_notes text
    )
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
      total_cost,
      modifiers,
      item_notes
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
      v_line_cost,
      coalesce(v_item.modifiers, '[]'::jsonb),
      nullif(trim(coalesce(v_item.item_notes, '')), '')
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
  set total_amount = v_total + v_delivery_fee,
      total_cost = v_total_cost,
      gross_profit = (v_total + v_delivery_fee) - v_total_cost
  where id = v_sale_id;

  update public.cash_registers
  set sales_amount = sales_amount + v_total + v_delivery_fee,
      expected_amount = case
        when p_payment_method = 'dinheiro' then expected_amount + v_total + v_delivery_fee
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
      'total_amount', v_total + v_delivery_fee,
      'total_cost', v_total_cost,
      'gross_profit', (v_total + v_delivery_fee) - v_total_cost,
      'payment_method', p_payment_method,
      'card_type', v_card_type,
      'card_machine', v_card_machine,
      'order_type', v_order_type,
      'delivery_fee', v_delivery_fee,
      'delivery_driver', v_delivery_driver,
      'customer_name', nullif(trim(coalesce(p_customer_name, '')), ''),
      'customer_phone', nullif(trim(coalesce(p_customer_phone, '')), ''),
      'delivery_address', nullif(trim(coalesce(p_delivery_address, '')), ''),
      'delivery_neighborhood', nullif(trim(coalesce(p_delivery_neighborhood, '')), '')
    )
  );

  return v_sale_id;
end;
$$;

grant execute on function public.finalize_sale(
  uuid,
  public.payment_method,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text
) to authenticated;
