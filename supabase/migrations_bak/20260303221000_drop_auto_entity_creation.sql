-- Remove automatic entity creation trigger
drop trigger if exists trg_customer_accounts_ensure_entity on public.customer_accounts;
