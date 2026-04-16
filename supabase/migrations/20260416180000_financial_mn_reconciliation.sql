-- Support for Many-to-Many reconciliation links
-- Allows a single bank transaction to be linked to multiple planning records (e.g., Original + Adjustments)

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    transaction_id UUID NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
    payable_id UUID REFERENCES public.financial_payables(id) ON DELETE CASCADE,
    receivable_id UUID REFERENCES public.financial_receivables(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT one_of_two_links CHECK (
        (payable_id IS NOT NULL AND receivable_id IS NULL) OR
        (payable_id IS NULL AND receivable_id IS NOT NULL)
    ),
    -- Prevent duplicate links of the same pair
    CONSTRAINT unique_link_payable UNIQUE (transaction_id, payable_id),
    CONSTRAINT unique_link_receivable UNIQUE (transaction_id, receivable_id)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS financial_reconciliation_links_tenant_idx ON public.financial_reconciliation_links(tenant_id);
CREATE INDEX IF NOT EXISTS financial_reconciliation_links_transaction_idx ON public.financial_reconciliation_links(transaction_id);
CREATE INDEX IF NOT EXISTS financial_reconciliation_links_payable_idx ON public.financial_reconciliation_links(payable_id);
CREATE INDEX IF NOT EXISTS financial_reconciliation_links_receivable_idx ON public.financial_reconciliation_links(receivable_id);

-- Enable RLS
ALTER TABLE public.financial_reconciliation_links ENABLE ROW LEVEL SECURITY;

DO $do$
begin
  if not exists (select 1 from pg_policy where polname = 'Tenant access for reconciliation links') then
    create policy "Tenant access for reconciliation links" on public.financial_reconciliation_links
      for all to authenticated using (public.has_tenant_access(tenant_id));
  end if;
end
$do$;

-- Migrate existing data from financial_transactions
INSERT INTO public.financial_reconciliation_links (tenant_id, transaction_id, payable_id, amount)
SELECT tenant_id, id, linked_payable_id, amount 
FROM public.financial_transactions 
WHERE linked_payable_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.financial_reconciliation_links (tenant_id, transaction_id, receivable_id, amount)
SELECT tenant_id, id, linked_receivable_id, amount 
FROM public.financial_transactions 
WHERE linked_receivable_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update the reconciliation RPC to support many links
CREATE OR REPLACE FUNCTION public.financial_reconcile_transaction(
  p_tenant_id uuid,
  p_transaction_id uuid,
  p_linked_id uuid,
  p_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_amount numeric;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Get transaction amount
  select amount into v_amount from public.financial_transactions where id = p_transaction_id and tenant_id = p_tenant_id;

  if p_type = 'payable' then
    -- Link via new table
    insert into public.financial_reconciliation_links (tenant_id, transaction_id, payable_id, amount)
    values (p_tenant_id, p_transaction_id, p_linked_id, v_amount)
    on conflict (transaction_id, payable_id) do update set amount = v_amount;

    -- For backward compatibility, also update the main column
    update public.financial_transactions
       set linked_payable_id = p_linked_id,
           linked_receivable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    update public.financial_payables
       set status = 'paid'
     where id = p_linked_id and tenant_id = p_tenant_id;

  elsif p_type = 'receivable' then
    -- Link via new table
    insert into public.financial_reconciliation_links (tenant_id, transaction_id, receivable_id, amount)
    values (p_tenant_id, p_transaction_id, p_linked_id, v_amount)
    on conflict (transaction_id, receivable_id) do update set amount = v_amount;

    -- For backward compatibility, also update the main column
    update public.financial_transactions
       set linked_receivable_id = p_linked_id,
           linked_payable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    update public.financial_receivables
       set status = 'paid'
     where id = p_linked_id and tenant_id = p_tenant_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
