begin;

alter table public.products
  add column if not exists max_stock numeric(12, 3) not null default 0 check (max_stock >= 0);

drop index if exists public.idx_products_low_stock;
create index if not exists idx_products_low_stock
  on public.products(active, quantity, min_stock, max_stock);

insert into public.audit_logs (action, entity, metadata)
values (
  'schema.stock_max_added',
  'products',
  jsonb_build_object('column', 'max_stock')
);

commit;
