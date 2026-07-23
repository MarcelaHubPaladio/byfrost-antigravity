-- Create crm_labels table
CREATE TABLE IF NOT EXISTS "public"."crm_labels" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "color" text NOT NULL DEFAULT '#E2E8F0',
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "crm_labels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_labels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Create case_labels table
CREATE TABLE IF NOT EXISTS "public"."case_labels" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "case_id" uuid NOT NULL,
    "label_id" uuid NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "case_labels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_labels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "case_labels_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE,
    CONSTRAINT "case_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "public"."crm_labels"("id") ON DELETE CASCADE,
    CONSTRAINT "case_labels_unique" UNIQUE ("case_id", "label_id")
);

-- RLS
ALTER TABLE "public"."crm_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."case_labels" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for users in same tenant" ON "public"."crm_labels" FOR SELECT USING (
    has_tenant_access_v2(tenant_id)
);

CREATE POLICY "Enable all for users in same tenant" ON "public"."crm_labels" FOR ALL USING (
    has_tenant_access_v2(tenant_id)
) WITH CHECK (
    has_tenant_access_v2(tenant_id)
);


CREATE POLICY "Enable read for users in same tenant" ON "public"."case_labels" FOR SELECT USING (
    has_tenant_access_v2(tenant_id)
);

CREATE POLICY "Enable all for users in same tenant" ON "public"."case_labels" FOR ALL USING (
    has_tenant_access_v2(tenant_id)
) WITH CHECK (
    has_tenant_access_v2(tenant_id)
);
