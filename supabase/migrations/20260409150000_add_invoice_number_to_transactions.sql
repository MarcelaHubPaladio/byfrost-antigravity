-- Add invoice_number column to financial_transactions
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS invoice_number text;

-- Add index for search optimization if needed
CREATE INDEX IF NOT EXISTS idx_financial_transactions_invoice_number ON public.financial_transactions(invoice_number);
