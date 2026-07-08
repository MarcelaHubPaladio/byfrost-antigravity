-- Adiciona coluna para números de teste da BeeIA
ALTER TABLE public.wa_instances ADD COLUMN IF NOT EXISTS beeia_test_numbers text[] DEFAULT '{}';
