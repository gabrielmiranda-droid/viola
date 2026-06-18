begin;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  order_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'printed', 'error')),
  attempts integer not null default 0 check (attempts >= 0),
  logs text[] not null default '{}'::text[],
  error_message text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  printed_at timestamptz
);

create index if not exists idx_print_jobs_status_created
  on public.print_jobs(status, created_at);

alter table public.print_jobs enable row level security;

grant select, insert, update on public.print_jobs to authenticated;

drop policy if exists "print_jobs_select_admin" on public.print_jobs;
create policy "print_jobs_select_admin"
on public.print_jobs for select
to authenticated
using (public.is_admin());

drop policy if exists "print_jobs_insert_authenticated" on public.print_jobs;
create policy "print_jobs_insert_authenticated"
on public.print_jobs for insert
to authenticated
with check (created_by = (select auth.uid()) or public.is_admin());

commit;
