-- Clean up orphaned assignments before creating the constraint
update public.cases c
set assigned_user_id = null
where c.assigned_user_id is not null
  and not exists (
    select 1 from public.users_profile p 
    where p.user_id = c.assigned_user_id 
      and p.tenant_id = c.tenant_id
  );

-- Add foreign key relationship if it doesn't exist
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_cases_users_profile'
    ) then
        alter table public.cases
        add constraint fk_cases_users_profile
        foreign key (assigned_user_id, tenant_id)
        references public.users_profile (user_id, tenant_id)
        on delete set null;
    end if;
end $$;
