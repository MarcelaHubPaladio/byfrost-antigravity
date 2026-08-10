ALTER TABLE public.employee_payslips 
ADD COLUMN IF NOT EXISTS autentique_document_id TEXT,
ADD COLUMN IF NOT EXISTS signing_link TEXT,
ADD COLUMN IF NOT EXISTS autentique_status TEXT;
