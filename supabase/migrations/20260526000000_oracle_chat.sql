create table if not exists public.oracle_chats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger oracle_chats_touch before update on public.oracle_chats for each row execute function public.touch_updated_at();
create index if not exists oracle_chats_tenant_idx on public.oracle_chats(tenant_id);

alter table public.oracle_chats enable row level security;

DO $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_chats' and policyname = 'oracle_chats_select') then
    create policy oracle_chats_select on public.oracle_chats for select to authenticated using (public.has_tenant_access(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_chats' and policyname = 'oracle_chats_insert') then
    create policy oracle_chats_insert on public.oracle_chats for insert to authenticated with check (public.has_tenant_access(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_chats' and policyname = 'oracle_chats_update') then
    create policy oracle_chats_update on public.oracle_chats for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_chats' and policyname = 'oracle_chats_delete') then
    create policy oracle_chats_delete on public.oracle_chats for delete to authenticated using (public.has_tenant_access(tenant_id));
  end if;
end
$do$;

create table if not exists public.oracle_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.oracle_chats(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists oracle_messages_chat_idx on public.oracle_messages(chat_id);

alter table public.oracle_messages enable row level security;

DO $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_messages' and policyname = 'oracle_messages_select') then
    create policy oracle_messages_select on public.oracle_messages for select to authenticated 
    using (exists (select 1 from public.oracle_chats c where c.id = chat_id and public.has_tenant_access(c.tenant_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oracle_messages' and policyname = 'oracle_messages_insert') then
    create policy oracle_messages_insert on public.oracle_messages for insert to authenticated 
    with check (exists (select 1 from public.oracle_chats c where c.id = chat_id and public.has_tenant_access(c.tenant_id)));
  end if;
end
$do$;
