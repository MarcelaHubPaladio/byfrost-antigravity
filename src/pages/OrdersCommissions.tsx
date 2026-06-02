import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { FileText, ArrowLeft, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CommissionsTab } from "@/components/finance/FinancialLedgerPanel/CommissionsTab";
import { CommissionReportDialog } from "@/components/case/CommissionReportDialog";
import { useTenant } from "@/providers/TenantProvider";

export default function OrdersCommissions() {
  const { activeTenantId } = useTenant();
  const [isCommissionDialogOpen, setIsCommissionDialogOpen] = useState(false);

  // Queries for the dialog
  const vendorsQ = useQuery({
    queryKey: ["vendors", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").eq("tenant_id", activeTenantId!).is("deleted_at", null);
      return data ?? [];
    },
  });

  const usersQ = useQuery({
    queryKey: ["users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data } = await supabase.from("users_profile").select("*").eq("tenant_id", activeTenantId!).is("deleted_at", null);
      return data ?? [];
    },
  });

  const casesQ = useQuery({
    queryKey: ["cases", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("*, assigned_vendor:vendors!cases_assigned_vendor_id_fkey(*), users_profile:users_profile!fk_cases_users_profile(*)")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  const customersQ = useQuery({
    queryKey: ["customers", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data } = await supabase.from("customer_accounts").select("*").eq("tenant_id", activeTenantId!).is("deleted_at", null);
      const map = new Map();
      if (data) data.forEach((c) => map.set(c.id, c));
      return map;
    },
  });

  // Re-creating the fields mapping logic used in Orders.tsx just to know if it is "Faturado"
  // But ideally the Dialog should compute that or we provide the raw data.
  // We'll simplify and fetch case_custom_field_values here.
  const caseDataQ = useQuery({
    queryKey: ["cases_data_for_commissions", activeTenantId, casesQ.data?.length],
    enabled: Boolean(activeTenantId && casesQ.data && casesQ.data.length > 0),
    queryFn: async () => {
      const caseIds = casesQ.data!.map(c => c.id);
      const CHUNK_SIZE = 200;
      const chunks = [];
      for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) chunks.push(caseIds.slice(i, i + CHUNK_SIZE));

      const fields = new Map();
      const totals = new Map();

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase.from("case_fields").select("case_id,key,value_text").in("case_id", chunk),
          supabase.from("case_items").select("case_id,total").in("case_id", chunk)
        ]);
        
        if (fRes.data) {
          fRes.data.forEach(d => {
            if (!fields.has(d.case_id)) fields.set(d.case_id, {});
            const obj = fields.get(d.case_id);
            if (d.key === "billing_status") obj.billing_status = d.value_text;
            if (d.key === "billing_date" || d.key === "data_faturamento") obj.billing_date = d.value_text;
          });
        }
        
        if (iRes.data) {
          iRes.data.forEach(d => {
            const current = totals.get(d.case_id) || 0;
            totals.set(d.case_id, current + (Number(d.total) || 0));
          });
        }
      }));

      return { fields, totals };
    },
  });

  return (
    <AppShell>
      <div className="flex-1 overflow-auto bg-slate-50/50">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2 text-slate-500">
                  <Link to="/app/orders">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <div className="flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider">
                  <FileText className="w-3 h-3" />
                  Gestão
                </div>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Extrato de Comissões</h1>
              <p className="text-slate-500 mt-1">Gerencie os fechamentos, edite descrições e gere PDFs de comissões.</p>
            </div>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 px-6 shadow-sm shadow-indigo-200"
              onClick={() => setIsCommissionDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Fechamento
            </Button>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
            <CommissionsTab allowEdit={true} allowDelete={true} />
          </div>
        </div>
      </div>

      <CommissionReportDialog
        open={isCommissionDialogOpen}
        onOpenChange={setIsCommissionDialogOpen}
        vendors={vendorsQ.data || []}
        users={usersQ.data || []}
        cases={casesQ.data || []}
        caseDataFields={caseDataQ.data?.fields || new Map()}
        caseDataTotals={caseDataQ.data?.totals || new Map()}
        customers={customersQ.data || new Map()}
      />
    </AppShell>
  );
}
