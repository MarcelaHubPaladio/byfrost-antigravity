-- Fix foreign key constraint for assigned_user_id to reference users_profile instead of auth.users
alter table public.cases drop constraint if exists cases_assigned_user_id_fkey;

alter table public.cases 
add constraint cases_assigned_user_id_fkey 
foreign key (assigned_user_id) 
references public.users_profile(user_id) 
on delete set null;
