-- Add account_id to financial plan tables
-- and foreign key constraints for bank_accounts

ALTER TABLE public.financial_receivables
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.financial_payables
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- Indices for filtering performance
CREATE INDEX IF NOT EXISTS financial_receivables_account_id_idx ON public.financial_receivables(account_id);
CREATE INDEX IF NOT EXISTS financial_payables_account_id_idx ON public.financial_payables(account_id);
