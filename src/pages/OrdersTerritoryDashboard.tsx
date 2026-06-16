import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { OrdersTerritoryMap } from "@/components/orders/OrdersTerritoryMap";
import { Link } from "react-router-dom";
import { DateRangePickerCustom } from "@/components/ui/date-range-picker-custom";
import { startOfMonth, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { ArrowLeft } from "lucide-react";
// Componente simples para tela cheia (TV / Totem)
export default function OrdersTerritoryDashboard() {
  const { activeTenantId } = useTenant();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date())
  });

  // Fetch journey
  const journeyQ = useQuery({
    queryKey: ["journey_orders_dashboard", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id,key")
        .eq("key", "sales_order")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const selectedJourney = journeyQ.data;

  // Fetch active cases
  const casesQ = useQuery({
    queryKey: ["cases_orders_dashboard", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney?.id),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,title,status,state,created_at,assigned_user_id,assigned_vendor_id,users_profile:users_profile!fk_cases_users_profile(display_name,email),assigned_vendor:vendors!cases_assigned_vendor_id_fkey(display_name),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const journeyRowsAll = casesQ.data ?? [];
  const journeyRows = journeyRowsAll.filter((r: any) => {
    if (!dateRange || !dateRange.from) return true;
    const cd = new Date(r.created_at);
    if (cd < dateRange.from) return false;
    if (dateRange.to && cd > dateRange.to) return false;
    return true;
  });

  const caseIdsForLookup = journeyRows.map(r => r.id);

  const caseDataQ = useQuery({
    queryKey: ["orders_case_fields_dashboard", activeTenantId, journeyRows.length, journeyRows[0]?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length > 0),
    refetchInterval: 10_000,
    queryFn: async () => {
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIdsForLookup.length; i += CHUNK_SIZE) {
        chunks.push(caseIdsForLookup.slice(i, i + CHUNK_SIZE));
      }

      const allFields: any[] = [];
      const allItems: any[] = [];

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase
            .from("case_fields")
            .select("case_id,key,value_text")
            .in("case_id", chunk)
            .in("key", ["billing_status", "partial_paid_value"])
            .limit(1000),
          supabase
            .from("case_items")
            .select("case_id,total")
            .in("case_id", chunk)
        ]);

        if (fRes.data) allFields.push(...fRes.data);
        if (iRes.data) allItems.push(...iRes.data);
      }));

      const fieldMap = new Map<string, any>();
      for (const r of allFields) {
        const cid = r.case_id;
        if (!fieldMap.has(cid)) fieldMap.set(cid, {});
        fieldMap.get(cid)[r.key] = r.value_text;
      }

      const totalsMap = new Map<string, number>();
      for (const itm of allItems) {
        const cid = itm.case_id;
        const val = Number(itm.total || 0);
        totalsMap.set(cid, (totalsMap.get(cid) || 0) + val);
      }

      return { fields: fieldMap, totals: totalsMap };
    }
  });

  // Tela de loading
  if (!activeTenantId || journeyQ.isLoading || casesQ.isLoading || caseDataQ.isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />
      </div>
    );
  }

  // A tela principal renderiza o mapa ocupando 100vw e 100vh.
  // Como as telas TV podem estar tanto na horizontal (1920x1080) quanto vertical (1080x1920),
  // flex-col md:flex-row garante adaptação baseada no width via Media Query.
  // Vamos passar isFullscreen={true} para o componente ocultar as bordas extras e barras de busca se for preciso.
  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 text-slate-100 flex relative">
      <div className="absolute top-6 left-6 z-[1000] flex items-center gap-4">
        <Link 
          to="/app/orders" 
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full shadow-lg border border-slate-700 backdrop-blur-md transition-colors text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Pedidos
        </Link>
        
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full shadow-lg px-2 flex items-center h-9">
          <DateRangePickerCustom date={dateRange} setDate={setDateRange} className="bg-transparent border-none text-white hover:text-white hover:bg-slate-800 h-8" />
        </div>
      </div>
      <div className="flex-1 w-full h-full p-4">
        <OrdersTerritoryMap 
          cases={journeyRows} 
          caseFields={caseDataQ.data?.fields}
          caseTotals={caseDataQ.data?.totals}
          isFullscreen={true} 
        />
      </div>
    </div>
  );
}
