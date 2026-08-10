-- Adicionar tipo de documento
ALTER TABLE public.employee_payslips
ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'payslip';
