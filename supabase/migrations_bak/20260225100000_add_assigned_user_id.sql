-- Add assigned_user_id to cases
alter table public.cases
add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

-- Optional: try to match existing vendors to users by phone number
-- and migrate assigned_vendor_id to assigned_user_id
do $$
declare
    rcd record;
begin
    -- For each case with a vendor
    for rcd in 
        select c.id as case_id, v.phone_e164 
        from public.cases c 
        join public.vendors v on c.assigned_vendor_id = v.id 
        where c.assigned_vendor_id is not null and c.assigned_user_id is null
    loop
        if rcd.phone_e164 is not null then
            -- Find a matching user profile constraint by tenant is implicitly handled but good to point out we just match ANY user with that phone
            update public.cases c
            set assigned_user_id = u.user_id
            from public.users_profile u
            where u.phone_e164 = rcd.phone_e164
              and c.id = rcd.case_id
              and u.tenant_id = c.tenant_id;
        end if;
    end loop;
end;
$$;
