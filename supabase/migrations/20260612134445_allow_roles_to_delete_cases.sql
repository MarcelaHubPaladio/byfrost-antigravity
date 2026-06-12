-- Migration to allow financeiro, admin, and lider (leader) to delete cases
drop policy if exists cases_delete on public.cases;

create policy cases_delete on public.cases
for delete to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = cases.tenant_id 
          and up.role in ('admin', 'financeiro', 'lider', 'leader')
    )
);
