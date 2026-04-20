-- =============================================================================
-- BYFROST — SIMULADOR DE FINANCIAMENTO IMOBILIÁRIO
-- Idempotent migration: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Toggle do módulo no modules_json (não faz backfill — off por padrão)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'tenants'
       AND column_name  = 'modules_json'
  ) THEN
    ALTER TABLE public.tenants ADD COLUMN modules_json jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Campos de perfil financeiro/pessoal em core_entities (party)
-- -----------------------------------------------------------------------------
ALTER TABLE public.core_entities
  ADD COLUMN IF NOT EXISTS birth_date              date,
  ADD COLUMN IF NOT EXISTS marital_status          text,       -- solteiro, casado, divorciado, viuvo, uniao_estavel
  ADD COLUMN IF NOT EXISTS has_minor_children      boolean,
  ADD COLUMN IF NOT EXISTS fgts_years              numeric,    -- anos de FGTS acumulado
  ADD COLUMN IF NOT EXISTS is_public_servant       boolean,
  ADD COLUMN IF NOT EXISTS gross_income            numeric,    -- renda bruta mensal (R$)
  ADD COLUMN IF NOT EXISTS income_commitment_pct   numeric,    -- % renda já comprometida
  ADD COLUMN IF NOT EXISTS cpf                     text;       -- CPF (party)

-- -----------------------------------------------------------------------------
-- 3) financing_bank_rules — regras de custo do dinheiro por banco
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financing_bank_rules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_name     text        NOT NULL,
  bank_code     text        NOT NULL,   -- ex: CEF, BRA, ITA, SAN
  base_rate_pct numeric     NOT NULL CHECK (base_rate_pct >= 0),
  -- rate_rules_json: array of rule objects:
  -- [{ "label": "Servidor Público", "condition": "is_public_servant", "rate_bonus_pct": -0.1 },
  --  { "label": "FGTS > 3 anos",    "condition": "fgts_years_gt_3",   "rate_bonus_pct": -0.2 },
  --  { "label": "Idade < 30",       "condition": "age_lt_30",         "rate_bonus_pct": -0.05 },
  --  { "label": "Idade 51+",        "condition": "age_gte_51",        "rate_bonus_pct": 0.20  }]
  rate_rules_json jsonb     NOT NULL DEFAULT '[]'::jsonb,
  -- tac_json: { "fixed": 3800, "pct_of_loan": null }
  tac_json        jsonb     NOT NULL DEFAULT '{}'::jsonb,
  min_loan_value  numeric,
  max_loan_value  numeric,
  max_term_months integer,
  is_active       boolean   NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS financing_bank_rules_tenant_idx
  ON public.financing_bank_rules(tenant_id)
  WHERE deleted_at IS NULL;

SELECT public.byfrost_enable_rls('public.financing_bank_rules'::regclass);
SELECT public.byfrost_ensure_tenant_policies('public.financing_bank_rules'::regclass, 'tenant_id');
SELECT public.byfrost_ensure_updated_at_trigger('public.financing_bank_rules'::regclass, 'trg_financing_bank_rules_updated_at');

-- -----------------------------------------------------------------------------
-- 4) financing_simulations — cada proposta/simulação gerada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financing_simulations (
  id                     uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid   NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id              uuid,  -- FK opcional → core_entities
  bank_rule_id           uuid   REFERENCES public.financing_bank_rules(id) ON DELETE SET NULL,
  created_by             uuid   REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_number       text,  -- gerado automaticamente
  status                 text   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','archived')),

  -- Snapshot dos dados do cliente no momento da simulação
  client_snapshot_json   jsonb  NOT NULL DEFAULT '{}'::jsonb,
  -- { name, cpf, birth_date, gross_income, marital_status, has_minor_children,
  --   fgts_years, is_public_servant, income_commitment_pct }

  -- Parâmetros de entrada
  simulation_params_json jsonb  NOT NULL DEFAULT '{}'::jsonb,
  -- { property_value, down_payment, fgts_amount, loan_value, term_months,
  --   bank_name, bank_code, effective_rate_pct, amortization: "SAC"|"PRICE"|"BOTH" }

  -- Resultados calculados
  results_json           jsonb  NOT NULL DEFAULT '{}'::jsonb,
  -- { sac: { first_payment, last_payment, total_paid, total_interest, insurance_monthly },
  --   price: { monthly_payment, total_paid, total_interest, insurance_monthly },
  --   tac, cet_estimate_pct, min_income_required, fgts_applied }

  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,

  CONSTRAINT financing_simulations_entity_fk
    FOREIGN KEY (tenant_id, entity_id)
    REFERENCES public.core_entities(tenant_id, id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS financing_simulations_tenant_idx
  ON public.financing_simulations(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS financing_simulations_entity_idx
  ON public.financing_simulations(tenant_id, entity_id)
  WHERE entity_id IS NOT NULL AND deleted_at IS NULL;

SELECT public.byfrost_enable_rls('public.financing_simulations'::regclass);
SELECT public.byfrost_ensure_tenant_policies('public.financing_simulations'::regclass, 'tenant_id');
SELECT public.byfrost_ensure_updated_at_trigger('public.financing_simulations'::regclass, 'trg_financing_simulations_updated_at');

-- -----------------------------------------------------------------------------
-- 5) Auto-gerar reference_number
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_financing_simulations_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_seq text;
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    v_seq := to_char(now(), 'YYMM') ||
             '-' ||
             upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
    NEW.reference_number := v_seq;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financing_simulations_reference ON public.financing_simulations;
CREATE TRIGGER trg_financing_simulations_reference
  BEFORE INSERT ON public.financing_simulations
  FOR EACH ROW EXECUTE FUNCTION public.trg_financing_simulations_reference();

-- -----------------------------------------------------------------------------
-- 6) RBAC — registrar rotas na route_registry
-- -----------------------------------------------------------------------------
INSERT INTO public.route_registry(key, label, description)
VALUES
  ('app.financing_simulator',          'Simulador de Financiamento',       'Acesso às simulações de financiamento imobiliário'),
  ('app.financing_simulator.settings', 'Config. Bancos (Financiamento)',    'Configurar regras de bancos do simulador de financiamento')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7) Seed de bancos padrão — inserção global (tenant_id da 1ª migration é feita por tenant)
-- Obs: os bancos são inseridos por tenant quando o módulo é ativado pela 1ª vez,
-- ou o admin cria manualmente via UI. Não fazemos seed global aqui.
-- -----------------------------------------------------------------------------

-- Fim da migration
