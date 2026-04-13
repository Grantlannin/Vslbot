-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Pipeline stages (one row per client per stage_id)
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  stage_id integer not null,
  output text,
  status text,
  updated_at timestamptz not null default now(),
  constraint pipeline_stages_client_id_stage_id_key unique (client_id, stage_id)
);

create index pipeline_stages_client_id_idx on public.pipeline_stages (client_id);

alter table public.clients enable row level security;
alter table public.pipeline_stages enable row level security;

-- Allow anon (NEXT_PUBLIC_SUPABASE_ANON_KEY) full access; tighten policies in production.
create policy "clients_anon_all"
  on public.clients
  for all
  to anon
  using (true)
  with check (true);

create policy "clients_authenticated_all"
  on public.clients
  for all
  to authenticated
  using (true)
  with check (true);

create policy "pipeline_stages_anon_all"
  on public.pipeline_stages
  for all
  to anon
  using (true)
  with check (true);

create policy "pipeline_stages_authenticated_all"
  on public.pipeline_stages
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.clients to anon, authenticated;
grant select, insert, update, delete on table public.pipeline_stages to anon, authenticated;
