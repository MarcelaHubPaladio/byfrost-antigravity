-- Migration: Add commissions and discounts
-- Date: 2026-04-07
-- Description: Adds meta_json to users_profile for commission rules and discount fields to case_items.

-- 1. users_profile
ALTER TABLE public.users_profile 
ADD COLUMN IF NOT EXISTS meta_json jsonb DEFAULT '{}'::jsonb;

-- 2. case_items
ALTER TABLE public.case_items
ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_percent numeric,
ADD COLUMN IF NOT EXISTS commission_value numeric;

-- 3. cases (general discounts and total commission)
ALTER TABLE public.cases
ADD COLUMN IF NOT EXISTS total_discount_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_commission_value numeric DEFAULT 0;
